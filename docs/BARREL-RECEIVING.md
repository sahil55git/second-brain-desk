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

## Daily flow

1. Vehicle arrives → **New lot** (supplier, oil, barrels, vehicle, challan no.). Photograph the challan with *Challan photo* (filed in Drive like other bills).
2. **Print barrel labels**, stick one on every barrel.
3. **① Full barrel:** put the barrel on the platform, scan its label (camera or USB scanner), wait for the green *Steady* box, tap **Save**.
4. Pour the barrel into the tank. Drain it the same way every time (for example 5 minutes upside-down); residue is what makes empty weights vary.
5. **② Empty barrel:** same, scan and save.
6. When every barrel has both weights the lot reads *All weighed*; the owner sees received vs challan and any shortage in ₹, and closes the lot.

## What protects against theft and mistakes

- **The weight comes from the scale, not the browser.** The bridge stores the reading; it can be used once, within 2 minutes. Typing a weight is possible (scale broken) but needs a reason, is marked ✋ and warns the owner.
- **Blind receiving.** Staff do not see the challan quantity, the rate or the shortage; only the owner does.
- **Staff cannot redo a weight.** Owner-only "weigh again" with a reason; the old figure stays in the history.
- **Owner checks:** lot net vs challan (tolerance 0.5 %, at least 0.5 kg), per-barrel net vs per-barrel figure, empty weight more than 1 kg from the lot's other empties, empty almost as heavy as full, barrels full for over 24 h and never emptied, fewer barrels labelled than the challan says. These are starting defaults I chose; change them in `lib/barrels.ts` (`BARREL_DEFAULTS`).
- Every action is logged (who, when, what) under *Show history*.

## Honest limits

- A barcode shows the label was scanned or typed, not that that barrel was on the scale. A photo of the barrel on the platform would be the next step.
- Tank-level cross-check (net received vs tank rise) is not built yet.
- Camera scanning needs Chrome or Edge. On iPhone Safari use a Bluetooth scanner or type the code.
- Kannada labels need a fluent reader's review.
