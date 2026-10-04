# Second Brain Desk — Phase 1 (coded rebuild)

This is a coded rebuild of Sahil's "Second Brain Desk" business dashboard
for an edible-oil business (self-crushing, job-work crushing under GST
Section 143, retail sales, and the developing "Ekatva" blend brand).

## Why this exists — the two-phase migration

The full-featured dashboard (25 shipped versions: Job-Work Desk,
Manufacturing, Mill Transfer, Stock Top-up, Daily Closing, Supplier
Payables, Khali Sale, Business Financials, AI terminals on every desk, a
self-service Custom Forms builder, full look-and-feel customization,
English/Kannada language toggle, and more) **still lives as a single-file
Claude Artifact** — a live, working tool Sahil uses today. That artifact
is not being replaced yet.

This repository is **Phase 1** of migrating that artifact into a proper
codebase — a real Next.js app, a real Postgres database via Prisma, and a
real test suite — instead of one big HTML file with an in-browser
document store. Phase 1 deliberately covers **only two of the artifact's
desks**, ported faithfully from the documented behavior of the live tool:

1. **Job-Work Desk** — intake, the customer/auto payment split, rate
   overrides, oil-can charges, inline settle/pay, and the Khali (cake)
   stock widget.
2. **Daily Closing** — the two fixed daily cash counts, the System Cash
   vs. Counter Cash computation and ₹300 mismatch flag, and the 10-product
   oil-stock tally with its "most recent prior entry" yesterday lookup.

Everything else on the live artifact (Manufacturing, Mill Transfer, Stock
Top-up, Supplier Payables, Khali Sale, Business Financials, the AI
terminals, the Custom Forms/formula engine, and full customization) is a
later phase — see **"Not yet built"** below. Nothing here changes or
retires the live artifact; it keeps running exactly as it does today.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Prisma** ORM targeting **PostgreSQL**
- Plain React state + `fetch` — server components for the initial page
  load, client components for the interactive forms/ledgers
- **Vitest** for unit tests on the pure calculation functions

## Running locally

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL
npx prisma migrate dev      # creates the tables
npm run prisma:seed         # optional — loads the two demo rows
npm run dev
```

If `DATABASE_URL` is left unset, the app still builds and renders — every
page shows a clear **"Database not connected yet"** banner instead of
crashing (see `lib/db.ts`'s `safeDbCall()`), so you can look at the UI
without a database provisioned.

### Running the tests

```bash
npm test
```

Covers the highest-stakes logic — `expectedSettlement()`,
`expectedSettlementWithRate()`, `defaultPaySplit()`, the ₹300 cash-gap
flag, the stock Gap/Diff calculation, and `getYesterdayStock()`'s
"most recent prior entry" lookup — in `lib/__tests__/calculations.test.ts`.
These are money- and GST/ITC-04-adjacent calculations ported directly from
the artifact's documented behavior (see
`claude/dashboard-app-plan.md`, Versions 11–14 and 23, in the project this
was built from) — nothing here invents a new rate or threshold.

### A note on `prisma generate` in a network-restricted environment

This repo was built in a sandboxed environment whose egress policy blocks
`binaries.prisma.sh` (Prisma's engine-binary CDN), so `npx prisma generate`
/ `npx prisma migrate dev` could not be run there. `lib/db.ts` is written
defensively for exactly this: constructing `PrismaClient` is wrapped in a
try/catch, so even a completely ungenerated client degrades to the same
"Database not connected yet" state rather than crashing the build. On a
normal machine, GitHub Actions runner, or Vercel build — all of which can
reach `binaries.prisma.sh` — `npx prisma generate` will succeed normally
and nothing here needs to change.

## Deploying on Vercel

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add a `DATABASE_URL` environment variable (Vercel Postgres, Neon,
   Supabase, etc. all work).
4. Add `npx prisma generate` to the build command if it isn't picked up by
   Vercel's automatic Prisma detection, and run
   `npx prisma migrate deploy` once against the production database.

## Project structure

```
app/
  page.tsx                    server component — fetches initial data, renders the two-tab layout
  api/
    job-work/route.ts         GET (list) / POST (create intake)
    job-work/[id]/route.ts    PATCH (edit any intake field)
    job-work/[id]/settle/route.ts   POST (inline pay/settle, split + rate override)
    daily-closing/route.ts    GET (list) / POST (create a closing count)
    daily-closing/[id]/route.ts     PATCH (edit cash/stock on an existing count)
components/
  DeskTabs.tsx                 client — the two-tab switcher
  JobWorkDesk.tsx               client — intake form + ledger + inline Pay/Edit
  DailyClosingDesk.tsx          client — closing form + ledger + inline Edit
lib/
  calculations.ts               pure functions — see "A note on prisma generate" above for why these matter
  db.ts                         Prisma client singleton + safeDbCall() wrapper
  types.ts                      shared client-side DTO types
  __tests__/calculations.test.ts
