import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { yieldSnapshotFrom, type BatchSupplier } from "@/lib/mfgCalculations";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const barrel = typeof body.barrel === "string" ? body.barrel.trim() : "";
  if (!barrel) {
    return NextResponse.json({ error: "barrel is required" }, { status: 400 });
  }

  const suppliers: BatchSupplier[] = Array.isArray(body.suppliers)
    ? body.suppliers
        .map((s: { name?: unknown; seedKg?: unknown }) => ({
          name: String(s?.name ?? "").trim(),
          seedKg: Number(s?.seedKg) || 0,
        }))
        .filter((s: BatchSupplier) => s.name || s.seedKg > 0)
    : [];

  if (suppliers.length === 0) {
    return NextResponse.json(
      { error: "at least one supplier with seed weight is required" },
      { status: 400 }
    );
  }

  const fields = {
    mill: typeof body.mill === "string" && body.mill ? body.mill : null,
    barrel,
    productItem:
      typeof body.productItem === "string" && body.productItem
        ? body.productItem
        : "Karadi oil",
    date:
      typeof body.date === "string" && body.date
        ? body.date
        : new Date().toISOString().slice(0, 10),
    suppliers,
    step1Kg: numOrNull(body.step1Kg),
    step2Kg: numOrNull(body.step2Kg),
    step3Kg: numOrNull(body.step3Kg),
    step4Kg: numOrNull(body.step4Kg),
    step2Date: strOrNull(body.step2Date),
    step2Time: strOrNull(body.step2Time),
    step3Date: strOrNull(body.step3Date),
    step3Time: strOrNull(body.step3Time),
    step4Date: strOrNull(body.step4Date),
    step4Time: strOrNull(body.step4Time),
    refOilPct: numOrNull(body.refOilPct) ?? 22,
    moisturePct: numOrNull(body.moisturePct),
    systemOilKgOverride: numOrNull(body.systemOilKgOverride),
    seedQuality: strOrNull(body.seedQuality),
    notes: strOrNull(body.notes),
  };

  const snapshot = yieldSnapshotFrom(fields);

  const result = await safeDbCall(() =>
    prisma.mfgBatch.create({
      data: {
        ...fields,
        suppliers: fields.suppliers as unknown as Prisma.InputJsonValue,
        yield: snapshot as unknown as Prisma.InputJsonValue,
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
