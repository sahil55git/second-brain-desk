// Quick Register — fix (PATCH) or delete a mistaken entry. Staff may change or delete only
// today's entries (fixing a typo at the counter); the Owner may change or delete any entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate, KIND_SIDE, splitInfo, type RegisterKind } from "@/lib/register";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const found = await safeDbCall(() => prisma.registerEntry.findUnique({ where: { id: params.id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  if (!found.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!user.isOwner && found.data.date !== businessDate(Date.now())) {
    return NextResponse.json(
      { error: "Only the owner can delete entries from earlier days." },
      { status: 403 }
    );
  }
  // A split-payment sale is several linked rows: deleting one removes them all.
  const group = splitInfo(found.data.details);
  const result = await safeDbCall(async () => {
    if (group) {
      await prisma.registerEntry.deleteMany({ where: { details: { path: ["split", "id"], equals: group.id } } });
    } else {
      await prisma.registerEntry.delete({ where: { id: params.id } });
    }
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}

// Fix an entry: amount, quantity, rate, how it was paid, who, notes (and the date, owner only).
// Staff can fix today's entries; the owner any day. Split / multi-item bills keep their amount
// (delete and enter again to change it) but their name and notes can be fixed.
const MODES = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] as const;
const UNITS = ["kg", "ltr", "bags", "pcs", "box"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const found = await safeDbCall(() => prisma.registerEntry.findUnique({ where: { id: params.id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  const e = found.data;
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.isOwner && e.date !== businessDate(Date.now())) {
    return NextResponse.json({ error: "Only the owner can change entries from earlier days." }, { status: 403 });
  }
  const grouped = !!splitInfo(e.details) || !!(e.details && typeof e.details === "object" && "bill" in (e.details as object));
  const data: Record<string, unknown> = {};
  const num = (v: unknown) => (v === "" || v === null ? null : Number(v));

  if (!grouped) {
    if (body.amountInr !== undefined) {
      const a = Number(body.amountInr);
      if (!Number.isFinite(a) || a <= 0 || a > 10_000_000) return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
      data.amountInr = Math.round(a * 100) / 100;
    }
    if (body.qty !== undefined) {
      const q = num(body.qty);
      if (q !== null && (!Number.isFinite(q) || q < 0)) return NextResponse.json({ error: "Check the quantity" }, { status: 400 });
      data.qty = q && q > 0 ? q : null;
      if (!data.qty) data.unit = null;
    }
    if (body.unit !== undefined && UNITS.includes(body.unit) && data.qty !== null) data.unit = body.unit;
    if (body.rateInr !== undefined) {
      const r = num(body.rateInr);
      if (r !== null && (!Number.isFinite(r) || r < 0)) return NextResponse.json({ error: "Check the rate" }, { status: 400 });
      data.rateInr = r && r > 0 ? r : null;
    }
    if (body.paymentMode !== undefined && MODES.includes(body.paymentMode)) {
      const creditOk = e.kind === "SALE" || e.kind === "FRESH_CRUSH" || e.kind === "PURCHASE";
      if (body.paymentMode === "CREDIT" && !creditOk) return NextResponse.json({ error: "Only sales and purchases can be on udhaar." }, { status: 400 });
      data.paymentMode = body.paymentMode;
    }
  }
  if (body.itemLabel !== undefined && (e.item === "other" || e.itemLabel)) {
    data.itemLabel = typeof body.itemLabel === "string" && body.itemLabel.trim() ? body.itemLabel.trim().slice(0, 80) : e.itemLabel;
  }
  if (body.notes !== undefined) data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
  if (body.date !== undefined && body.date !== e.date) {
    if (!user.isOwner) return NextResponse.json({ error: "Only the owner can move an entry to another day." }, { status: 403 });
    if (!isValidDate(body.date) || body.date > businessDate(Date.now())) return NextResponse.json({ error: "Pick a valid date (not in the future)." }, { status: 400 });
    data.date = body.date;
  }
  let partyName: string | null | undefined;
  if (body.partyName !== undefined) partyName = typeof body.partyName === "string" && body.partyName.trim() ? body.partyName.trim().slice(0, 120) : null;
  const mode = (data.paymentMode as string | undefined) ?? e.paymentMode;
  if (mode === "CREDIT" && !(partyName !== undefined ? partyName : e.partyName)) return NextResponse.json({ error: "Udhaar needs the person's name." }, { status: 400 });
  if (e.kind === "UDHAAR_IN" && partyName === null) return NextResponse.json({ error: "Udhaar received needs the person's name." }, { status: 400 });

  const result = await safeDbCall(async () => {
    if (partyName !== undefined) {
      data.partyName = partyName;
      if (!partyName) data.partyId = null;
      else {
        const side = KIND_SIDE[e.kind as RegisterKind];
        const ex = await prisma.party.findFirst({ where: { name: { equals: partyName, mode: "insensitive" } }, select: { id: true } });
        data.partyId = ex?.id ?? (await prisma.party.create({ data: { name: partyName, type: side === "in" ? "CUSTOMER" : side === "out" ? "SUPPLIER" : "BOTH", notes: "Added from Quick Register" }, select: { id: true } })).id;
      }
    }
    const stamp = `edited by ${user.name || user.username} ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}`;
    const prevDetails = e.details && typeof e.details === "object" ? (e.details as Record<string, unknown>) : {};
    const edits = Array.isArray(prevDetails.edits) ? (prevDetails.edits as unknown[]).slice(-9) : [];
    const before = { amountInr: e.amountInr, qty: e.qty, rateInr: e.rateInr, paymentMode: e.paymentMode, partyName: e.partyName, date: e.date };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.details = { ...prevDetails, edits: [...edits, { at: new Date().toISOString(), by: user.name || user.username, before, note: stamp }] } as any;
    if (grouped && partyName !== undefined) {
      const g = splitInfo(e.details);
      if (g) await prisma.registerEntry.updateMany({ where: { details: { path: ["split", "id"], equals: g.id } }, data: { partyName: data.partyName as string | null, partyId: (data.partyId as string | null) ?? null } });
    }
    return prisma.registerEntry.update({ where: { id: e.id }, data });
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, grouped });
}