prisma/
  schema.prisma                 JobWorkIntake, DailyClosing models
  seed.ts                       two example rows matching the artifact's own demo data
```

## Quick Register (`/register`)

A simple, icon-first, English/Kannada counter register for the shop
manager, used at the moment of each transaction. Open **📒 Quick Register**
from the header, or go straight to `/register` on the shop phone (login
required; Staff and Owner both allowed).

- **Money In** (green): Sale (item-wise with qty × rate, or one "Total
  sale" figure from the scale slip), Udhaar received.
- **Money Out** (red): Purchase, Expense, Payment / Salary.
- **Job-Work** (blue): New intake + Pay/settle. These write to the
  **same `JobWorkIntake` rows as the Job-Work Desk** and use
  `lib/calculations.ts` unchanged; nothing is duplicated.
- **Cash taken out of counter** (orange, *not expense*): Pigmee, Sahil's
  withdrawal.
- **Count cash**: note-by-note count. Tally 1 / Tally 2 are saved as normal
  `DailyClosing` rows (AFTERNOON / NIGHT, `source = "register"`, note
  breakdown in `denoms`). System cash is computed on the server from what
  was logged *up to the moment of counting*, mapped into the desk's
  existing cash buckets, so the ₹300 mismatch rule applies unchanged.
- **Opening cash** = last NIGHT count of an earlier day (from either the
  register or the Daily Closing desk) + anything taken after that count;
  can be overridden for today.
- **Libraries**: rates remembered per item; "Other" items become permanent
  buttons; customer/supplier names are linked to (or added to) the shared
  Party master.
- **Language**: Both / English only / Kannada only, remembered per device.
- **Screen layout** (per device, Reports → Screen layout, or the ⇆ button):
  *Auto* = side by side on screens ≥ 1100 px, *Always side by side*
  (≥ 760 px), or *One column*. Side by side keeps the buttons on the left
  and opens forms in the right-hand panel above the job-work table and
  today's entries. Phones always use one column.
- **Favourites** (⭐ button): pin any buttons to a Favourites strip at the
  top. Summary / Today's entries / Job-Work sections can be folded; the
  choice is remembered per device.
- **Job-Work table**: same columns as the Job-Work Desk (Time, Customer +
  advance + cans, Auto/Vehicle + advance, Seed kg, Cake, Notes, Status,
  Pay / Edit). Edit uses the existing `PATCH /api/job-work/[id]`.
- **Reports**: day + month totals, thermal-printer slip, WhatsApp share,
  CSV copy for the accountant.
- **Permissions** (checked server-side): Staff can delete only today's
  entries and can only set today's opening; everything else in the
  register settings is Owner-only.

Only **cash** moves the counter figure; UPI and udhaar are recorded and
shown separately. It is a cash book, not a GST ledger — the accountant
still enters full invoices in Vyapar / the Sales & Purchase desks.

**Database change** (additive only): new `RegisterEntry` and
`RegisterConfig` tables, a `RegisterKind` enum, and two nullable columns
on `DailyClosing` (`denoms`, `source`). After deploying run
`npx prisma db push` (or `npx prisma migrate dev`) once against the
database. No existing data is changed.

Code: `app/register/`, `components/register/QuickRegister.tsx`,
`app/api/register/*`, `lib/register.ts` (pure maths, tested in
`lib/__tests__/register.test.ts`), `lib/registerServer.ts`,
`lib/registerI18n.ts`.

## Not yet built (Phase 2+)

Deliberately deferred, so nothing here gets silently forgotten:

- **Authentication** — this is a single-implicit-user app with no login
  screen. Phase 2 item.
- **i18n** — English only. The live artifact has full English/Kannada
  parity for Nilkant; this rebuild does not yet.
- **The other five desks**: Manufacturing (barrel/batch yield tracking),
  Mill Transfer Log, Stock Top-up Log, Supplier Payables, Khali Sale.
- **Business Financials** (the read-only Vyapar snapshot desk).
- **AI terminals** — the per-desk AI fill/analyse terminals, the global
  Reports & AI Q&A panel, the AI Business Advisor, and the cross-desk
  "Needs attention today" triage panel.
- **Custom Forms / the declarative formula engine** — Sahil's self-service
  form builder and safe expression engine from the live artifact.
- **Full look-and-feel customization** — theme, accent colour, tab/widget/
  column/row reordering, panel order, etc.
- **CSV/PDF export and report sharing.**
- **Retail sale entry and packaged-stock tracking** (Karadi pack, Ekatva)
  — still not built even in the live artifact; see
  `claude/dashboard-app-plan.md`'s "Confirmed modules still to build".

## A note on the numbers

This tool touches real money and GST Section 143 / ITC-04-relevant
job-work records. It is **not** a substitute for the accountant's Vyapar
reconciliation or for professional tax advice — treat anything it computes
as informational, and double-check anything compliance-relevant before
acting on it.
