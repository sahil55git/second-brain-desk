# 03 — Business rules (ground truth; do not contradict, do not invent numbers)

*Distilled from the Claude Project "Business second Brain" docs (business-overview, SOPs, mill-desk plans, money rules). Last updated 21 Nov 2026. Informational only — not tax/legal advice.*

## The business
- **Mahadev Traders** (proprietor Sahil), Bidar, Karnataka. Firm identity details (GSTIN, address, contact) are intentionally not stored in the repo.
- Edible-oil shop + oil mill. Four lines: (1) retail loose-counter oil sale, (2) packaged/labelled retail ("Ekatva" = 2-way blend Sunflower + Rice Bran 50:50, and a Karadi-labelled pack — neither actually launched yet; Karadi pack has labels/bottles/FSSAI ready; Ekatva still planning), (3) self-crushing (mostly Karadi = safflower seed) at **Mill 1** (~90%) and Mill 2 (occasional; mainly the **godown**), (4) **job-work crushing** for customers' own seed.
- Shop hours 9:30 AM–9:30 PM; two full-time counter staff at all times. Peak job-work season April–June.
- **People:** Sahil (owner, reads English only). **Nilkant** (business manager; Kannada or Kannada+English; cannot read English). Mill staff read **only numbers**. An accountant comes each afternoon and enters the previous day into **Vyapar**. The Lio app was dropped (English-only, not easy) — the Second Brain Desk app is replacing paper + Lio.
- **Products.** Refined (net margin target ~10%): Sunflower, Soyabean, Goldrop (Hyderabad brand; sunflower and rice-bran). Natural (20–30%): Karadi, Groundnut, Coconut, Til, Mustard, Tea powder. Palm oil discontinued. Margins are *net* after ~₹5/kg working cost; mental targets, 2–4% drift tolerated, beyond that flag.
- Yield: Karadi ~22% oil / 78% khali (best seed 24–25%, poor 18–19%).

## Settled numbers
| Rule | Value |
|---|---|
| Job-work, shop keeps khali | shop **pays ₹6/kg of seed**, split half customer / half tempo (auto) driver (full ₹6 to customer if they bring the seed themselves) |
| Job-work, customer takes khali | customer **pays ₹10/kg of total seed** (not per kg of khali); khali weighed, paid, then handed over |
| Oil cans charged to customer | 15 kg tin ₹50 · 5 kg new ₹40 · 5 kg old ₹20 (rate snapshotted on the entry) |
| Mass balance tolerance | 2% (seed − oil − cake) / seed |
| Cash drawer gap flag | ₹300 (afternoon count tallied on spot; 9 PM count recorded, accountant checks next day) |
| Staff expense limit | ₹2,000 per transaction; above it, or any owner draw, needs owner OK |
| Barrel short flag | 2 kg per batch |
| Barrel fill | standard 180 kg (190 kg max) |
| Yield bands (reference 22%) | < ref−2 Poor · ref−2…ref Standard · ref…ref+1 High · ≥ ref+1 Best; oil-cake expected = seed × (100−ref)% (flag at 2% of seed) |
| Staff discount limit (counter) | 10% per bill (item + bill discount); owner unlimited and can change it |
| Tanks | Sunflower 2,700 kg (Gold Drop shares it) · Soyabean 2,700 · Karadi tank 1 580 · Groundnut 580 · **K2** 300 |
| Seed/khali bags | 40–50 kg (seed), 40–45 kg (khali, not fixed) |
| Items tax defaults (counter GST invoice) | 5% GST; HSN 1512 / 1508 / 1514 / 1517 / 2306 — **to be confirmed by the accountant** |

## Daily cash & stock closing
Two counts a day. (1) Afternoon shift change — Sahil sits at the counter while Nilkant is at lunch, compares System Cash (cash in − cash out) with Counter Cash and checks stock **on the spot**. (2) 9 PM closing — recorded only. Next afternoon the accountant tallies and enters the previous day into Vyapar; closing mismatches surface then. On a gap ≥ ₹300: re-check → recall missed entries → correct → escalate to Sahil. Cash-count paper layout: cash in left, cash out right, UPI received listed on the cash-out side. Shop UPI is business GPay (owner also uses his own PhonePe). Big UPI / owner draws need no special process — everything is noted. Draws and payments need Sahil's prior authorization; Nilkant may pay small expenses up to ₹2,000.

## Retail counter flow
All loose oil is weighed on the counter scale (iScale BT-0203, Bluetooth) and a receipt printed. Cash/UPI normal; credit (udhaar) rare. **Oil is given only after money is received.** Tank/stock top-ups are logged as their own events. Two-person flow: one staff weighs, bills and prints; a separate person at the cash counter takes money (Cashier desk). Counter staff cannot read English: icon/tick-box screens, flashing "next step" guidance, bills with no name read "Cash bill"/"UPI bill" (never "Walk-in"). Bill statuses: held (shared across devices), pay-at-queue (printed first, payment later), paid, oil kept in shop (paid, oil collected later), cancelled; returns are a separate `SALE_RETURN` entry (original bill stays). Staff may cancel/edit only same-day bills with a reason; owner any day; all logged.

