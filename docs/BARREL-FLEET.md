# Our barrels (barrel fleet)

Tracks the shop's **own reusable barrels** (about 20): the permanent tare of each one, how much oil is in it every time it is filled, and where it is now (shop, vehicle, customer, supplier, repair).

Oil bought in a supplier's barrels is a different job, handled by **Barrel receiving** (`/barrels`). That module works per lot and its barrels are thrown into the lot. Fleet barrels live forever and are re-used.

Screen: `/barrels/fleet` (Quick Links → "Our barrels"). Staff and owner can both use it.

## The idea

- Every barrel has one permanent code, `BRL-01` … `BRL-20`, printed as a Code 128 barcode and a QR on a sticker.
- **Tare** = the barrel's own weight when empty. It is set once, by the first *empty* weighing, and stored on the barrel.
- **Net oil = scale weight − tare.** The scale weighs the full barrel, the system subtracts the stored tare. Nobody types a subtraction.
- Every weighing and every trip is one row in an append-only **ledger**. Nothing is overwritten, so any barrel's history can be reconstructed.

## Daily use

| Step | What to do | What the system does |
|---|---|---|
| Register (once, owner) | Barrels tab → Register 20 barrels | Creates BRL-01…BRL-20 |
| Print labels (once) | Barrels tab → Print all labels | Label with barcode, QR, tare, max oil |
| Set the tare (once per barrel) | Scan label → Weigh empty | First empty weight becomes the tare |
| Fill | Scan label → Weigh full, pick the oil | Net = scale − tare, saved on the barrel |
| Send out | Scan label → Send out → customer / supplier / vehicle, purpose, bill no. | Ledger row copies the oil that left; slip can be printed |
| Bring back | Scan label → Back to shop (weigh empty if oil was returned) | Barrel is in shop again; empty weight is compared with the tare |

Weights come from the platform scale through the scale bridge (same single-use, fresh-within-2-minutes tick as Barrel receiving). A typed weight is allowed as a fallback, needs a reason, and is marked "typed" in the ledger and on slips.

## What scanning does

- **QR code (phone camera):** opens that barrel's own page, `/barrels/fleet/BRL-07`: what is in it (kg and oil), where it is and for how long, tare and capacity, any warnings, its history, and the buttons to weigh it, send it out or bring it back. If the phone is not logged in, it asks for the login first and then returns to the same barrel.
- **Barcode (scanner gun):** a barcode can only hold text, so it holds the code `BRL-07`. A gun types that into the scan box at the top of the Our barrels screen (or the label box on the Weigh tab); press Enter and the barrel's page opens. The "Scan" button does the same with the phone or PC camera and reads either code.
- Labels printed earlier (QR with `?barrel=BRL-07`) still work: they are sent on to the barrel's page. No reprint is needed.

## Prints

- `/barrels/fleet/labels?codes=all` (or `codes=BRL-07`): permanent labels. Sizes include 50 × 30 mm for the Helett Neo H30C. "With tare" or "code only". If the owner changes a barrel's tare, reprint that label.
- `/barrels/fleet/print?slip=EVENTID`: slip for one weighing or trip (barcode, QR, gross, tare, net, party, vehicle, bill no., signature lines). 80 mm roll (POSIFLOW 80B) or A4. Linked from the Ledger tab and after each save.
- `/barrels/fleet/print?register=1`: A4 fleet report: where every barrel is, what is in it, total oil.
- Ledger and fleet board can be downloaded as CSV (Excel).

## What gets flagged

These limits are **starting defaults** (`FLEET_DEFAULTS` in `lib/barrelFleet.ts`; the oil lost / gained tolerance is the same one Barrel receiving uses, `allowedDiffKg` in `lib/barrels.ts`); change them after a few weeks of real use.

| Flag | Rule | Level |
|---|---|---|
| No tare | Barrel never weighed empty | warning |
| Tare drift | Empty weight differs from the tare by more than 1 kg (dent repaired, residue oil, wrong barrel) | warning |
| Over capacity | Net oil above the barrel's capacity (190 kg) | warning |
| Oil lost | Weighed full again and it has LESS oil than the last full weighing, by more than the receiving tolerance (leak or oil taken out) | alert |
| Oil gained | Weighed full again and it has MORE oil than last time, by more than the same tolerance (topped up, or a different barrel) | warning |
| Away too long | Barrel outside the shop more than 30 days | warning |
| Leaking | Barrel marked leaking, or a leaking barrel was full | alert |
| Dented | Barrel marked dented | warning |

A leaking barrel that is full cannot be sent out.

## Who can do what

- **Staff**: weigh, move, report a dent or leak, add notes.
- **Owner only**: register barrels, change capacity or mark, retire a barrel, mark a repaired barrel OK again, re-set a tare (needs a reason, logged).

## Technical map

- Schema: `FleetBarrel`, `FleetEvent` in `prisma/schema.prisma` (created by `prisma db push` in the Vercel build).
- Rules (pure, tested): `lib/barrelFleet.ts`. Server helpers: `lib/barrelFleetServer.ts`.
- API: `app/api/barrel-fleet/` (`route.ts` list/register, `weigh`, `move`, `[code]`, `events`). Access rule in `lib/access.ts` (same pages as `mfg`/`stock`).
- Screens: `components/barrels/fleet/` (`FleetDesk`, `FleetBoard`, `FleetWeigh`, `FleetLedger`, `FleetSetup`, `FleetLabels`, `FleetPrint`); pages in `app/barrels/fleet/`.
- Tests: `lib/__tests__/barrelFleet.test.ts`, `barrelFleetRoutes.test.ts`.

## Not yet tested

Built and unit-tested offline. Not yet run against the live database, the real scale or the real printers. First day: register 2 barrels, print one label on the H30C, do a full weigh/move/return cycle, and check the ledger before registering all 20.
