import { PrismaClient } from "@prisma/client";

// Standard Next.js Prisma singleton pattern (avoids exhausting connections
// across hot-reloads in dev) — but constructed defensively: with no
// DATABASE_URL set (Phase 1, no live database provisioned yet) or with the
// Prisma Client not generated for the current environment,
// `new PrismaClient()` itself can throw synchronously. That must never
// crash module load (every API route and the server page import this
// file), so construction is wrapped and a null client degrades every call
// through safeDbCall() to a clear "Database not connected yet" result
// instead of a hard crash.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient | null };

let client: PrismaClient | null = null;
let initError: string | null = null;

if (globalForPrisma.prisma !== undefined) {
  client = globalForPrisma.prisma;
} else {
  try {
    client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  } catch (err) {
    client = null;
    initError = err instanceof Error ? err.message : "Failed to initialize Prisma Client";
  }
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
}

// Exported for call sites that build a query inside a safeDbCall() closure
// (never actually invoked unless the guard below lets it through).
export const prisma = client as PrismaClient;

/**
 * DATABASE_URL is intentionally allowed to be unset in Phase 1. Every
 * data-fetching call site should go through this helper so a missing or
 * unreachable database (or an ungenerated Prisma Client) degrades to a
 * clear "Database not connected yet" UI state rather than a hard crash.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeDbCall<T = any>(
  fn: () => Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "DATABASE_URL is not set. Database not connected yet." };
  }
  if (!client) {
    return {
      ok: false,
      error: `Database not connected yet. (${initError || "Prisma Client not initialized"})`,
    };
  }
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    return { ok: false, error: `Database not connected yet. (${message})` };
  }
}
