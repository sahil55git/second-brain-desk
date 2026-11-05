// The supplier's read-only view of one purchase order, by the secret link the owner shared
// (/po/<token>). No sign-in: the long random token is the key, and the owner can switch it off
// (Revoke link) or turn the whole thing off in Settings → Features ("PO share link"). Only what is
// printed on the order is returned — no who-made-it, no prices from other orders.
import { NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { featureOn } from "@/lib/featuresServer";
import type { PoLine } from "@/lib/ops";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const gone = () => NextResponse.json({ error: "This link is not active any more. Ask the shop for a new one." }, { status: 404, headers: HEADERS });

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token || "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return gone();
  if (!(await featureOn("poShare").catch(() => true))) return gone();
  const r = await safeDbCall(async () => {
    const po = await prisma.purchaseOrder.findUnique({ where: { shareToken: token } });
    if (!po) return null;
    const shop = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
    return { po, shop };
  });
  if (!r.ok || !r.data) return gone();
  const { po, shop } = r.data;
  return NextResponse.json(
    {
      po: { no: po.no, rev: po.rev, date: po.date, dueDate: po.dueDate, supplier: po.supplier, phone: null, lines: po.lines as unknown as PoLine[], notes: po.notes, terms: po.terms, deliverTo: po.deliverTo, transport: po.transport, status: po.status },
      shop: { name: shop?.businessName || "", gstin: shop?.gstin || null, address: shop?.address || null, phone: shop?.phone || null, email: shop?.email || null },
    },
    { headers: HEADERS },
  );
}
