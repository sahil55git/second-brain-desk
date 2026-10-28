// Label / receipt layouts from the designer.
//   GET   ?kind=label|slip   every saved layout of that kind (any signed-in user with the barrels pages)
//   POST  { name, kind, doc, makeDefault? }   save a new one (owner only)
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { requireOwner } from "@/lib/ownerGuard";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { cleanName, docHeight, sanitizeDoc, type TemplateKind } from "@/lib/labelTemplate";

export const dynamic = "force-dynamic";

const kindOf = (v: unknown): TemplateKind | null => (v === "label" || v === "slip" ? v : null);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const kind = kindOf(req.nextUrl.searchParams.get("kind"));
  const result = await safeDbCall(() => prisma.labelTemplate.findMany({ where: kind ? { kind } : undefined, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 100 }));
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });
  const body = await req.json().catch(() => null);
  const kind = kindOf(body?.kind);
  if (!kind) return NextResponse.json({ error: "Say whether this is a label or a slip." }, { status: 400 });
  const name = cleanName(body?.name);
  if (!name) return NextResponse.json({ error: "Give the layout a name." }, { status: 400 });
  const checked = sanitizeDoc(body?.doc, kind);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const doc = checked.doc;
  const makeDefault = body?.makeDefault === true;
  const result = await safeDbCall(async () => {
    const same = await prisma.labelTemplate.count({ where: { kind, name } });
    if (same) return { code: 409 as const, error: "A layout with this name already exists." };
    const count = await prisma.labelTemplate.count({ where: { kind } });
    const isDefault = makeDefault || count === 0;
    if (isDefault) await prisma.labelTemplate.updateMany({ where: { kind, isDefault: true }, data: { isDefault: false } });
    const row = await prisma.labelTemplate.create({ data: { name, kind, widthMm: doc.widthMm, heightMm: docHeight(doc), doc: doc as unknown as Prisma.InputJsonValue, isDefault, updatedBy: owner.username } });
    return { code: 201 as const, row };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  if ("error" in result.data) return NextResponse.json({ error: result.data.error }, { status: result.data.code });
  return NextResponse.json({ ok: true, data: result.data.row }, { status: 201 });
}
