# Barrel receiving — setup and daily use

Oil bought in barrels: **label → weigh full → pour into tank → weigh empty → net oil checked against the supplier's challan.** Open `/barrels` (Quick links → *Barrel receiving*).

## One-time setup

1. **Database:** run `npx prisma db push` once (adds OilReceipt, Barrel, BarrelEvent, ScaleTick).
2. **Secret:** in Vercel add `SCALE_PUSH_SECRET` (any 16+ character random text) and redeploy.
3. **Scale bridge on the shop PC** (the PC next to the platform scale):
   ```powershell
   $env:SCALE_PUSH_SECRET = "<same secret>"
   py tools/scale_bridge.py --si850-device PLATFORM-1@<scale-ip>:<port> `
       --push-url https://<your-app>/api/scale-ticks/ingest --push-source PLATFORM-1
   ```
   Name only the **platform** scale in `--push-source`; tank scales (e.g. SI850-KARADI) must not be listed. The bridge sends one reading each time the display has been steady for about 5 s (the SI-850 is polled every 5 s, so allow 5–10 s after a barrel is placed).
4. **Labels:** a normal printer with A4 sticker sheets (63.5 × 38.1 mm, 21 per sheet) or a 50 × 30 mm thermal label printer. Cover each label with clear tape; oil wears paper off.

## The barrel register (`/barrels` → *Barrel register*)

One row per barrel, across all lots: **gross** (oil + barrel), **tare** (empty barrel), **net oil** = gross − tare, each with its date, time, scale and person. Example: barrel 1 — gross 192 kg, tare 12 kg, net 180 kg.

- Barrels can be emptied **any day** after they arrive. The *Weigh* tab lists every full barrel still waiting (oldest first, days waiting, rough oil inside — an estimate, never a measured figure). Scan the barrel, the desk sees it is full and asks for the empty weight.
- Filters: waiting / emptied / not weighed / all; search by code, supplier, vehicle, challan; date range. *Print* and *Excel (CSV)* export what is shown.
- Tap a row (or scan the QR on the barrel with a phone camera) for the barrel's record, weighment slip and, for the owner, its history.
- Totals add up only barrels that have both weights, so gross − tare = net always agrees.

## Weighing time and date

A scale weighing is dated by the moment the scale settled. A **typed** weight asks for the date/time it was really weighed (default now; not in the future, at most 30 days back, not before the full weighing), and the system keeps the moment it was saved separately — a gap of more than 15 minutes shows a *BACKDATED* warning to the owner.

## Printouts

- **Labels** (`Print barrel labels`): Code 128 barcode (scanner guns) + QR (phone camera; opens the barrel's record) on A4 sticker sheets or 50 × 30 mm thermal.
- **Weighment slip** (`/barrels/print?slip=CODE`, or *All slips* for a lot): barcode + QR, lot, supplier, vehicle, gross / tare / net with times, scale and person, signature lines. 80 mm thermal roll or A4. Print after the full weighing and again after the empty weighing.
- **Lot weighment report** (`/barrels/print?report=LOT`): A4 table of all barrels with totals; the owner's copy also shows the challan total, difference and flags.

## Daily flow

1. Vehicle arrives → **New lot** (supplier, oil, barrels, vehicle, challan no.). Photograph the challan with *Challan photo* (filed in Drive like other bills).
2. **Print barrel labels**, stick one on every barrel.
3. **① Full barrel:** put the barrel on the platform, scan its label (camera or USB scanner), wait for the green *Steady* box, tap **Save**.
4. Pour the barrel into the tank. Drain it the same way every time (for example 5 minutes upside-down); residue is what makes empty weights vary.
5. **② Empty barrel:** same, scan and save — today or any later day.
6. When every barrel has both weights the lot reads *All weighed*; the owner sees received vs challan and any shortage in ₹, and closes the lot.

## What protects against theft and mistakes

- **The weight comes from the scale, not the browser.** The bridge stores the reading; it can be used once, within 2 minutes. Typing a weight is possible (scale broken) but needs a reason, is marked ✋ and warns the owner.
- **Blind receiving.** Staff do not see the challan quantity, the rate or the shortage; only the owner does.
- **Staff cannot redo a weight.** Owner-only "weigh again" with a reason; the old figure stays in the history.
- **Owner checks:** lot net vs challan (tolerance 0.5 %, at least 0.5 kg), per-barrel net vs per-barrel figure, empty weight more than 1 kg from the lot's other empties, empty almost as heavy as full, barrels full for over 30 days and never emptied (waiting a few days is normal), fewer barrels labelled than the challan says. These are starting defaults I chose; change them in `lib/barrels.ts` (`BARREL_DEFAULTS`).
- Every action is logged (who, when, what) under *Show history*.

## Honest limits

- A barcode shows the label was scanned or typed, not that that barrel was on the scale. A photo of the barrel on the platform would be the next step.
- Tank-level cross-check (net received vs tank rise) is not built yet.
- Camera scanning needs Chrome or Edge. On iPhone Safari use a Bluetooth scanner or type the code.
- Kannada labels need a fluent reader's review.
