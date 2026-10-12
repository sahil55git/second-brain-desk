// Shared secret between middleware.ts and /api/access/internal (edge-safe: Web Crypto only).
export async function internalKey(): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const data = new TextEncoder().encode("access-internal:" + secret);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
