import {
  NextRequest,
  NextResponse,
} from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";

import {
  supabaseAdmin,
} from "@/lib/supabaseAdmin";

type GrantRequest = {
  userId?: string;
  productId?:
    | string
    | number;
};

export async function POST(
  request: NextRequest
) {
  try {
    const authorization = await requireAdmin(request);
    if (authorization.response) return authorization.response;

    const body =
      (await request.json()) as GrantRequest;

    const userId =
      body.userId;

    const productId =
      Number(body.productId);

    if (
      !userId ||
      (typeof body.productId !== "string" &&
        typeof body.productId !== "number") ||
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Customer and a valid product ID are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      --------------------------------------------------
      4. VERIFY CUSTOMER EXISTS
      --------------------------------------------------
    */

    const {
      data: customerData,
      error: customerError,
    } =
      await supabaseAdmin.auth.admin
        .getUserById(userId);

    if (
      customerError ||
      !customerData.user
    ) {
      return NextResponse.json(
        {
          error:
            "Customer account not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
      --------------------------------------------------
      5. VERIFY PRODUCT EXISTS
      --------------------------------------------------
    */

    const {
      data: product,
      error: productError,
    } =
      await supabaseAdmin
        .from("products")
        .select(
          "id, name, slug"
        )
        .eq(
          "id",
          productId
        )
        .maybeSingle();

    if (productError) {
      console.error(
        "Product lookup failed:",
        productError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify product.",
        },
        {
          status: 500,
        }
      );
    }

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
      --------------------------------------------------
      6. PREVENT DUPLICATE ENTITLEMENT RECORDS
      --------------------------------------------------

      We deliberately do NOT automatically reactivate
      refunded or revoked ownership here.

      Restoring inactive ownership will eventually be a
      separate explicit admin operation.
    */

    const {
      data: existingEntitlement,
      error: existingError,
    } =
      await supabaseAdmin
        .from("entitlements")
        .select(
          "id, status, source"
        )
        .eq(
          "user_id",
          userId
        )
        .eq(
          "product_id",
          productId
        )
        .maybeSingle();

    if (existingError) {
      console.error(
        "Existing entitlement lookup failed:",
        existingError
      );

      return NextResponse.json(
        {
          error:
            "Unable to check existing ownership.",
        },
        {
          status: 500,
        }
      );
    }

    if (existingEntitlement) {
      return NextResponse.json(
        {
          error:
            `This customer already has an entitlement record for ${product.name}.`,
        },
        {
          status: 409,
        }
      );
    }

    /*
      --------------------------------------------------
      7. GRANT OWNERSHIP
      --------------------------------------------------
    */

    const {
      data: entitlement,
      error: insertError,
    } =
      await supabaseAdmin
        .from("entitlements")
        .insert({
          user_id:
            userId,

          product_id:
            productId,

          source:
            "admin",

          status:
            "active",

          granted_at:
            new Date().toISOString(),
        })
        .select(`
          id,
          user_id,
          product_id,
          source,
          status,
          granted_at,

          products!entitlements_product_id_fkey (
            id,
            name,
            slug
          )
        `)
        .single();

    if (insertError) {
      console.error(
        "Entitlement grant failed:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            "Unable to grant entitlement.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        entitlement,
        message:
          `${product.name} granted successfully.`,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Unexpected entitlement grant error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unexpected server error.",
      },
      {
        status: 500,
      }
    );
  }
}