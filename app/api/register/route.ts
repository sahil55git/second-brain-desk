// Quick Register — GET the day bundle, POST a new entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate, loadConfig, loadDay, saveConfig } from "@/lib/registerServer";
import { ALL_KINDS, KIND_SIDE, channelToMode, learnItem, normalizeFreshCrush, normalizeSplit, rateKey, type RegisterKind } from "@/lib/register";

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
        details: ((ownerPhonePe ? { ...(details || {}), channel: "OWNER_PHONEPE" } : details) as any) ?? undefined,
        createdByName: user.name || null,
      },
    });
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
