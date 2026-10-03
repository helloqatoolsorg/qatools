import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authorization = await requireAdmin(request);
    if (authorization.response) return authorization.response;
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
    }
    const value = body && typeof body === "object" && "activationId" in body ? body.activationId : undefined;
    const activationId = typeof value === "number" || (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) ? Number(value) : NaN;
    if (!Number.isSafeInteger(activationId) || activationId <= 0) {
      return NextResponse.json({ error: "A valid activation ID is required." }, { status: 400 });
    }
    // One conditional UPDATE makes competing requests safe and never overwrites history.
    const { data, error } = await supabaseAdmin.from("account_activations")
      .update({ status: "released", released_at: new Date().toISOString(), released_by: authorization.user.id })
      .eq("id", activationId).eq("status", "active")
      .select("id, user_id, machine_id, status, activated_at, released_at, released_by")
      .maybeSingle();
    if (error) {
      console.error("Activation release failed:", error.code);
      return NextResponse.json({ error: "Unable to release this machine. Check that the account-machine migration has been applied." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "This activation is no longer active or does not exist. Refresh the customer list." }, { status: 409 });
    return NextResponse.json({ activation: data, message: "Account machine released for all owned tools. Ownership and history have been retained." });
  } catch {
    return NextResponse.json({ error: "Unable to release this machine. Please try again." }, { status: 500 });
  }
}
