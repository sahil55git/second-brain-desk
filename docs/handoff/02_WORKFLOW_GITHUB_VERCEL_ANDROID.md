# 02 — Workflow: code → GitHub → Vercel → Android (exactly how it was done with Claude)

## The systems
| Thing | Value |
|---|---|
| GitHub repo | `sahil55git/second-brain-desk` (**private**), default branch `main` |
| Production site | https://mahadev-second-brain.vercel.app (Vercel project `mahadev-second-brain`, team `trading-sector-rotation`) |
| Database | PostgreSQL (Neon / Vercel Postgres) via `DATABASE_URL` in Vercel env vars |
| Android app | Capacitor wrapper in `mobile/`; loads the live site (`server.url` = `https://mahadev-second-brain.vercel.app/go`) plus native plugins (Bluetooth scale, printers, UPI notification, widgets) |
| APK builds | GitHub Actions `.github/workflows/android.yml` |
| APK download | GitHub release `android-latest` (asset `Mahadev-Desk.apk`), linked from the app's `/app` page. PR builds go to release `android-preview` |
| Owner's PC | Windows (HP Pavilion), clone at `C:\business second brain\second-brain-web`, PowerShell |

## Environment variables (names only — values live in Vercel → Project → Settings → Environment Variables)
Required: `DATABASE_URL`, `NEXTAUTH_SECRET`. Recommended: `NEXTAUTH_URL`, `CRON_SECRET` (nightly job at `/api/bot/cron`; endpoint is open while unset).
Optional features: `SCALE_PUSH_SECRET`, `PRINT_QUEUE_SECRET`, `DRIVE_UPLOAD_URL`, `DRIVE_UPLOAD_SECRET`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`,
`GEMINI_MODEL`, `OPENROUTER_MODEL`, `GROQ_MODEL`, `DATA_GOV_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `REPORT_WEBHOOK_URL`,
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. See `.env.example`. **Never paste real values into any chat or file.**
Android signing (GitHub → Settings → Secrets → Actions): `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`. Without them the APK is test-signed and phones must uninstall the old app before installing a new build.

## Change cycle (the loop to repeat for every request)
1. **Update** the local clone: `git checkout main && git pull`.
2. **Branch:** `git checkout -b <short-feature-name>`.
3. **Code.** Pure logic in `lib/*.ts` + a test in `lib/__tests__/`. Read `AGENTS.md` rules.
4. **Check locally (all three must pass):**
   ```bash
   npx next lint      # a lint error (even an unused variable) breaks the production build — this happened in PR #136
   npx vitest run     # all tests must pass (1,373 at the last check)
   npx tsc --noEmit   # only meaningful after `npx prisma generate`
   ```
5. **Commit and push** the branch: `git add -A && git commit -m "<what and why>" && git push -u origin <branch>`.
6. **Open a PR into `main`** (GitHub web UI, or `gh pr create --base main --head <branch> --title … --body …`).
   With the Claude sandbox, GitHub GraphQL was blocked, so this was done through the REST API:
   ```bash
   gh api repos/sahil55git/second-brain-desk/pulls -f title="…" -f head=<branch> -f base=main -F body=@body.txt --jq .number
   ```
7. **Wait for checks.** The "Android app" check (`apk`) runs when `mobile/**` changed: it must be green (a Java compile error is reported as a PR comment).
   Vercel's per-PR preview often shows **"Error" within 1–2 seconds with no build step** — a project setting, not a code problem (see PRs #96–#102 notes). Ignore it.
8. **Squash-merge** into `main` (GitHub "Squash and merge", or REST: `gh api repos/sahil55git/second-brain-desk/pulls/<N>/merge -X PUT -f merge_method=squash`).
9. **Verify production:** the `main` commit's Vercel status must be `success`:
   ```bash
   SHA=$(gh api repos/sahil55git/second-brain-desk/commits/main --jq .sha)
   gh api repos/sahil55git/second-brain-desk/commits/$SHA/status --jq .state     # success | pending | failure
   ```
   Takes ~2 minutes. If it fails: Vercel → Deployments → open the failed build log (usually lint, a type error, or `db push` refusing a destructive schema change).
   If `mobile/**` changed also check the Android workflow run on `main` is `success`, then the APK on release `android-latest` is the new one.
