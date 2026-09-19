// Route protection (erp-architecture-plan.md, Phase 1). Runs on every
// request except the excluded matcher paths below. Unauthenticated
// requests are redirected to /login; unauthenticated + no users yet is
// redirected to /setup instead (first-run bootstrap). STAFF sessions are
// redirected away from Owner-only pages (Settings) — this is a UX
// convenience only, NOT the real access boundary: every Owner-only API
// route must also check the session's role server-side, since middleware
// can't be trusted as the sole gate (see lib/auth.ts's header comment).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const OWNER_ONLY_PATHS = ["/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p)) &&
    token.role !== "OWNER"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except: NextAuth's own API routes, the login/setup pages
  // and their APIs, and Next.js internals/static assets.
  matcher: [
    "/((?!api/auth|api/setup|login|setup|_next/static|_next/image|favicon.ico).*)",
  ],
};
