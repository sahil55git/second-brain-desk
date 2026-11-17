// Counter bills — mark a UPI payment as received, collect an udhaar bill's money, or change
// whether the goods are given or held. Staff: today's bills only; the owner any day.
import { NextRequest, NextResponse } from "next/server";
import { rupees, writeAudit } from "@/lib/auditServer";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { trackOf } from "@/lib/counterTrack";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 40) : [];
  const action = body.action;
  if (!ids.length || !["handover", "upiOk", "paidLater"].includes(action)) return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  const mode: "CASH" | "UPI" = body.mode === "UPI" ? "UPI" : "CASH";
  const handover = body.value === "HELD" ? "HELD" : "GIVEN";

  const found = await safeDbCall(() => prisma.registerEntry.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  const rows = found.data;
  if (rows.length !== ids.length || rows.some((r) => r.kind !== "SALE")) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  const today = businessDate(Date.now());
  if (!user.isOwner && rows.some((r) => r.date !== today)) return NextResponse.json({ error: "Only the owner can change earlier days' bills." }, { status: 403 });

  const by = user.name || user.username;
  const now = new Date().toISOString();
  const cur = trackOf(rows[0].details);
  const credit = Math.round(rows.filter((r) => r.paymentMode === "CREDIT").reduce((a, r) => a + r.amountInr, 0) * 100) / 100;
  const upi = rows.some((r) => r.paymentMode === "UPI");
  if (action === "upiOk" && !upi) return NextResponse.json({ error: "This bill has no UPI part." }, { status: 400 });
  if (action === "upiOk" && cur.upiOk) return NextResponse.json({ error: "UPI is already marked received." }, { status: 400 });
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
      if (action === "upiOk") patch.upiOk = { at: now, by };
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
        `Bill ${billNo ? "#" + billNo + " " : ""}${action === "handover" ? (handover === "HELD" ? "goods held" : "goods handed over") : action === "upiOk" ? "UPI received" : `udhaar ${rupees(credit)} collected by ${mode}`}`);
      return patch;
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: { track: result.data } });
}