10. **Tell the owner** what changed in 2–3 plain sentences, what could not be tested, and (if Android changed) "install the new APK".

## Database changes
- `prisma/schema.prisma` is the source of truth. There is **no migrations folder**. Production DB was created with `db push`.
- **Never** `prisma migrate dev` (it reports drift and offers to reset the whole schema = all data lost; answer N). Use `npx prisma db push` (additive only, no `--accept-data-loss`).
- On Vercel the build runs `prisma generate && node scripts/db-push.js && next build`. `scripts/db-push.js` retries once after 8 s; if the push fails on a production build the build STOPS so the old working version stays live. Preview builds only warn.
- Extra hand-run SQL (older, rarely needed): `prisma/sql/*.sql`.
- Adding a Prisma enum value or nullable column is safe. Renaming/dropping/changing a type is not — add a new column and migrate data in code.

## Android specifics
- Files: `mobile/android/app/src/main/java/in/mahadevtraders/desk/*.java` (widgets, Bluetooth `BtLinks`, printer/scale/UPI plugins, `MainActivity`), `res/`, `AndroidManifest.xml`.
- Home-screen icons: activity-aliases `.CounterLauncher`, `.CashierLauncher`, `.MillLauncher` (routed by class name in `MainActivity.openFromIntent`).
- Widgets: one Java class per kind, listed in `Widgets.KINDS` (order must equal `WIDGETS` in `lib/widgetKinds.ts` — a vitest test enforces it), receivers + `res/xml/widget_<kind>_info.xml` + strings. Tile widgets (`milldesk`, `millcounter`, `weighbill`, `cashier`) only open a screen; `cashierlive` shows live figures from `/api/device/summary` (`cashier` block from `lib/cashierSummary.ts`).
- Widget taps: `WidgetData.open(...)` → `MainActivity` → loads the path in the WebView. PR #171 added a retry because the start page (`/go`) can finish loading after the tapped page on a cold start.
- Build locally is not needed: push to a branch/PR and CI builds the APK. Install: download the APK on the phone → install over the old one (same signing key) → re-add a widget only if its layout changed.
- Per phone: allow Nearby devices; Battery → Unrestricted for the app; on the Lava phone also lock the app in Recent apps; Wi-Fi `motshop_EXT` with DNS 8.8.8.8.

## Mill Desk screen (special build step)
`tools/mill-desk/` holds the Mill Desk single-page screen source. After editing run `python3 tools/mill-desk/build.py` → writes `public/mill/desk.html`. Commit both. Demo mode: `/mill/desk.html?demo=1`.

## Working with ChatGPT / Codex instead of Claude — what changes
- **Access:** the agent needs access to the private GitHub repo. Options: (a) ChatGPT's Codex/GitHub connector (if on your plan) so it can read the repo, push branches and open PRs; (b) Codex CLI / any coding agent in a clone on your PC (`git clone https://github.com/sahil55git/second-brain-desk`); (c) plain chat: paste the files it asks for and apply its output yourself with Git. Whichever you use, give it `AGENTS.md` + `docs/handoff/` first.
- **You (the owner) stay the approver:** an AI agent opens the PR; you or the agent squash-merge after the checks above. Nothing deploys until merged to `main`.
- **Vercel needs no changes:** it auto-deploys every merge to `main` through its GitHub integration. No agent needs a Vercel login.
- **Commit trailer:** Claude commits ended with `Co-Authored-By: Claude …`. A different agent should use its own attribution or none.
- **If the agent cannot run tests:** ask it to say so, then run `npx next lint && npx vitest run` on your PC before merging.
- **Prisma binaries** (`binaries.prisma.sh`) were blocked in the Claude sandbox, so schema validation could not run there. If your new agent also cannot generate the Prisma client, the first real validation is the Vercel build after merge — keep schema edits small and additive.
- **Local run on the owner's PC:** `npm install`, copy `.env.example` → `.env`, fill `DATABASE_URL` + `NEXTAUTH_SECRET`, `npx prisma db push`, `npm run dev`, open `/setup` once to create the owner login.