## Job-work crushing (Mill 1 floor) — GST Section 143 / ITC-04 sensitive
1. Customer seed bags weighed on the **mill scale** (iScale S-18, 300 kg × 50 g, Bluetooth SPP, name "iScale-BT", PIN 0111, 9600 8N1, lines like `+001.250 kg`; the old `docs/BLUETOOTH-SCALE.md` wrongly says 1234/0000 — fix it). **Gross weight only**, no empty-bag deduction; customer takes bags back. No fixed load size; bags added one after another; bag count tracked (100 kg in two 50 kg bags = 2 bags).
2. Staff write name, village, quantity and a serial number on the bags with a marker → in the app this is the **Customer no.** (not the bag count). Customer name OR village alone is enough (staff mostly write only the village).
3. Advances recorded separately for the **customer** and the **tempo/auto** (cash the shop already gave).
4. Crushing one customer at a time on the same expeller that also runs own seed the same day. Job-work oil/seed is **never mixed** with own crushing and is traceable to the customer.
5. Oil goes into the customer's container or shop cans (cans charged). Customer oil weighed only if the customer asks. Oil may be left at the shop and collected later; oil handover and money settlement can be different visits — both stay open items until closed.
6. **No udhaar in job-work.** Only: **Pay customer** (shop keeps khali) or **Khali payment** (customer takes khali), by Cash or UPI. A crushed job stays in "Held" until money is settled and oil is given.
7. **Mill Desk money rule (decided 21 Nov):** *Advance = cash the shop already gave*; editable and partly returnable. Shop keeps khali → we pay ₹6/kg seed, half each; each side's own advance comes off their half; cans come off the customer's half; if cans + advances exceed that the **customer pays us the difference** and oil stays held until received. Customer takes khali → customer pays **₹10/kg seed + cans + the advance we gave**, less any advance returned (cash closing counts the advance as cash out, the settlement as cash in). Only Mill Desk jobs (marked `[mill:…]` in job notes) use this rule; the older Job-Work Desk keeps its own.
8. Khali the shop keeps is bagged, stacked together with own-production khali, and sold later (tracked as stock; sale = register "Sale → Oil cake").
9. Printing is optional: *Save job* prints nothing; Print and Sticker are separate buttons. Defaults: weight slip auto ON, token OFF, bag stickers OFF, 1 receipt copy. Optional add-on: sticker per Customer no. (token, Customer no., kg, bags, name, village, QR) + 2 receipt copies.
10. Job-work money/stock feeds the ITC-04 reconciliation. **Open question for the accountant:** challan / 5% GST treatment of job-work (SOP says "no GST on the flat fee"; project instructions mention a 5% job-work invoice rate). Until answered the job-work receipt stays a plain receipt — do not invent GST fields.
11. Daily-aggregate recording is intended (per-customer yield is not wanted). Flag unbilled batches / unrecorded stock clearly.

## Own crushing (corrected 19 Nov 2026)
Seed (40–50 kg bags, Mill 1 stock or godown) weighed before crushing (usually, not always) → expeller → **one fixed oil can** (same can, ~10–15 kg, empty weight recorded once, each fill weighed) → **K2 tank** (has a weight display, not connected to the app; read by eye) or a **plain floor barrel** when K2 is full → settles 2–4 days → clear oil to the **main Karadi tank** (load cells, live display) in 2–3 rounds; oil left with sediment rests again in K2 or a **small tank** (no scale, weigh via the can); **sediment cleaned out of K2 before new crude goes in and should be weighed**. Balance per fill = poured in − moved − sediment; flag beyond 2%. Own khali stacked with job-work khali. Seed bought from regular suppliers on credit (10–20 day window; 15 day default used). The old "mill barrel steps 1–4" model (`MfgBatch` steps) is superseded on the floor; mill runs now create a Manufacturing batch "Run N" with step 1 = crude oil.

## Barrels (bought oil)
Oil bought from factories in barrels: weigh full (gross) on the platform scale → empty into tanks (any time, sometimes days later) → weigh empty barrel (tare) → net oil cross-check. Blind receiving: staff never see supplier-declared kg/rate/shortage. Own reusable fleet BRL-01…BRL-20 (tare registered once). Barrel weights come from scale readings (`ScaleTick`), never from browser typing; typed weights need a reason and are flagged.

## Hardware
Counter scale iScale BT-0203 (tablet). Mill scale iScale S-18 (phone). Printers: **Helett (Rapid Label) Neo H30C** labels (pair `H30C_F1BA`, not `_BLE`; default label 50×75 mm assumed) and **POSIFLOW / MPT-III 80 mm** Bluetooth thermal receipt printer; USB printers also supported. Network: the Lava phone must use the D-Link `motshop_EXT` Wi-Fi with DNS 8.8.8.8 (the Airtel router's DNS fails for it). Phones scan codes with the camera; no barcode scanner device.

## Never
- Never the one-finger-up symbol. Never "Walk-in". Never invent a rate/threshold/GST field. Never mix job-work seed/oil with own stock. Never let a job-work customer have udhaar. Never release oil before money (except explicit "Keep oil in shop"). Never post barrel receiving to the stock ledger (the purchase entry already does; it would double count). Never use `prisma migrate dev`.
- Keep the owner's **trading** (Zerodha/Dhan, swing trading) completely separate from the oil business unless he connects them himself.
