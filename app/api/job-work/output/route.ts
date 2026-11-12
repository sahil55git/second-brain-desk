import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { canEdit, parseMoney } from "@/lib/editRules";
import { writeAudit } from "@/lib/auditServer";

// Job-work crushing output for one business day (Spec B): the oil and cake the
// day's job-work seed actually gave. Staff may record or fix today; the owner
// any day. Every save is written to the Activity log with the row before/after.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?date=YYYY-MM-DD -> that day's row (or null); no date -> the last 60 days.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (date && !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  // Two different result shapes (one row or a list), so two separate calls
  // rather than one ternary, which TypeScript rejects.
  const result = date
    ? await safeDbCall(() => prisma.jobWorkDayOutput.findUnique({ where: { date } }))
    : await safeDbCall(() => prisma.jobWorkDayOutput.findMany({ orderBy: { date: "desc" }, take: 60 }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date = typeof body.date === "string" ? body.date : "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  const oilKg = blank(body.oilKg) ? null : parseMoney(body.oilKg);
  const cakeKg = blank(body.cakeKg) ? null : parseMoney(body.cakeKg);
  if (oilKg === null || cakeKg === null) {
    return NextResponse.json({ error: "Oil kg and cake kg must both be numbers, zero or more." }, { status: 400 });
  }
  if (oilKg + cakeKg <= 0) {
    return NextResponse.json({ error: "Enter the oil or the cake weight." }, { status: 400 });
  }
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;

  const today = businessDate(Date.now());
  if (date > today) {
    return NextResponse.json({ error: "That date has not come yet." }, { status: 400 });
  }
  if (!canEdit(user, date, today)) {
    return NextResponse.json({ error: "Only the owner can change the output of an earlier day." }, { status: 403 });
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.jobWorkDayOutput.findUnique({ where: { date } });
      const row = await tx.jobWorkDayOutput.upsert({
        where: { date },
        create: { date, oilKg, cakeKg, notes, by: user.name || null },
        update: { oilKg, cakeKg, notes, by: user.name || null },
      });
      await writeAudit(
        tx,
        user,
        before ? "EDIT" : "CREATE",
        "JobWorkDayOutput",
        row.id,
        `${date} oil ${oilKg} kg, cake ${cakeKg} kg`,
        before ?? undefined,
        row
      );
      return row;
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
