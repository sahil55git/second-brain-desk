// Runs during `npm run build` on Vercel so new tables (Attachment, OilReceipt, Barrel,
// ScaleTick...) are created automatically. `prisma db push` WITHOUT --accept-data-loss only
// applies safe additive changes and refuses anything destructive. A failure here never
// blocks the deploy; the app still shows its "database not connected" message instead.
const { spawnSync } = require("child_process");

if (!process.env.VERCEL || !process.env.DATABASE_URL) {
  console.log("[db-push] skipped (not a Vercel build or DATABASE_URL not set)");
  process.exit(0);
}
const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) console.warn("[db-push] FAILED - run `npx prisma db push` manually against the production database.");
process.exit(0);
