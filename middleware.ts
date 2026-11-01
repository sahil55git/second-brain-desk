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
import { BUILTIN_PROFILES, effectivePerms, pagesForPath, pathAllowed, type Perms } from "@/lib/access";
import { internalKey } from "@/lib/accessKey";

const OWNER_ONLY_PATHS = ["/settings", "/reports", "/records"];

// Profiles live in the database, which the edge cannot reach, so we ask a small
// internal route and remember the answer for a few seconds per login.
type Entry = { at: number; v: { active: boolean; isOwner: boolean; perms: Perms } | null };
const cache = new Map<string, Entry>();
const TTL_MS = 15_000;

async function lookup(req: NextRequest, username: string): Promise<Entry["v"]> {
  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  let v: Entry["v"] = null;
  try {
    const key = await internalKey();
    if (!key) return null;
    const res = await fetch(new URL(`/api/access/internal?u=${encodeURIComponent(username)}`, req.url), { headers: { "x-access-key": key } });
    if (res.ok) v = ((await res.json()) as { data: Entry["v"] }).data;
  } catch {
    v = null;
  }
  if (v) cache.set(username, { at: Date.now(), v });
  return v;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The internal check route is called by this very middleware (without a login):
  // it guards itself with a secret header, so let it through before anything else.
  if (pathname.startsWith("/api/access/internal")) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search); // keep ?query so old barrel QR links still land on the barrel
    return NextResponse.redirect(loginUrl);
  }

  const isApi = pathname.startsWith("/api/");
  const deny = (msg: string) =>
    isApi ? NextResponse.json({ error: msg }, { status: 403 }) : NextResponse.redirect(new URL("/", req.url));

  if (token.role === "OWNER") return NextResponse.next();

  if (OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p))) return deny("Owner access required.");

  // Staff: their profile decides which pages (and the APIs behind them) they may open.
  const a = await lookup(req, String(token.username || token.name || ""));
  if (a && !a.active) {
    return isApi
      ? NextResponse.json({ error: "This login has been switched off." }, { status: 403 })
      : NextResponse.redirect(new URL("/login?off=1", req.url));
  }
  if (pagesForPath(pathname)) {
    // Database unreachable: fall back to the manager rules rather than opening everything.
    const perms = a ? a.perms : effectivePerms(false, BUILTIN_PROFILES[1].perms);
    if (!pathAllowed(perms, pathname)) return deny("Your profile does not include this page.");
  }

  return NextResponse.next();
}

export const config = {
  // Everything except: NextAuth's own API routes, the login/setup pages
  // and their APIs, and Next.js internals/static assets.
  matcher: [
    "/((?!api/auth|api/setup|api/scale-ticks/ingest|api/print-jobs/agent|api/device/summary|api/bot/telegram|api/bot/discord|api/bot/cron|login|setup|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|print-helper/).*)",
  ],
};
