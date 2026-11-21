# 04 — App state (as of 21 Nov 2026, after PR #171) and backlog

Repo `sahil55git/second-brain-desk`, `main`. 171 PRs merged. 137 test files / 1,373 tests passing. Full PR list: `docs/handoff/merged_pr_history.txt`. DB models: `prisma/schema.prisma` (~66 models).

## Feature map by route
| Area | Route | Notes |
|---|---|---|
| Weigh & Bill counter | `/register/counter` | Retail loose-oil counter: scale, items, bill, print, hold, pay-at-queue, keep-oil. Components `components/counter/*` (`CounterApp`, `ReceivePayment`, …), CSS `ctr-*`, `rp-*` |
| Cashier desk | `/register/cashier` | Second person takes money for bills printed at the counter. `components/counter/CashierDesk.tsx`, `cashier.css` (`cd-*`). Queue, bill cards, Receive/Return card, bulk select-many, Hold, Keep oil, guide + flashing next-step |
| Bills (Weigh & Bill) | counter → Bills tab | Multi-select, search, Reports tab, cancel/edit rules (staff same-day only) |
| Mill Desk | `/mill` (built page `public/mill/desk.html`, source `tools/mill-desk/`) | Job-work weighing, customer no., advances, settle, receipts/stickers, own-crush runs, khali stack, Kannada, worker mode. Demo `?demo=1` |
| Mill Counter Desk | `/mill/counter` | Counter-side view of mill jobs/money |
| Quick Register | `/register` (`components/register/QuickRegister.tsx` — large) | Sales, purchases, expenses, job-work, stock movements |
| Job-Work Desk (older) | `/job-work` | Keeps its own money rule |
| Manufacturing / barrels / barrel fleet | `/manufacturing`, `/barrels`, `/barrel-fleet` | Batches, blind receiving, BRL-01…20 |
| Daily closing | `/daily-closing` | Cash + stock counts, ₹300 gap flag |
| Reports / audit / access | `/reports`, `/audit`, `/access` | Roles OWNER/STAFF, per-page/function permission profiles (`lib/access.ts`) |
| Bot / Telegram / Discord / WhatsApp | `/api/bot/*` | Chat bot with cron summaries |
| Android | `mobile/` | Capacitor wrapper, native Bluetooth scale/printer, UPI notification reader, home-screen widgets |

## Recent work (latest 25 PRs, all merged)
#147 mill labels QR · #148 robust self-reconnecting Bluetooth scale/printer · #149–#153 printers (MPT-III receipt, label printer, USB, never hold a shared receipt printer) · #154 type weight by hand when scale offline · #155–#161 Mill Desk updates (optional token print, advance edit/return, customer-khali pays back advance, customer name on Waiting list, New job from Worker mode, customer no. > 9) · #158 Weigh & Bill pay dialog (dark theme, number pad, smart cash suggestions) · #162–#165 Weigh & Bill bills multi-select, hold money, compact slip, printer pill, Reports tab · #166 Cashier desk findable + own tile/icon · #167 Cashier guide/select-many/one-screen money card/live widget · #168 one-view Receive|Return card, dialogs above top bar, landscape layout · #169 oil kept in shop + compact cashier · **#170 Cashier Hold button** · **#171 Android widget taps reliably open their screen**.

