# AGENTS.md — Second Brain Desk (Mahadev Traders)

Instructions for any AI coding agent (ChatGPT / Codex, Claude, others) working on this repo.
Read this first, then `docs/handoff/00_START_HERE.md` (if present) for the full picture.

## What this is
A Next.js 14 (App Router) + TypeScript + Prisma 5 + PostgreSQL web app on Vercel, plus a Capacitor Android
wrapper (`mobile/`, app name "Mahadev Desk"). It runs the daily operations of an edible-oil business
(Bidar, India): retail counter (Weigh & Bill `/register/counter`), Cashier desk (`/register/cashier`),
Mill Desk (`/mill`), Mill Counter Desk (`/mill/counter`), Quick Register, job-work crushing, manufacturing,
barrels, stock, closing, reports, bot. Owner = Sahil (reads English). Counter manager reads Kannada.
Mill staff read only numbers. Production: https://mahadev-second-brain.vercel.app

## Commands
```bash
npm install
npm test                 # vitest, lib/**/*.test.ts only (~1,370 tests, must all pass)
npx next lint            # `next build` FAILS on lint errors (unused vars etc.) — always run before merging
npx prisma db push       # schema changes; NEVER `prisma migrate dev` (it offers to reset the whole DB)
npm run dev
```
`tsc` may show errors only because the Prisma client is not generated in a sandbox — that is noise, not a bug.

## Hard rules
1. **Schema changes are additive only** (new tables / nullable columns / new enum values). Production runs
   `prisma db push` without `--accept-data-loss` from `scripts/db-push.js` during the Vercel build; a failed push
   stops a production build on purpose.
2. **Pure logic goes in `lib/*.ts` with a test in `lib/__tests__/`.** Vitest only includes `lib/**/*.test.ts`
   (no component tests). Components stay thin.
3. **Never invent thresholds or rates.** Settled numbers: job-work ₹6/kg (shop keeps khali) and ₹10/kg
   (customer takes khali), 2% mass-balance tolerance, ₹300 cash-gap flag, ₹2,000 staff expense limit,
   2 kg barrel short flag, staff discount limit 10% per bill. Details: `docs/handoff/03_BUSINESS_RULES.md`.
4. **Business dates** are `"YYYY-MM-DD"` India-time strings from `businessDate()` in `lib/register.ts`. Never slice a UTC ISO string.
5. **Auth on every API route:** `getUser(req)` from `lib/registerServer.ts`; 401 if null; owner/staff rules; write an
   `AuditLog` row (`lib/auditServer.ts`) for edits/deletes of money or stock records. Roles: OWNER and STAFF
   (`lib/access.ts`, `middleware.ts`).
6. **Staff screens are icon-first and bilingual (English/Kannada).** Counter components use the `k("English","ಕನ್ನಡ")`
   helper. Kannada strings are drafts to be checked by the manager. Every tappable thing gets an icon.
7. **Never use the one-finger-up (raised index finger) symbol anywhere** — the owner finds it inappropriate. An open palm is fine.
8. **Oil is released to a customer only after the money is received** (counter process rule). "Keep oil in shop" is the
   explicit exception: money taken, oil collected later.
9. **No udhaar (credit) in job-work.** Only "Pay customer" or "Khali payment", by Cash or UPI.
10. **Flag clearly (never soften) anything that looks like unrecorded stock or an unbilled job-work batch** (GST Section 143 / ITC-04).
    Financial/tax output is informational, not professional advice.
11. Dialogs must use `z-index: 9000` — the app nav bar `.nd-bar` is 8000 and covers anything lower.
12. Mill Desk screen source is `tools/mill-desk/` — edit there and run `python3 tools/mill-desk/build.py`
    (writes `public/mill/desk.html`). Do not hand-edit the built file.
13. Android widget kinds: the order in `Widgets.KINDS` (Java) must match `WIDGETS` in `lib/widgetKinds.ts`
    (a test enforces it). Android changes need a new APK built by CI and installed on the phone.
14. Do not open `components/register/QuickRegister.tsx` unless the task needs it (large file).
15. Secrets never go in the repo. Variable names only: `.env.example`.

## Workflow (summary — full version in docs/handoff/02_WORKFLOW_GITHUB_VERCEL_ANDROID.md)
- One feature branch per request → commit → push → pull request into `main` → **squash merge** → confirm the
  `main` Vercel deployment is green (and the Android workflow if `mobile/**` changed).
- Vercel preview deployments of PR branches often show "Error" within seconds (project setting) — that is noise.
  The real build is the production deploy after merge. Always verify `main` after merging.
- After a big change, tell the owner in two or three plain sentences what changed and what could not be tested
  (nothing has been tried on the real tablet/printer/scale unless the owner said so).
