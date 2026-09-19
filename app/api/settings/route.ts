// BusinessSettings singleton (erp-architecture-plan.md, Phase 1). Owner-only
// — checked here server-side (not just via middleware/UI hiding) because a
// client redirect alone is never a real access boundary.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma, safeDbCall } from "@/lib/db";

const SINGLETON_ID = "singleton";

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
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await safeDbCall(async () => {
    const existing = await prisma.businessSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) return existing;
    // Lazily create the singleton row on first read so the Settings UI
    // always has something to edit, without needing a separate seed step.
    return prisma.businessSettings.create({ data: { id: SINGLETON_ID } });
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const {
    businessName,
    gstin,
    address,
    state,
    phone,
    email,
    defaultGstRatePct,
    invoicePrefix,
  } = body;

  const result = await safeDbCall(() =>
    prisma.businessSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        businessName: businessName || "",
        gstin: gstin || null,
        address: address || null,
        state: state || null,
        phone: phone || null,
        email: email || null,
        defaultGstRatePct: defaultGstRatePct === undefined ? 5 : Number(defaultGstRatePct),
        invoicePrefix: invoicePrefix || "INV-",
      },
      update: {
        ...(businessName !== undefined && { businessName }),
        ...(gstin !== undefined && { gstin: gstin || null }),
        ...(address !== undefined && { address: address || null }),
        ...(state !== undefined && { state: state || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(defaultGstRatePct !== undefined && {
          defaultGstRatePct: Number(defaultGstRatePct) || 0,
        }),
        ...(invoicePrefix !== undefined && { invoicePrefix: invoicePrefix || "INV-" }),
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
