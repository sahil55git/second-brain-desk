import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, safeDbCall } from "@/lib/db";
import DeskTabs from "@/components/DeskTabs";
import CustomizeButton from "@/components/CustomizeButton";
import SignOutButton from "@/components/SignOutButton";
import type {
  DailyClosingDTO,
  JobWorkIntakeDTO,
  MfgBatchDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
  SalesInvoiceDTO,
  PurchaseBillDTO,
  ExpenseDTO,
  VyaparSnapshotDTO,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";

  const [
    jobWorkResult,
    closingResult,
    mfgResult,
    partiesResult,
    itemsResult,
    settingsResult,
    salesResult,
    purchasesResult,
    expensesResult,
    vyaparResult,
  ] = await Promise.all([
    safeDbCall(() => prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.party.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.item.findMany({ orderBy: { createdAt: "desc" } })),
    // Business settings are read by everyone: Sales/Purchase need the home
    // state (CGST/SGST vs IGST), default GST rate, and invoice prefix, and the
    // GSTIN prints on every invoice a Staff member creates anyway. EDITING
    // settings stays Owner-only (the Settings tab is hidden from Staff, and
    // PATCH /api/settings refuses non-Owner sessions).
    safeDbCall(async () => {
      const existing = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
      return existing || prisma.businessSettings.create({ data: { id: "singleton" } });
    }),
    safeDbCall(() =>
      prisma.salesInvoice.findMany({
        orderBy: { createdAt: "desc" },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
      })
    ),
    safeDbCall(() =>
      prisma.purchaseBill.findMany({
        orderBy: { createdAt: "desc" },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
      })
    ),
    safeDbCall(() =>
      prisma.expense.findMany({
        orderBy: { createdAt: "desc" },
        include: { party: { select: { id: true, name: true } } },
      })
    ),
    // Vyapar snapshot is Owner-only (financial totals) — never fetched for a
    // Staff session, matching /api/vyapar's own server-side check and the
    // Owner-only tab in DeskTabs.
    isOwner
      ? safeDbCall(() => prisma.vyaparSnapshot.findUnique({ where: { id: "singleton" } }))
      : Promise.resolve({ ok: true as const, data: null }),
  ]);

  const dbError = !jobWorkResult.ok
    ? jobWorkResult.error
    : !closingResult.ok
    ? closingResult.error
    : !mfgResult.ok
    ? mfgResult.error
    : !partiesResult.ok
    ? partiesResult.error
    : !itemsResult.ok
    ? itemsResult.error
    : !salesResult.ok
    ? salesResult.error
    : !purchasesResult.ok
    ? purchasesResult.error
    : !expensesResult.ok
    ? expensesResult.error
    : null;

  const s = <T,>(r: { ok: true; data: unknown } | { ok: false }): T[] =>
    r.ok ? (JSON.parse(JSON.stringify(r.data)) as T[]) : [];

  const jobWorkEntries = s<JobWorkIntakeDTO>(jobWorkResult);
  const closingEntries = s<DailyClosingDTO>(closingResult);
  const mfgBatches = s<MfgBatchDTO>(mfgResult);
  const parties = s<PartyDTO>(partiesResult);
  const items = s<ItemDTO>(itemsResult);
  const sales = s<SalesInvoiceDTO>(salesResult);
  const purchases = s<PurchaseBillDTO>(purchasesResult);
  const expenses = s<ExpenseDTO>(expensesResult);
  const settings: BusinessSettingsDTO | null =
    settingsResult.ok && settingsResult.data
      ? JSON.parse(JSON.stringify(settingsResult.data))
      : null;
  const vyapar: VyaparSnapshotDTO | null =
    vyaparResult.ok && vyaparResult.data
      ? JSON.parse(JSON.stringify(vyaparResult.data))
      : null;

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Second Brain Desk</h1>
          <p className="text-sm opacity-70">
            Job-Work, Manufacturing, Daily Closing, Sales, Purchase, Expenses, Parties,
            Inventory &amp; Reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomizeButton />
          <SignOutButton />
        </div>
      </header>

      {dbError && (
        <div className="mb-6 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <strong className="font-semibold">Database not connected yet.</strong>{" "}
          Set <code className="font-mono">DATABASE_URL</code> and run{" "}
          <code className="font-mono">npx prisma db push</code> to enable saving and
          loading data. The forms below still render so you can see the UI.
          <div className="mt-1 text-xs opacity-70">{dbError}</div>
        </div>
      )}

      <DeskTabs
        initialJobWork={jobWorkEntries}
        initialClosing={closingEntries}
        initialMfg={mfgBatches}
        initialParties={parties}
        initialItems={items}
        initialSettings={settings}
        initialSales={sales}
        initialPurchases={purchases}
        initialExpenses={expenses}
        initialVyapar={vyapar}
        dbConnected={!dbError}
      />
    </main>
  );
}
