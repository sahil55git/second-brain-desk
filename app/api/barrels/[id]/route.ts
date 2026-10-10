// One lot: read (GET), add barrels / name a barrel (PATCH, anyone), and
// owner-only edit of the declared figures, close and reopen.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { barrelCode } from "@/lib/barrels";
import { MAX_BARRELS_PER_LOT, RECEIPT_INCLUDE, logEvent, posNum, shapeReceipt, str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

function dbError(err: string) {
  return NextResponse.json({ error: missingTable(err) ? TABLE_HINT : err }, { status: 503 });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const result = await safeDbCall(async () => {
    const r = await prisma.oilReceipt.findFirst({ where: { OR: [{ id: params.id }, { lotNo: params.id }] }, include: RECEIPT_INCLUDE });
    if (!r) return null;
    const events = user.isOwner ? await prisma.barrelEvent.findMany({ where: { receiptId: r.id }, orderBy: { at: "desc" }, take: 200 }) : [];
    return { r, events };
  });
  if (!result.ok) return dbError(result.error);
  if (!result.data) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  return NextResponse.json({ data: shapeReceipt(result.data.r, user.isOwner), events: result.data.events });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const by = user.name || "staff";
  const ownerOnly = () => NextResponse.json({ error: "Only the owner can do this." }, { status: 403 });

  const result = await safeDbCall(async () => {
    const r = await prisma.oilReceipt.findUnique({ where: { id: params.id }, include: RECEIPT_INCLUDE });
    if (!r) return { error: "Lot not found.", status: 404 } as const;
    const action = body.action;

    if (action === "addBarrels") {
      if (r.status !== "OPEN") return { error: "This lot is closed.", status: 409 } as const;
      const count = Math.round(posNum(body.count) ?? 0);
      const have = r.barrels.length;
      if (count < 1 || have + count > MAX_BARRELS_PER_LOT) return { error: `Add 1 to ${MAX_BARRELS_PER_LOT - have} barrels.`, status: 400 } as const;
      const nextSeq = (r.barrels.at(-1)?.seq ?? 0) + 1;
      await prisma.$transaction(async (tx) => {
        await tx.barrel.createMany({ data: Array.from({ length: count }, (_, i) => ({ receiptId: r.id, seq: nextSeq + i, code: barrelCode(r.lotNo, nextSeq + i) })) });
        await logEvent(tx, r.id, "ADD_BARRELS", by, { count, from: nextSeq });
      });
    } else if (action === "setBarrel") {
      const b = r.barrels.find((x) => x.id === body.barrelId);
      if (!b) return { error: "Barrel not found.", status: 404 } as const;
      const data: { supplierMark?: string | null; declaredNetKg?: number | null } = {};
      if ("supplierMark" in body) data.supplierMark = str(body.supplierMark, 30);
      if ("declaredNetKg" in body) {
        if (!user.isOwner) return { error: "owner", status: 403 } as const;
        data.declaredNetKg = posNum(body.declaredNetKg);
      }
      await prisma.$transaction(async (tx) => {
        await tx.barrel.update({ where: { id: b.id }, data });
        await logEvent(tx, r.id, "EDIT", by, { barrel: b.code, ...data }, b.code);
      });
    } else if (action === "edit") {
      if (!user.isOwner) return { error: "owner", status: 403 } as const;
      const data: Record<string, unknown> = {};
      const changed: Record<string, [unknown, unknown]> = {};
      const set = (k: keyof typeof r, v: unknown) => {
        if (r[k] !== v) {
          data[k] = v;
          changed[k as string] = [r[k], v];
        }
      };
      if ("supplierName" in body && str(body.supplierName, 120)) set("supplierName", str(body.supplierName, 120));
      if ("product" in body && str(body.product, 80)) set("product", str(body.product, 80));
      if ("vehicleNo" in body) set("vehicleNo", str(body.vehicleNo, 20)?.toUpperCase() ?? null);
      if ("challanNo" in body) set("challanNo", str(body.challanNo, 60));
      if ("tankTarget" in body) set("tankTarget", str(body.tankTarget, 40));
      if ("notes" in body) set("notes", str(body.notes, 500));
      if ("rateInrPerKg" in body) set("rateInrPerKg", posNum(body.rateInrPerKg));
      if ("declaredNetKg" in body) set("declaredNetKg", posNum(body.declaredNetKg));
      if ("declaredBarrels" in body) {
        const n = posNum(body.declaredBarrels);
        set("declaredBarrels", n ? Math.round(n) : null);
      }
      if (!Object.keys(data).length) return { error: "Nothing changed.", status: 400 } as const;
      await prisma.$transaction(async (tx) => {
        await tx.oilReceipt.update({ where: { id: r.id }, data });
        await logEvent(tx, r.id, "EDIT", by, { changed });
      });
    } else if (action === "close") {
      if (!user.isOwner) return { error: "owner", status: 403 } as const;
      const note = str(body.note, 300);
      const unfinished = r.barrels.filter((b) => b.grossKg == null || b.emptyKg == null).length;
      if (unfinished && !note) return { error: `${unfinished} barrel(s) are not fully weighed. Add a note to close anyway.`, status: 400 } as const;
      await prisma.$transaction(async (tx) => {
        await tx.oilReceipt.update({ where: { id: r.id }, data: { status: "CLOSED", closedAt: new Date(), closedBy: by, closeNote: note } });
        await logEvent(tx, r.id, "CLOSE", by, { unfinished, note });
      });
    } else if (action === "reopen") {
      if (!user.isOwner) return { error: "owner", status: 403 } as const;
      await prisma.$transaction(async (tx) => {
        await tx.oilReceipt.update({ where: { id: r.id }, data: { status: "OPEN", closedAt: null, closedBy: null, closeNote: null } });
        await logEvent(tx, r.id, "REOPEN", by, { note: str(body.note, 300) });
      });
    } else if (action === "labelsPrinted") {
      await logEvent(prisma, r.id, "LABELS", by, { barrels: r.barrels.length });
    } else {
      return { error: "Unknown action.", status: 400 } as const;
    }
    return { r: await prisma.oilReceipt.findUnique({ where: { id: r.id }, include: RECEIPT_INCLUDE }) } as const;
  });

  if (!result.ok) return dbError(result.error);
  const d = result.data;
  if ("error" in d) return d.error === "owner" ? ownerOnly() : NextResponse.json({ error: d.error }, { status: d.status });
  return NextResponse.json({ data: shapeReceipt(d.r!, user.isOwner) });
}
