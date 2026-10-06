// Bulk import of parties / register items / stock items. Owner only.
// The client sends the sheet as a table (rows of cells); parsing and the
// duplicate check run HERE with the same pure code the preview used.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, loadConfig, saveConfig } from "@/lib/registerServer";
import {
  applyRegisterItems,
  parseParties,
  parseRegisterItems,
  parseStockItems,
  planParties,
  planStockItems,
  type ImportKind,
} from "@/lib/bulkImport";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can import lists." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = body.type as ImportKind;
  const dryRun = body.dryRun !== false; // preview unless explicitly committed
  if (!["parties", "registerItems", "stockItems"].includes(type) || !Array.isArray(body.table)) {
    return NextResponse.json({ error: "Send { type, table }." }, { status: 400 });
  }
  const table = (body.table as unknown[]).slice(0, 2100) as unknown[][];

  const result = await safeDbCall(async () => {
    if (type === "parties") {
      const { rows, issues } = parseParties(table);
      const existing = await prisma.party.findMany({ select: { name: true } });
      const plan = planParties(rows, existing.map((p: { name: string }) => p.name));
      if (!dryRun && plan.add.length) {
        await prisma.party.createMany({
          data: plan.add.map((r) => ({ ...r, notes: r.notes ? r.notes : "Imported from Excel" })),
        });
      }
      return { type, dryRun, found: rows.length, add: plan.add.length, skipped: plan.skipped.slice(0, 50), skippedCount: plan.skipped.length, issues, sample: plan.add.slice(0, 8).map((r) => r.name) };
    }
    if (type === "stockItems") {
      const { rows, issues } = parseStockItems(table);
      const existing = await prisma.item.findMany({ select: { name: true, sku: true } });
      const plan = planStockItems(rows, existing);
      if (!dryRun && plan.add.length) await prisma.item.createMany({ data: plan.add });
      return { type, dryRun, found: rows.length, add: plan.add.length, skipped: plan.skipped.slice(0, 50), skippedCount: plan.skipped.length, issues, sample: plan.add.slice(0, 8).map((r) => r.name) };
    }
    const { rows, issues } = parseRegisterItems(table);
    const cfg = await loadConfig();
    const applied = applyRegisterItems(cfg, rows);
    if (!dryRun && (applied.added || applied.rated)) await saveConfig(applied.cfg);
    return {
      type,
      dryRun,
      found: rows.length,
      add: applied.added,
      rated: applied.rated,
      skipped: [] as string[],
      skippedCount: applied.existing,
      issues,
      sample: rows.slice(0, 8).map((r) => r.label),
    };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
