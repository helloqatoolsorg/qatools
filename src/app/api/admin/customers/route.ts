import {
  NextRequest,
  NextResponse,
} from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";

import {
  supabaseAdmin,
} from "@/lib/supabaseAdmin";

export async function GET(
  request: NextRequest
) {
  try {
    const authorization = await requireAdmin(request);
    if (authorization.response) return authorization.response;

    const {
      data: authUsersData,
      error: authUsersError,
    } =
      await supabaseAdmin.auth.admin
        .listUsers({
          page: 1,
          perPage: 1000,
        });

    if (authUsersError) {
      console.error(
        "Auth user lookup failed:",
        authUsersError
      );

      return NextResponse.json(
        {
          error:
            "Unable to load customers.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      data: profiles,
      error: profilesError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "user_id, name, invoice_details"
        );

    if (profilesError) {
      console.error(
        "Profile lookup failed:",
        profilesError
      );

      return NextResponse.json(
        {
          error:
            "Unable to load customer profiles.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      data: entitlements,
      error: entitlementsError,
    } =
      await supabaseAdmin
        .from("entitlements")
        .select(`
          id,
          user_id,
          product_id,
          status,
          source,
          granted_at,

          products!entitlements_product_id_fkey (
            id,
            name,
            slug
          ),

          license_activations (
            id,
            machine_id,
            status,
            activated_at,
            released_at,
            released_by
          )
        `)
        .order(
          "granted_at",
          {
            ascending:
              false,
          }
        );

    if (entitlementsError) {
      console.error(
        "Entitlement lookup failed:",
        entitlementsError
      );

      return NextResponse.json(
        {
          error:
            "Unable to load entitlements.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      data: products,
      error: productsError,
    } =
      await supabaseAdmin
        .from("products")
        .select(`
          id,
          name,
          slug,
          published
        `)
        .order(
          "name",
          {
            ascending:
              true,
          }
        );

    if (productsError) {
      console.error(
        "Product lookup failed:",
        productsError
      );

      return NextResponse.json(
        {
          error:
            "Unable to load products.",
        },
        {
          status: 500,
        }
      );
    }

    const { data: accountActivations, error: activationError } = await supabaseAdmin
      .from("account_activations")
      .select("id, user_id, machine_id, status, activated_at, released_at, released_by")
      .order("activated_at", { ascending: false });
    if (activationError) {
      return NextResponse.json({ error: "Unable to load account machines. Check that the account-machine migration has been applied." }, { status: 500 });
    }
    const activationsByUserId = new Map<string, NonNullable<typeof accountActivations>>();
    for (const activation of accountActivations ?? []) {
      const records = activationsByUserId.get(activation.user_id) ?? [];
      records.push(activation);
      activationsByUserId.set(activation.user_id, records);
    }

    const profileByUserId =
      new Map(
        (profiles ?? []).map(
          (profile) => [
            profile.user_id,
            profile,
          ]
        )
      );

    const entitlementsByUserId =
      new Map<
        string,
        typeof entitlements
      >();

    for (
      const entitlement of
        entitlements ?? []
    ) {
      const existing =
        entitlementsByUserId.get(
          entitlement.user_id
        ) ?? [];

      existing.push(
        entitlement
      );

      entitlementsByUserId.set(
        entitlement.user_id,
        existing
      );
    }

    const customers =
      authUsersData.users.map(
        (authUser) => {
          const profile =
            profileByUserId.get(
              authUser.id
            );

          return {
            account_activations: activationsByUserId.get(authUser.id) ?? [],
            id:
              authUser.id,

            email:
              authUser.email ??
              null,

            emailConfirmedAt:
              authUser
                .email_confirmed_at ??
              null,

            createdAt:
              authUser.created_at,

            lastSignInAt:
              authUser
                .last_sign_in_at ??
              null,

            name:
              profile?.name ??
              null,

            invoiceDetails:
              profile
                ?.invoice_details ??
              null,

            entitlements:
              entitlementsByUserId.get(
                authUser.id
              ) ?? [],
          };
        }
      );

    return NextResponse.json(
      {
        customers,
        products:
          products ?? [],
      }
    );
  } catch (error) {
    console.error(
      "Unexpected admin customers error:",
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