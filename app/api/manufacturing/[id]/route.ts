import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { yieldSnapshotFrom, type BatchSupplier } from "@/lib/mfgCalculations";

// Update / complete a batch — any field is editable after the fact (plan
// doc, Version 20). The yield snapshot is recomputed from the merged
// record so it always reflects the latest step figures.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  const existingResult = await safeDbCall(() =>
    prisma.mfgBatch.findUniqueOrThrow({ where: { id: params.id } })
  );
  if (!existingResult.ok) {
    return NextResponse.json({ error: existingResult.error }, { status: 503 });
  }
  const existing = existingResult.data;

  const data: Record<string, unknown> = {};
  if (body.mill !== undefined) data.mill = body.mill || null;
  if (body.barrel !== undefined) data.barrel = String(body.barrel).trim();
  if (body.productItem !== undefined)
    data.productItem = body.productItem || "Karadi oil";
  if (body.date !== undefined) data.date = body.date;
  if (body.suppliers !== undefined) {
    data.suppliers = (Array.isArray(body.suppliers) ? body.suppliers : [])
      .map((s: { name?: unknown; seedKg?: unknown }) => ({
        name: String(s?.name ?? "").trim(),
        seedKg: Number(s?.seedKg) || 0,
      }))
      .filter((s: BatchSupplier) => s.name || s.seedKg > 0);
  }
  for (const k of ["step1Kg", "step2Kg", "step3Kg", "step4Kg", "refOilPct", "moisturePct", "systemOilKgOverride"] as const) {
    if (body[k] !== undefined) data[k] = numOrNull(body[k]);
  }
  for (const k of ["step2Date", "step2Time", "step3Date", "step3Time", "step4Date", "step4Time", "seedQuality", "notes"] as const) {
    if (body[k] !== undefined) data[k] = strOrNull(body[k]);
  }

  // Merge onto existing for a correct recompute (fields not in this PATCH
  // keep their stored values).
  const merged = {
    suppliers: (data.suppliers ?? existing.suppliers) as unknown,
    step1Kg: (data.step1Kg ?? existing.step1Kg) as number | null,
    step2Kg: (data.step2Kg ?? existing.step2Kg) as number | null,
    step3Kg: (data.step3Kg ?? existing.step3Kg) as number | null,
    step4Kg: (data.step4Kg ?? existing.step4Kg) as number | null,
    refOilPct: (data.refOilPct ?? existing.refOilPct) as number | null,
    moisturePct: (data.moisturePct ?? existing.moisturePct) as number | null,
    systemOilKgOverride: (data.systemOilKgOverride ?? existing.systemOilKgOverride) as number | null,
  };
  data.yield = yieldSnapshotFrom(merged) as unknown as Prisma.InputJsonValue;
  if (data.suppliers !== undefined) {
    data.suppliers = data.suppliers as unknown as Prisma.InputJsonValue;
  }

  const result = await safeDbCall(() =>
    // `data` is built dynamically (only the fields the caller sent), so
    // cast at the call site rather than fighting Prisma's generated types.
    prisma.mfgBatch.update({ where: { id: params.id }, data: data as any }) // eslint-disable-line @typescript-eslint/no-explicit-any
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
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
