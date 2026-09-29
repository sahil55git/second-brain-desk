import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma, safeDbCall } from "@/lib/db";

const SOURCE = "SI850-KARADI";
const validWeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000;

export async function GET(req: NextRequest) {
  if (!await getServerSession(authOptions)) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  // Calendar dates are converted at the browser's local timezone into UTC instants.
  const fromInstant = req.nextUrl.searchParams.get("fromInstant");
  const toInstant = req.nextUrl.searchParams.get("toInstant");
  const start = fromInstant ? new Date(fromInstant) : from ? new Date(`${from}T00:00:00+05:30`) : new Date(Date.now() - 86400000);
  const end = toInstant ? new Date(toInstant) : to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000) : new Date();
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 32 * 86400000) {
    return NextResponse.json({ error: "Select at most one month per report" }, { status: 400 });
  }
  const result = await safeDbCall(async () => {
    const [movements, readings] = await Promise.all([
      prisma.tankMovement.findMany({ where: { source: SOURCE, finishedAt: { gte: start, lt: end } }, orderBy: { finishedAt: "desc" }, take: 5001 }),
      prisma.tankReading.findMany({ where: { source: SOURCE, bucketAt: { gte: start, lt: end } }, orderBy: { bucketAt: "desc" }, take: 46081 }),
    ]);
    return { movements, readings };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  if (result.data.movements.length > 5000 || result.data.readings.length > 46080) {
    return NextResponse.json({ error: "Too many entries; select a shorter date range" }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.source !== SOURCE) return NextResponse.json({ error: "Unknown tank" }, { status: 400 });

  if (body.type === "reading") {
    if (!validWeight(body.weightKg)) return NextResponse.json({ error: "Invalid weight" }, { status: 400 });
    const now = new Date();
    const bucketAt = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const result = await safeDbCall(() => prisma.tankReading.upsert({
      where: { source_bucketAt: { source: SOURCE, bucketAt } },
      create: { source: SOURCE, weightKg: body.weightKg as number, bucketAt },
      update: { weightKg: body.weightKg as number },
    }));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json({ data: result.data });
  }

  if (body.type !== "movement" || !validWeight(body.beforeKg) || !validWeight(body.afterKg)) {
    return NextResponse.json({ error: "Invalid tank movement" }, { status: 400 });
  }
  const delta = Math.round(((body.afterKg as number) - (body.beforeKg as number)) * 100) / 100;
  if (Math.abs(delta) < 0.2) return NextResponse.json({ error: "Change must be at least 0.2 kg" }, { status: 400 });
  const startedAt = new Date(String(body.startedAt || ""));
  if (!Number.isFinite(startedAt.getTime()) || startedAt.getTime() > Date.now() + 60000 || startedAt.getTime() < Date.now() - 7 * 86400000) {
    return NextResponse.json({ error: "Invalid transfer start time" }, { status: 400 });
  }
  const requestId = body.requestId;
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const result = await safeDbCall(() => prisma.tankMovement.upsert({
    where: { requestId },
    create: {
      requestId, source: SOURCE, direction: delta > 0 ? "IN" : "OUT",
      beforeKg: body.beforeKg as number, afterKg: body.afterKg as number,
      quantityKg: Math.abs(delta), startedAt, note,
      recordedBy: session.user?.name || "User",
    },
    update: {},
  }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
