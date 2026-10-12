// Quick Register — GET the day bundle, POST a new entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate, loadConfig, loadDay, saveConfig } from "@/lib/registerServer";
import { ALL_KINDS, KIND_SIDE, allocateBill, channelToMode, learnItem, normalizeBillLines, normalizeFreshCrush, normalizeSplit, rateKey, type BillLine, type RegisterKind } from "@/lib/register";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  }
  const result = await safeDbCall(() => loadDay(date));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

const MODES = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"] as const;
const UNITS = ["kg", "ltr", "bags", "pcs", "box"];

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as RegisterKind;
  if (!ALL_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown entry type" }, { status: 400 });
  }
  if (!isValidDate(body.date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  }
  const amount = Number(body.amountInr);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }
  // Fresh crush sale must carry valid production numbers (seed -> oil -> cake).
  const details = kind === "FRESH_CRUSH" ? normalizeFreshCrush(body.details) : null;
  // An udhaar receipt can be tied to one credit bill. The bill must exist and be on credit.
  let linkDetails: { invoiceId: string } | null = null;
  if (kind === "UDHAAR_IN" && typeof body.invoiceId === "string" && body.invoiceId) {
    const inv = await safeDbCall(() => prisma.salesInvoice.findUnique({ where: { id: body.invoiceId }, select: { id: true, paymentMode: true } }));
    if (!inv.ok) return NextResponse.json({ error: inv.error }, { status: 503 });
    if (!inv.data || inv.data.paymentMode !== "CREDIT") {
      return NextResponse.json({ error: "That bill is not a credit bill." }, { status: 400 });
    }
    linkDetails = { invoiceId: inv.data.id };
  }
  if (kind === "FRESH_CRUSH" && !details) {
    return NextResponse.json(
      { error: "Check seed kg, oil kg, extra-to-tank and cake: the numbers don't add up." },
      { status: 400 }
    );
  }
  // Split payment (sales only): one row per payment channel, all linked.
  let splitParts: ReturnType<typeof normalizeSplit> | null = null;
  if ((kind === "SALE" || kind === "FRESH_CRUSH") && Array.isArray(body.splits) && body.splits.length > 1) {
    splitParts = normalizeSplit(amount, body.splits);
    if (!splitParts.ok) return NextResponse.json({ error: splitParts.error }, { status: 400 });
    if (splitParts.parts.some((p) => p.channel === "CREDIT") && !(typeof body.partyName === "string" && body.partyName.trim())) {
      return NextResponse.json({ error: "Enter the customer's name for the udhaar part." }, { status: 400 });
    }
  }
  // Multi-item bill (sale / purchase): several item lines, one payment.
  let billLines: BillLine[] | null = null;
  if ((kind === "SALE" || kind === "PURCHASE") && body.totalSale !== true && Array.isArray(body.lines) && body.lines.length > 1) {
    const nb = normalizeBillLines(body.lines);
    if (!nb.ok) return NextResponse.json({ error: nb.error }, { status: 400 });
    const sum = Math.round(nb.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    if (Math.abs(sum - Math.round(amount * 100) / 100) > 0.01) {
      return NextResponse.json({ error: `Items add up to ₹${sum} but the bill is ₹${amount}` }, { status: 400 });
    }
    billLines = nb.lines;
  }
  const side = KIND_SIDE[kind];
  // A sale taken fully on the owner's personal PhonePe: mode OTHER + channel tag.
  const ownerPhonePe = (kind === "SALE" || kind === "FRESH_CRUSH") && body.payChannel === "OWNER_PHONEPE";
  const mode = ownerPhonePe ? "OTHER" : side === "oth" ? "CASH" : MODES.includes(body.paymentMode) ? body.paymentMode : "CASH";
  const qty = Number(body.qty);
  const rate = Number(body.rateInr);
  const unit = UNITS.includes(body.unit) ? body.unit : null;
  const partyName = typeof body.partyName === "string" && body.partyName.trim() ? body.partyName.trim().slice(0, 120) : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
  const totalSale = kind === "SALE" && body.totalSale === true;
  let item: string | null = !totalSale && typeof body.item === "string" ? body.item.slice(0, 60) : null;
  const itemLabel: string | null =
    !totalSale && typeof body.itemLabel === "string" && body.itemLabel.trim() ? body.itemLabel.trim().slice(0, 80) : null;

  const result = await safeDbCall(async () => {
    // 1. Library: learn a typed "Other" item and remember the rate used.
    let cfg = await loadConfig();
    let cfgChanged = false;
    if (item === "other" && itemLabel) {
      const learned = learnItem(cfg, kind, itemLabel);
      cfg = learned.cfg;
      item = learned.key;
      cfgChanged = true;
    }
    if (!totalSale && Number.isFinite(rate) && rate > 0 && item) {
      // Fresh crush is sold per kg or per litre, so its rate is remembered per unit.
      const key = kind === "FRESH_CRUSH" ? rateKey(kind, `${item}:${unit || "kg"}`) : rateKey(kind, item);
      cfg = { ...cfg, rates: { ...cfg.rates, [key]: rate } };
      cfgChanged = true;
    }
    if (billLines) {
      // Every line of a bill teaches the library its "Other" name and rate too.
      for (const ln of billLines) {
        if (ln.item === "other" && ln.itemLabel) {
          const learned = learnItem(cfg, kind, ln.itemLabel);
          cfg = learned.cfg;
          ln.item = learned.key;
          cfgChanged = true;
        }
        if (ln.item && ln.rate) {
          cfg = { ...cfg, rates: { ...cfg.rates, [rateKey(kind, ln.item)]: ln.rate } };
          cfgChanged = true;
        }
      }
    }
    if (cfgChanged) await saveConfig(cfg);

    // 2. Party library: link to the shared Party master (create if new) so
    //    the name shows up for Sales / Purchase / Parties desks too.
    let partyId: string | null = null;
    if (partyName) {
      const existing = await prisma.party.findFirst({
        where: { name: { equals: partyName, mode: "insensitive" } },
        select: { id: true },
      });
      partyId =
        existing?.id ||
        (
          await prisma.party.create({
            data: {
              name: partyName,
              type: side === "in" ? "CUSTOMER" : side === "out" ? "SUPPLIER" : "BOTH",
              notes: "Added from Quick Register",
            },
            select: { id: true },
          })
        ).id;
    }

    if (billLines) {
      const lines = billLines;
      const gid = `bl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const parts: { channel: string; amount: number }[] =
        splitParts && splitParts.ok && splitParts.parts.length > 1
          ? splitParts.parts
          : [{ channel: ownerPhonePe ? "OWNER_PHONEPE" : mode, amount }];
      const rows = allocateBill(lines, parts);
      const n = rows.length;
      const created = await prisma.$transaction(
        rows.map((r, idx) => {
          const ln = lines[r.line];
          return prisma.registerEntry.create({
            data: {
              date: body.date,
              kind,
              item: ln.item,
              itemLabel: ln.itemLabel,
              // Quantity and rate on the first row of each item only.
              qty: r.first ? ln.qty : null,
              unit: r.first ? ln.unit : null,
              rateInr: r.first ? ln.rate : null,
              amountInr: r.amount,
              paymentMode: r.channel === "OWNER_PHONEPE" ? "OTHER" : (r.channel as (typeof MODES)[number]),
              totalSale: false,
              partyName,
              partyId,
              notes,
              details: {
                split: { id: gid, i: idx + 1, n, total: amount },
                bill: { line: r.line + 1, lines: lines.length },
                ...(r.channel === "OWNER_PHONEPE" ? { channel: "OWNER_PHONEPE" } : {}),
              },
              createdByName: user.name || null,
            },
          });
        })
      );
      return created[0];
    }

    if (splitParts && splitParts.ok && splitParts.parts.length > 1) {
      const gid = `sp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const n = splitParts.parts.length;
      const rows = await prisma.$transaction(
        splitParts.parts.map((p, idx) =>
          prisma.registerEntry.create({
            data: {
              date: body.date,
              kind,
              item,
              itemLabel,
              // Quantity and rate go on the first row only, so stock and
              // item reports never count the same oil twice.
              qty: idx === 0 && !totalSale && Number.isFinite(qty) && qty > 0 ? qty : null,
              unit: idx === 0 && !totalSale && Number.isFinite(qty) && qty > 0 ? unit || "kg" : null,
              rateInr: idx === 0 && !totalSale && Number.isFinite(rate) && rate > 0 ? rate : null,
              amountInr: p.amount,
              paymentMode: channelToMode(p.channel),
              totalSale,
              partyName,
              partyId,
              notes,
              details: {
                // fresh-crush production numbers live on the first row only
                ...(idx === 0 && details ? details : {}),
                split: { id: gid, i: idx + 1, n, total: amount },
                ...(p.channel === "OWNER_PHONEPE" ? { channel: "OWNER_PHONEPE" } : {}),
              },
              createdByName: user.name || null,
            },
          })
        )
      );
      return rows[0];
    }

    return prisma.registerEntry.create({
      data: {
        date: body.date,
        kind,
        item,
        itemLabel,
        qty: !totalSale && Number.isFinite(qty) && qty > 0 ? qty : null,
        unit: !totalSale && Number.isFinite(qty) && qty > 0 ? unit || "kg" : null,
        rateInr: !totalSale && Number.isFinite(rate) && rate > 0 ? rate : null,
        amountInr: amount,
        paymentMode: mode,
        totalSale,
        drawKind: kind === "OWNER_DRAW" ? (body.drawKind === "full" ? "full" : "partial") : null,
        partyName,
        partyId,
        notes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: ((ownerPhonePe ? { ...(details || linkDetails || {}), channel: "OWNER_PHONEPE" } : details || linkDetails) as any) ?? undefined,
        createdByName: user.name || null,
      },
    });
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
