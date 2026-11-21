# 00 — START HERE: Second Brain Desk handoff to ChatGPT / other AI

Prepared 21 Nov 2026 by Claude for Sahil (Mahadev Traders, Bidar). Goal: let another AI continue the work exactly where it was, with the same rules, same GitHub → Vercel → Android flow.

## Pack contents (read in this order)
| File | What it is |
|---|---|
| `01_CHATGPT_SETUP_PROMPT.md` | Paste-in prompt for ChatGPT (Project instructions or first message) |
| `05_PROMPT_LIBRARY.md` | 23 role prompts (business developer, process-systems developer, ERP developer, SOP developer, graphic/UI designer, Android specialist, elite developer/reviewer, QA, release manager, DB architect, hardware, Kannada, GST-handover, security, trainer, brand designer…) + task templates |
| `AGENTS.md` | Coding rules for the repo (also commit it into the repo root) |
| `02_WORKFLOW_GITHUB_VERCEL_ANDROID.md` | Exact change → PR → merge → verify cycle, DB rules, env var names, Android build/widgets |
| `03_BUSINESS_RULES.md` | Business facts, rates, thresholds, flows, hardware, "never" rules |
| `04_APP_STATE_AND_BACKLOG.md` | What exists, what changed recently, what is untested, what is next |
| `merged_pr_history.txt` | PRs #1–#171. Schema is `prisma/schema.prisma`, the repo's own docs are in `docs/`, env names in `.env.example`, file list via `git ls-files` |

## The app in 10 lines
1. Next.js 14 + TypeScript + Prisma + Postgres on Vercel; Capacitor Android app "Mahadev Desk" wraps the live site.
2. Repo `sahil55git/second-brain-desk` (private); `main` auto-deploys to https://mahadev-second-brain.vercel.app.
3. Screens: Weigh & Bill counter, Cashier desk, Mill Desk, Mill Counter Desk, Quick Register, job-work, manufacturing, barrels, daily closing, reports, access, bot.
4. Users: Sahil (owner, English), Nilkant (manager, Kannada), mill/counter staff (icons and numbers only).
5. Hardware: iScale BT scales (counter BT-0203, mill S-18), Helett H30C label printer, MPT-III/POSIFLOW receipt printer, Android tablet/phones.
6. Money rules (job-work ₹6/₹10 per kg, 2% mass balance, ₹300 cash gap, ₹2,000 staff expense limit) are settled — do not change.
7. Schema is additive-only; no migrations folder; Vercel build runs `prisma db push`.
8. Pure logic in `lib/` with vitest tests (1,373 passing); lint must pass or the build fails.
9. Android changes ship only through a new APK from GitHub Actions (release `android-latest`).
10. The owner is non-technical on Git: the AI opens PRs, the owner (or the AI) squash-merges, then verify `main` on Vercel.

## Where we stopped (21 Nov 2026, evening IST)
- Last merged: **#170** Cashier Hold button, **#171** Android widget taps retry. `main` builds green on Vercel and Android.
- Waiting on Sahil: install the new APK and re-test widgets (Weigh & Bill, Mill Desk, Cashier tiles + live widget); real-hardware tests; Nilkant's Kannada check; accountant's GST answer for job-work.
- Next suggested work: backlog items 2–3 (keep-oil bulk, "kept" filter) then Counter v3 items. See `04_APP_STATE_AND_BACKLOG.md`.

## How to resume in ChatGPT (5 steps)
1. Create a ChatGPT **Project** named "Second Brain Desk". Upload all files from this pack. Paste `01_CHATGPT_SETUP_PROMPT.md` into the Project instructions.
2. Decide the access route (see `02_…` → "Working with ChatGPT / Codex"): GitHub connector/Codex (best), Codex CLI on the PC, or paste-files chat.
3. Add `AGENTS.md` to the repo root and these docs to `docs/handoff/` (copy from this pack; business details in `03_BUSINESS_RULES.md` include the shop's GSTIN and address — the repo is private, but remove those lines if you ever make it public).
4. Ask ChatGPT to start with the "first task" in the setup prompt.
5. Every feature after that follows the cycle in `02_…`. After each merge, ask the AI to append a short entry to `04_APP_STATE_AND_BACKLOG.md` so the handoff stays current.

## Keeping the handoff alive
After each merged PR add one line to "Recent work" and update "Not verified" and "Backlog" in `04_…`. If you go back to Claude, give it the same files (or its Claude Project docs `claude/*.md`) — they are consistent with this pack, except Cashier desk / Hold / Keep-oil, which only exist here and in the repo.

## Security
No secrets are in this pack. Never paste real env var values, DB URLs, tokens or keystore passwords into any AI chat. Names of variables only.
