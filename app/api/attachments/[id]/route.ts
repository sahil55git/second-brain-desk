// One proof / scan: GET (with the image if it is still kept in the app),
// PATCH (link to a register entry, correct scanned fields), DELETE (Owner only).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { LIGHT_SELECT, TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { isScanKind, normalizeScan } from "@/lib/proofs";

export const dynamic = "force-dynamic";

const fail = (err: string) => NextResponse.json({ error: missingTable(err) ? TABLE_HINT : err }, { status: 503 });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const r = await safeDbCall(() => prisma.attachment.findUnique({ where: { id: params.id }, select: { ...LIGHT_SELECT, dataUrl: true } }));
  if (!r.ok) return fail(r.error);
  if (!r.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.isOwner && r.data.date !== businessDate(Date.now())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  return NextResponse.json({ data: r.data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const today = businessDate(Date.now());

  const r = await safeDbCall(async () => {
    const row = await prisma.attachment.findUnique({ where: { id: params.id }, select: { id: true, kind: true, date: true, registerEntryId: true } });
    if (!row) return null;
    // Staff can only touch today's records, and can never move a proof off an entry it already proves.
    if (!user.isOwner && (row.date !== today || (row.registerEntryId && body.registerEntryId !== row.registerEntryId))) throw new Error("OWNER_ONLY");
    const data: Record<string, unknown> = {};
    if (typeof body.registerEntryId === "string" && body.registerEntryId) {
      const e = await prisma.registerEntry.findUnique({ where: { id: body.registerEntryId }, select: { id: true, date: true } });
      if (!e) throw new Error("NO_ENTRY");
      if (!user.isOwner && e.date !== today) throw new Error("OWNER_ONLY");
      data.registerEntryId = e.id;
    }
    if (body.fields && typeof body.fields === "object" && isScanKind(row.kind)) data.fields = normalizeScan(row.kind, body.fields);
    if (typeof body.notes === "string") data.notes = body.notes.trim().slice(0, 500) || null;
    if (typeof body.partyName === "string") data.partyName = body.partyName.trim().slice(0, 120) || null;
    return prisma.attachment.update({ where: { id: row.id }, data, select: LIGHT_SELECT });
  });
  if (!r.ok) {
    if (r.error.includes("OWNER_ONLY")) return NextResponse.json({ error: "Only the owner can change this record." }, { status: 403 });
    if (r.error.includes("NO_ENTRY")) return NextResponse.json({ error: "That register entry was not found." }, { status: 404 });
    return fail(r.error);
  }
  if (!r.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Proofs are evidence against mistakes and misuse — only the Owner may remove one.
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can delete a proof." }, { status: 403 });
  const r = await safeDbCall(() => prisma.attachment.delete({ where: { id: params.id } }));
  if (!r.ok) return fail(r.error);
  // The Drive copy is left in place on purpose (Drive keeps its own history).
  return NextResponse.json({ ok: true });
}
