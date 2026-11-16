// Runs during `npm run build` on Vercel so new tables (Attachment, OilReceipt, Barrel,
// ScaleTick...) are created automatically. `prisma db push` WITHOUT --accept-data-loss only
// applies safe additive changes and refuses anything destructive.
//
// Production: if the tables could not be brought up to date (after one retry), the build
// STOPS, so the old working version stays live instead of new code running against an old
// database. Preview builds only warn.
const { spawnSync } = require("child_process");

if (!process.env.VERCEL || !process.env.DATABASE_URL) {
  console.log("[db-push] skipped (not a Vercel build or DATABASE_URL not set)");
  process.exit(0);
}
const push = () => spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit", shell: process.platform === "win32" }).status;
let status = push();
if (status !== 0) {
  console.warn("[db-push] failed once, trying again in 8 seconds (the database may have been asleep)");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8000);
  status = push();
}
if (status === 0) process.exit(0);
if (process.env.VERCEL_ENV === "production") {
  console.error("[db-push] FAILED twice. Stopping this production build so the live site keeps the version that matches its database. Run `npx prisma db push` against the production database, or fix the schema, then redeploy.");
  process.exit(1);
}
console.warn("[db-push] FAILED - preview build continues. Run `npx prisma db push` manually against this database.");
process.exit(0);
