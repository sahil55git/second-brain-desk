// One layout.
//   PATCH   { name?, doc?, isDefault? }   rename, change the design, make it the default (owner only)
//   DELETE                                 remove it (owner only)
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { cleanName, docHeight, sanitizeDoc, type TemplateKind } from "@/lib/labelTemplate";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const owner = await requireOwner(req);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const name = body.name === undefined ? undefined : cleanName(body.name);
  if (name === "") return NextResponse.json({ error: "Give the layout a name." }, { status: 400 });

  const result = await safeDbCall(async () => {
    const row = await prisma.labelTemplate.findUnique({ where: { id: params.id } });
    if (!row) return { code: 404 as const, error: "No such layout." };
    const kind = row.kind as TemplateKind;
    const data: Prisma.LabelTemplateUpdateInput = { updatedBy: owner.username };
    if (name !== undefined && name !== row.name) {
      if (await prisma.labelTemplate.count({ where: { kind, name, NOT: { id: row.id } } })) return { code: 409 as const, error: "A layout with this name already exists." };
      data.name = name;
    }
    if (body.doc !== undefined) {
      const checked = sanitizeDoc(body.doc, kind);
      if (!checked.ok) return { code: 400 as const, error: checked.error };
      data.doc = checked.doc as unknown as Prisma.InputJsonValue;
      data.widthMm = checked.doc.widthMm;
      data.heightMm = docHeight(checked.doc);
    }
    if (body.isDefault === true) {
      await prisma.labelTemplate.updateMany({ where: { kind, isDefault: true, NOT: { id: row.id } }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (body.isDefault === false) data.isDefault = false;
    const saved = await prisma.labelTemplate.update({ where: { id: row.id }, data });
    return { code: 200 as const, row: saved };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  if ("error" in result.data) return NextResponse.json({ error: result.data.error }, { status: result.data.code });
  return NextResponse.json({ ok: true, data: result.data.row });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const owner = await requireOwner(req);
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });
  const result = await safeDbCall(async () => {
    const row = await prisma.labelTemplate.findUnique({ where: { id: params.id } });
    if (!row) return { code: 404 as const, error: "No such layout." };
    await prisma.labelTemplate.delete({ where: { id: row.id } });
    // the default must never point at nothing: hand it to the newest one left
    if (row.isDefault) {
      const next = await prisma.labelTemplate.findFirst({ where: { kind: row.kind }, orderBy: { updatedAt: "desc" } });
      if (next) await prisma.labelTemplate.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { code: 200 as const };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  if ("error" in result.data) return NextResponse.json({ error: result.data.error }, { status: result.data.code });
  return NextResponse.json({ ok: true });
}
