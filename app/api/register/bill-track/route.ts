// Counter bills — mark a UPI payment as received, collect an udhaar bill's money, or change
// whether the goods are given or held. Staff: today's bills only; the owner any day.
import { NextRequest, NextResponse } from "next/server";
import { rupees, writeAudit } from "@/lib/auditServer";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { trackOf } from "@/lib/counterTrack";
import { planSettle } from "@/lib/billSettle";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 40) : [];
  const action = body.action;
  if (!ids.length || !["handover", "upiOk", "cashOk", "paidLater", "settle"].includes(action)) return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  const mode: "CASH" | "UPI" = body.mode === "UPI" ? "UPI" : "CASH";
  const handover = body.value === "HELD" ? "HELD" : "GIVEN";
  // details of the UPI payment this confirms (from the UPI app's notification), kept on the bill
  const txt = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[^\w .,:@/#₹&'-]/g, "").trim().slice(0, n) : "");
  const proof = {
    ref: txt(body.ref, 40),
    payer: txt(body.payer, 60),
    pkg: txt(body.pkg, 80),
    evId: txt(body.evId, 80),
    amount: Number.isFinite(Number(body.amount)) && Number(body.amount) > 0 ? Math.round(Number(body.amount) * 100) / 100 : 0,
    evAt: Number.isFinite(Number(body.evAt)) && Number(body.evAt) > 0 ? Math.round(Number(body.evAt)) : 0,
  };
  // cash counter: what the customer handed over, and release the goods in the same step
  const given = Number.isFinite(Number(body.given)) && Number(body.given) > 0 ? Math.round(Number(body.given) * 100) / 100 : 0;
  const release = body.release === true;
  const via = typeof body.via === "string" ? body.via.replace(/[^\w .,:₹/-]/g, "").slice(0, 60) : "";

  const found = await safeDbCall(() => prisma.registerEntry.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  const rows = found.data;
  if (rows.length !== ids.length || rows.some((r) => r.kind !== "SALE")) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  const today = businessDate(Date.now());
  if (!user.isOwner && rows.some((r) => r.date !== today)) return NextResponse.json({ error: "Only the owner can change earlier days' bills." }, { status: 403 });

  const by = user.name || user.username;
  const now = new Date().toISOString();
  const cur = trackOf(rows[0].details);
  // a printed bill with no payment mode yet: the money is recorded through "Receive payment" only, so the cash book,
  // UPI and udhaar always follow what was really paid (no ticking "cash in" or giving the oil on an undecided bill)
  if (cur.payPending && action !== "settle" && !(action === "handover" && handover === "HELD")) {
    return NextResponse.json({ error: "Choose how the customer paid first: tap Receive payment." }, { status: 400 });
  }
  if (action === "settle") {
    // "Pay at the queue": choose how a printed, unpaid bill was paid (cash / UPI / udhaar / split)
    if (!cur.payPending) return NextResponse.json({ error: "This bill already has its payment mode." }, { status: 400 });
    const dOf = (r: (typeof rows)[number]) => (r.details && typeof r.details === "object" ? r.details : {}) as { split?: { id?: string; i?: number }; bill?: { line?: number; lines?: number } };
    const ordered = [...rows].sort((a, b) => (dOf(a).split?.i ?? 0) - (dOf(b).split?.i ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
    const partsIn: { mode: string; amount: number }[] = Array.isArray(body.parts) ? body.parts.map((p: { mode?: unknown; amount?: unknown }) => ({ mode: String(p?.mode), amount: Number(p?.amount) })) : [];
    const plan = planSettle(ordered.map((r) => ({ id: r.id, amountInr: r.amountInr, paymentMode: r.paymentMode, line: dOf(r).bill?.line })), partsIn);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
    const cashPart = Math.round(partsIn.filter((p) => p.mode === "CASH").reduce((a, p) => a + p.amount, 0) * 100) / 100;
    const upiPart = partsIn.some((p) => p.mode === "UPI" && p.amount > 0);
    const creditPart = partsIn.some((p) => p.mode === "CREDIT" && p.amount > 0);
    const gv = Number.isFinite(Number(body.given)) && Number(body.given) > 0 ? Math.round(Number(body.given) * 100) / 100 : 0;
    if (cashPart > 0 && gv && gv < cashPart - 0.005) return NextResponse.json({ error: `The customer gave ₹${gv} but the cash due is ₹${cashPart}.` }, { status: 400 });
    const pname = typeof body.partyName === "string" && body.partyName.trim() ? body.partyName.trim().slice(0, 120) : rows[0].partyName;
    if (creditPart && !pname) return NextResponse.json({ error: "Enter the customer's name for the udhaar part." }, { status: 400 });
    const upiOkNow = body.upiConfirmed === true && upiPart;
    const wantRelease = body.release === true && !(upiPart && !upiOkNow);
    const billNoS = Number((rows[0].details as { billNo?: unknown } | null)?.billNo) || null;
    const res = await safeDbCall(() =>
      prisma.$transaction(async (tx) => {
        let partyId = rows[0].partyId;
        if (creditPart && pname) {
          const ex = await tx.party.findFirst({ where: { name: { equals: pname, mode: "insensitive" } }, select: { id: true } });
          partyId = ex?.id || (await tx.party.create({ data: { name: pname, type: "CUSTOMER", notes: "Added from Quick Register" }, select: { id: true } })).id;
        }
        const partyData = creditPart ? { partyName: pname, partyId } : {};
        const first = ordered[0];
        const gid = dOf(first).split?.id || `bl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        const n = plan.items.length;
        const lines = Math.max(1, ...ordered.map((r) => dOf(r).bill?.lines ?? 0), ...plan.items.map((x) => x.line));
        const multi = ordered.some((r) => dOf(r).bill);
        const track: Record<string, unknown> = { ...cur };
        delete track.payPending;
        if (cashPart > 0) {
          track.cashWait = true;
          track.cashOk = { at: now, by, ...(gv ? { given: gv, change: Math.round((gv - cashPart) * 100) / 100 } : {}) };
        } else delete track.cashWait;
        if (upiOkNow) track.upiOk = { at: now, by: via ? `${by} · ${via}` : by };
        if (wantRelease) Object.assign(track, { handover: "GIVEN", handedAt: now });
        for (const it of plan.items) {
          const src = ordered.find((r) => r.id === it.copyOf)!;
          const prev = (src.details && typeof src.details === "object" ? src.details : {}) as Record<string, unknown>;
          const base = { ...prev, split: { id: gid, i: it.i, n, total: plan.total }, ...(multi ? { bill: { line: it.line, lines } } : {}) };
          if (it.id) {
            const isFirst = it.id === first.id;
            await tx.registerEntry.update({
              where: { id: it.id },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: { amountInr: it.amountInr, paymentMode: it.paymentMode, ...partyData, details: { ...base, ...(isFirst ? { track } : {}) } as any },
            });
          } else {
            const { billNo: _b, track: _t, clientId: _c, ...rest } = base as Record<string, unknown>;
            void _b; void _t; void _c;
            await tx.registerEntry.create({
              data: {
                date: src.date, kind: src.kind, item: src.item, itemLabel: src.itemLabel, qty: null, unit: null, rateInr: null,
                amountInr: it.amountInr, paymentMode: it.paymentMode, totalSale: false,
                partyName: creditPart ? pname : src.partyName, partyId: creditPart ? partyId : src.partyId, notes: src.notes,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                details: rest as any, createdByName: src.createdByName,
              },
            });
          }
        }
        // the first row of the bill must carry the bill number and the track
        if (!plan.items.some((x) => x.id === first.id)) throw new Error("Settle lost the first row.");
        await writeAudit(tx, user, "EDIT", "RegisterEntry", first.id,
          `Bill ${billNoS ? "#" + billNoS + " " : ""}payment received: ${partsIn.filter((p) => p.amount > 0).map((p) => `${p.mode} ${rupees(p.amount)}`).join(" + ")}${gv ? `, cash given ₹${gv}` : ""}${wantRelease ? ", goods released" : ""}`);
        return track;
      })
    );
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });
    return NextResponse.json({ data: { track: res.data } });
  }

  const credit = Math.round(rows.filter((r) => r.paymentMode === "CREDIT").reduce((a, r) => a + r.amountInr, 0) * 100) / 100;
  const upi = rows.some((r) => r.paymentMode === "UPI");
  if (action === "cashOk") {
    if (!rows.some((r) => r.paymentMode === "CASH")) return NextResponse.json({ error: "This bill has no cash part." }, { status: 400 });
    if (!cur.cashWait) return NextResponse.json({ error: "This bill's cash was taken at once; nothing to confirm." }, { status: 400 });
    if (cur.cashOk) return NextResponse.json({ error: "Cash is already marked received." }, { status: 400 });
    const cashTotal = Math.round(rows.filter((r) => r.paymentMode === "CASH").reduce((a, r) => a + r.amountInr, 0) * 100) / 100;
    if (given && given < cashTotal - 0.005) return NextResponse.json({ error: `The customer gave ₹${given} but the cash due is ₹${cashTotal}.` }, { status: 400 });
  }
  if (action === "upiOk" && !upi) return NextResponse.json({ error: "This bill has no UPI part." }, { status: 400 });
  if (action === "upiOk" && cur.upiOk) return NextResponse.json({ error: "UPI is already marked received." }, { status: 400 });
  if (action === "upiOk") {
    // a payment can pay one bill only: the amount must be this bill's UPI part, and its reference must not be on another bill
    const upiTotal = Math.round(rows.filter((r) => r.paymentMode === "UPI").reduce((a, r) => a + r.amountInr, 0) * 100) / 100;
    if (proof.amount && Math.abs(proof.amount - upiTotal) > 0.005) return NextResponse.json({ error: `That payment is ₹${proof.amount} but this bill's UPI part is ₹${upiTotal}.` }, { status: 400 });
    if (proof.ref.length >= 8) {
      const other = await safeDbCall(() =>
        prisma.registerEntry.findFirst({ where: { id: { notIn: ids }, details: { path: ["track", "upiOk", "ref"], equals: proof.ref } } })
      );
      if (other.ok && other.data) {
        const no = Number((other.data.details as { billNo?: unknown } | null)?.billNo) || null;
        return NextResponse.json({ error: `This payment (Ref ${proof.ref}) is already linked to ${no ? "bill #" + no : "another bill"}.` }, { status: 409 });
      }
    }
  }
  if (action === "paidLater") {
    if (credit <= 0) return NextResponse.json({ error: "This bill has no udhaar part." }, { status: 400 });
    if (cur.paidLater) return NextResponse.json({ error: "Already collected." }, { status: 400 });
    if (!rows[0].partyName) return NextResponse.json({ error: "The udhaar needs the customer's name." }, { status: 400 });
  }
  const billNo = Number((rows[0].details as { billNo?: unknown } | null)?.billNo) || null;

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const patch: Record<string, unknown> = { ...cur };
      if (action === "handover") Object.assign(patch, { handover, handedAt: handover === "GIVEN" ? now : undefined });
      if (action === "upiOk") {
        patch.upiOk = {
          at: now, by: via ? `${by} · ${via}` : by,
          ...(proof.ref ? { ref: proof.ref } : {}), ...(proof.payer ? { payer: proof.payer } : {}), ...(proof.amount ? { amount: proof.amount } : {}),
          ...(proof.pkg ? { pkg: proof.pkg } : {}), ...(proof.evId ? { evId: proof.evId } : {}), ...(proof.evAt ? { evAt: proof.evAt } : {}),
        };
      }
      if (action === "cashOk") {
        const cashTotal = Math.round(rows.filter((r) => r.paymentMode === "CASH").reduce((a, r) => a + r.amountInr, 0) * 100) / 100;
        patch.cashOk = { at: now, by, ...(given ? { given, change: Math.round((given - cashTotal) * 100) / 100 } : {}) };
        if (release) Object.assign(patch, { handover: "GIVEN", handedAt: now });
      }
      if (action === "paidLater") {
        // Collecting the udhaar is real money in: an "udhaar received" entry, so cash book and the customer's balance follow.
        await tx.registerEntry.create({
          data: {
            date: today, kind: "UDHAAR_IN", amountInr: credit, paymentMode: mode,
            partyName: rows[0].partyName, partyId: rows[0].partyId,
            notes: billNo ? `Bill #${billNo} paid` : "Bill paid", createdByName: user.name || null,
            details: { forBill: billNo ?? rows[0].id },
          },
        });
        patch.paidLater = { at: now, by, mode, amount: credit };
      }
      for (let i = 0; i < rows.length; i++) {
        const prev = (rows[i].details && typeof rows[i].details === "object" ? rows[i].details : {}) as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.registerEntry.update({ where: { id: rows[i].id }, data: { details: { ...prev, track: patch } as any } });
      }
      await writeAudit(tx, user, "EDIT", "RegisterEntry", rows[0].id,
        `Bill ${billNo ? "#" + billNo + " " : ""}${action === "handover" ? (handover === "HELD" ? "goods held" : "goods handed over") : action === "cashOk" ? `cash received${given ? " ₹" + given : ""}${release ? ", goods released" : ""}` : action === "upiOk" ? `UPI received${via ? " (" + via + ")" : ""}${proof.payer ? " from " + proof.payer : ""}${proof.ref ? " · Ref " + proof.ref : ""}` : `udhaar ${rupees(credit)} collected by ${mode}`}`);
      return patch;
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: { track: result.data } });
}
