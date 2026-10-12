// The signed-in user's access: profile name and permissions (fresh from the database).
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { accessFor } from "@/lib/accessServer";
import { BUILTIN_PROFILES, effectivePerms } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const username = (token.username as string) || "";
  const a = username ? await accessFor(username) : null;
  if (!a) {
    // Database unreachable: use the profile the sign-in said, from the built-in defaults (never everything).
    const isOwner = token.role === "OWNER";
    const base = BUILTIN_PROFILES.find((p) => p.id === "manager")!.perms;
    return NextResponse.json({ data: { name: (token.name as string) || username, isOwner, profileKey: isOwner ? "owner" : "manager", profileName: isOwner ? "Owner" : "Manager", perms: effectivePerms(isOwner, base), offline: true } });
  }
  if (!a.active) return NextResponse.json({ error: "This login is switched off." }, { status: 403 });
  return NextResponse.json({ data: { name: a.name, isOwner: a.isOwner, profileKey: a.profileKey, profileName: a.profileName, perms: a.perms } });
}
