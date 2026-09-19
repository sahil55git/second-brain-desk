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
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";

  const [jobWorkResult, closingResult, mfgResult, partiesResult, itemsResult, settingsResult] =
    await Promise.all([
      safeDbCall(() => prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" } })),
      safeDbCall(() => prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" } })),
      safeDbCall(() => prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" } })),
      safeDbCall(() => prisma.party.findMany({ orderBy: { createdAt: "desc" } })),
      safeDbCall(() => prisma.item.findMany({ orderBy: { createdAt: "desc" } })),
      // Settings data is Owner-only — never fetched (let alone embedded in
      // the page payload) for a Staff session, matching the API route's
      // own server-side check. Staff never sees the Settings tab either
      // (DeskTabs.tsx), so this isn't just belt-and-suspenders on the UI —
      // it keeps the data itself out of a Staff session's page load.
      isOwner
        ? safeDbCall(async () => {
            const existing = await prisma.businessSettings.findUnique({
              where: { id: "singleton" },
            });
            return existing || prisma.businessSettings.create({ data: { id: "singleton" } });
          })
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
    : null;

  const jobWorkEntries: JobWorkIntakeDTO[] = jobWorkResult.ok
    ? JSON.parse(JSON.stringify(jobWorkResult.data))
    : [];
  const closingEntries: DailyClosingDTO[] = closingResult.ok
    ? JSON.parse(JSON.stringify(closingResult.data))
    : [];
  const mfgBatches: MfgBatchDTO[] = mfgResult.ok
    ? JSON.parse(JSON.stringify(mfgResult.data))
    : [];
  const parties: PartyDTO[] = partiesResult.ok
    ? JSON.parse(JSON.stringify(partiesResult.data))
    : [];
  const items: ItemDTO[] = itemsResult.ok ? JSON.parse(JSON.stringify(itemsResult.data)) : [];
  const settings: BusinessSettingsDTO | null =
    settingsResult.ok && settingsResult.data ? JSON.parse(JSON.stringify(settingsResult.data)) : null;

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Second Brain Desk</h1>
          <p className="text-sm opacity-70">
            Job-Work Desk, Manufacturing, Daily Closing, Parties, Inventory &amp; Reports.
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
          <code className="font-mono">npx prisma migrate dev</code> to enable saving and
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
        dbConnected={!dbError}
      />
    </main>
  );
}
