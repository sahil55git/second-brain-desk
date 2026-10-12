import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Owner-only API guard (a client redirect is never the real boundary). */
export async function requireOwner(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return { ok: false as const, status: 401, error: "Not signed in." };
  if (token.role !== "OWNER") return { ok: false as const, status: 403, error: "Owner access required." };
  return { ok: true as const, username: (token.username as string) || "" };
}
