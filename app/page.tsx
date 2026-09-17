import { prisma, safeDbCall } from "@/lib/db";
import DeskTabs from "@/components/DeskTabs";
import type { DailyClosingDTO, JobWorkIntakeDTO, MfgBatchDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [jobWorkResult, closingResult, mfgResult] = await Promise.all([
    safeDbCall(() => prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.dailyClosing.findMany({ orderBy: { createdAt: "desc" } })),
    safeDbCall(() => prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" } })),
  ]);

  const dbError = !jobWorkResult.ok
    ? jobWorkResult.error
    : !closingResult.ok
    ? closingResult.error
    : !mfgResult.ok
    ? mfgResult.error
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

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Second Brain Desk</h1>
        <p className="text-sm opacity-70">
          Coded rebuild — Job-Work Desk, Manufacturing &amp; Daily Closing. Single-user, no login yet.
        </p>
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
        dbConnected={!dbError}
      />
    </main>
  );
}
