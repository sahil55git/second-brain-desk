// Vyapar cross-check snapshot (erp-architecture-plan.md). Owner-only, since
// it exposes financial totals (receivables, sales). GET returns the current
// snapshot (or null); PUT replaces it with a freshly-parsed payload. The
// same PUT is what an automated toolkit run (vyapar_reader.py) would POST to
// once wired up — for now the Owner pastes/uploads the JSON from the desk.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma, safeDbCall } from "@/lib/db";

const SNAPSHOT_ID = "singleton";

async function requireOwner(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return { ok: false as const, status: 401, error: "Not signed in." };
  if (token.role !== "OWNER") {
    return { ok: false as const, status: 403, error: "Owner access required." };
  }
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await safeDbCall(() =>
    prisma.vyaparSnapshot.findUnique({ where: { id: SNAPSHOT_ID } })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let payload: unknown;
  try {
    const body = await req.json();
    // Accept either the payload directly, or { payload: {...} }.
    payload = body && typeof body === "object" && "payload" in body ? body.payload : body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "Payload must be a JSON object (the parsed Vyapar figures)." },
      { status: 400 }
    );
  }

  const result = await safeDbCall(() =>
    prisma.vyaparSnapshot.upsert({
      where: { id: SNAPSHOT_ID },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { id: SNAPSHOT_ID, payload: payload as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { payload: payload as any },
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
