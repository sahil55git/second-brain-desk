// Attendance. GET ?date= (that day, with the people) or ?month= (days worked per person).
// POST { employeeId, date?, status, action?: "in" | "out", photo?, lat?, lng?, accuracyM?, note? }.
// Any signed-in login can mark (the shop phone at the gate); only the owner changes earlier days.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { MAX_PHOTO_CHARS, daysWorked, distanceM, isStatus } from "@/lib/attendance";

export const dynamic = "force-dynamic";

async function shopPlace(): Promise<{ lat: number; lng: number } | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: "shop" } }).catch(() => null);
  const d = (s?.data || {}) as { lat?: number; lng?: number };
  return typeof d.lat === "number" && typeof d.lng === "number" ? { lat: d.lat, lng: d.lng } : null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const r = await safeDbCall(() => prisma.attendance.findMany({ where: { date: { startsWith: month } }, select: { employeeId: true, date: true, status: true } }));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ data: { days: daysWorked(r.data, month), rows: r.data } });
  }
  const d = sp.get("date");
  const date = isValidDate(d) ? d : businessDate(Date.now());
  const r = await safeDbCall(async () => {
    const [emps, rows, place] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, payType: true } }),
      prisma.attendance.findMany({ where: { date } }),
      shopPlace(),
    ]);
    return { emps, rows, place };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  const by = Object.fromEntries(r.data.rows.map((a) => [a.employeeId, a]));
  return NextResponse.json({
    date,
    place: r.data.place,
    data: r.data.emps.map((e) => {
      const a = by[e.id];
      return { ...e, att: a ? { status: a.status, inAt: a.inAt?.toISOString() ?? null, outAt: a.outAt?.toISOString() ?? null, photo: user.isOwner ? a.photo : a.photo ? "yes" : null, distanceM: a.distanceM, note: a.note, markedBy: a.markedBy } : null };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const today = businessDate(Date.now());
  const date = isValidDate(b.date) ? b.date : today;
  if (date !== today && !user.isOwner) return NextResponse.json({ error: "Only the owner can change other days." }, { status: 403 });
  if (date > today) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });
  const employeeId = typeof b.employeeId === "string" ? b.employeeId : "";
  const action = b.action === "out" ? "out" : b.action === "in" ? "in" : null;
  const status = isStatus(b.status) ? b.status : action ? "P" : null;
  if (!employeeId || !status) return NextResponse.json({ error: "Choose the person and present / half / absent." }, { status: 400 });
  const photo = typeof b.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length <= MAX_PHOTO_CHARS ? b.photo : undefined;
  const lat = Number(b.lat), lng = Number(b.lng);
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const r = await safeDbCall(async () => {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } });
    if (!emp) return null;
    const place = hasLoc ? await shopPlace() : null;
    const now = new Date();
    const data = {
      status,
      ...(action === "in" ? { inAt: now } : {}),
      ...(action === "out" ? { outAt: now } : {}),
      ...(photo ? { photo } : {}),
      ...(hasLoc ? { lat, lng, accuracyM: Number.isFinite(Number(b.accuracyM)) ? Number(b.accuracyM) : null, distanceM: place ? distanceM(place, { lat, lng }) : null } : {}),
      ...(typeof b.note === "string" ? { note: b.note.slice(0, 200) || null } : {}),
      markedBy: user.name || user.username,
    };
    return prisma.attendance.upsert({ where: { employeeId_date: { employeeId, date } }, create: { employeeId, date, ...data }, update: data });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "No such person." }, { status: 404 });
  return NextResponse.json({ ok: true, distanceM: r.data.distanceM });
}
