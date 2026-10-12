// Used only by middleware.ts (which cannot reach the database itself): returns one
// user's access. Guarded by a secret header derived from NEXTAUTH_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { accessFor } from "@/lib/accessServer";
import { internalKey } from "@/lib/accessKey";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = await internalKey();
  if (!key || req.headers.get("x-access-key") !== key) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const u = req.nextUrl.searchParams.get("u") || "";
  const a = u ? await accessFor(u) : null;
  if (!a) return NextResponse.json({ data: null }); // database down
  return NextResponse.json({ data: { active: a.active, isOwner: a.isOwner, perms: a.perms } });
}