## How the main pieces work (for safe edits)
- **Receive-payment hold:** `ReceivePayment` (components/counter) takes optional `draft` and `onHold`; the Hold button renders only when `onHold` is passed. Drafts persist in localStorage key `counterRecvHold` as `RecvDraft` per bill key. `CounterApp` is the reference implementation; `CashierDesk` mirrors it (state `holds`, `putHold(key, draft|null)`, clears on successful settle). Held bills show a ⏸ marker.
- **Bill tracking:** `lib/counterTrack.ts` + `app/api/register/bill-track/route.ts`; actions `handover`, `upiOk`, `cashOk`, `paidLater`, `settle`, `details`, `keep`. Keep-oil uses `keepOil`, `keptList`, Kept tab in the Cashier desk.
- **Cashier summary for widget:** `lib/cashierSummary.ts` → `/api/device/summary` `cashier` block → live widget `cashierlive`.
- **Widgets:** tile widgets `milldesk`, `millcounter`, `weighbill`, `cashier` share `widget_tile.xml` and `Widgets.tile()`; request codes 701–705; kinds list in `lib/widgetKinds.ts`. Taps → `WidgetData.open` → `MainActivity.openFromIntent` (PR #171 adds two delayed retries so the tapped page wins over `/go`).
- **Scale pipeline:** native `BtLinks` reads the iScale over Bluetooth SPP → web page via Capacitor plugin → `ScaleTick`. Browser typing never creates stock weights (typed needs reason, flagged).
- **Printing:** `lib/print*` + native plugins; label printer Helett Neo H30C; receipt MPT-III/POSIFLOW 80 mm. See `docs/PRINTING.md`.

## Not verified on real devices (say so every time)
Nothing in the last ~40 PRs has been confirmed on the real tablet / phones / printers / scale by the owner. In particular:
- **Widgets for Weigh & Bill and Mill Desk** — the owner reported "not working". Diagnosis: tile widgets are structurally fine; likely a cold-start race with the `/go` start page. PR #171 ships a retry fix. **Needs a new APK installed.** If still broken, ask: blank widget / wrong page / nothing happens? Then re-check `AndroidManifest.xml` receivers, `widget_*_info.xml`, `Widgets.KINDS` order and whether the app was force-stopped/battery-restricted.
- Cashier Hold + Keep-oil flows (UI is merged and unit-tested at the lib level only).

## Backlog / open items (priority order is the owner's call)
1. **Install the new APK** (release `android-latest`) and re-test home-screen widgets: `milldesk`, `millcounter`, `weighbill`, `cashier`, `cashierlive`.
2. Keep-oil in **bulk select-many** (currently one bill at a time).
3. A **"kept" filter** on the Weigh & Bill Bills page.
4. **Kannada strings are drafts** — Nilkant must check them (counter + Mill Desk).
5. Test on real hardware: tablet + counter scale + printers + mill scale.
6. **GST/challan question for job-work (5% vs none)** — waiting on the accountant; do not add GST fields to the job-work receipt until answered.
7. **Vyapar handover** — export/format for the accountant's daily entry.
8. Move from `prisma db push` to proper **migrations** (needs a baseline; do carefully, never `migrate dev` on prod).
9. Fix the wrong PIN in `docs/BLUETOOTH-SCALE.md` (correct: iScale S-18 PIN **0111**).
10. Counter v3 not built: **GST credit-note slip for returns**, **UPI paid check**, **server-side discount limit** (currently client-side 10%).
11. Mill Desk open questions listed in the Claude Project doc `mill-desk-plan.md` (not exported here — ask to export).
12. Project/handoff docs need updating after each feature: Cashier desk, Hold and Keep-oil are **not yet** written to the Claude Project docs.
13. Ekatva blend (Sunflower + Rice Bran 50:50) and Karadi pack: label/launch work, not in the app yet.

## Other source docs (only in the Claude Project, not in the repo)
34 docs under `claude/*.md` in the Claude Project "Business second Brain": SOPs (job-work, self-crushing, retail counter, closing, barrels, smart entry, Ekatva line, chat bot), plans (mill-desk, weigh-bill counter, ERP architecture, dashboard app), build/audit notes (`build-status-2026-11`, `app-audit-2026-11`, `app-fix-specs-2026-11`), money rules, Android widget notes. This pack distils them. The Drive "Second Brain" folder (`My_Oil_Business_Second_Brain`: Vyapar exports, job-work sheets, scripts `oil_yield_tracker.py`, `job_work_reconciler.py` with 2% mass-balance / 5% GST invoice logic) is a separate system of record for accounting reconciliation.
