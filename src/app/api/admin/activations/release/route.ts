import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

// A distinct URL prevents old tabs from treating legacy IDs as account activation IDs.
export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (authorization.response) return authorization.response;
  return NextResponse.json({ error: "Per-tool release has been retired. Refresh the admin page to manage the account machine." }, { status: 410 });
}
