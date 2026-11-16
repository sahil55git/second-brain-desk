// The staff rules: shop opening time, how late counts, and the saved reasons with their amounts
// (deductions and extra pay). Owner-only. GET → settings; PUT { openTime, graceMin, lateCutInr, rules[] }.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { ownerGate } from "@/lib/employeeServer";
import { cleanSettings } from "@/lib/staffRules";

export const dynamic = "force-dynamic";
const KEY = "staffRules";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const r = await safeDbCall(() => prisma.appSetting.findUnique({ where: { key: KEY } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: cleanSettings(r.data?.data) });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const data = cleanSettings(body);
  // StaffSettings is a plain object of numbers and strings; Prisma wants it typed as JSON.
  const json = data as unknown as Prisma.InputJsonValue;
  const r = await safeDbCall(() => prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, data: json }, update: { data: json } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data });
}
