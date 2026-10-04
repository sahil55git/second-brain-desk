# SOP — Fresh crush sale (our seed, crushed in front of the customer)

**What it is:** a customer buys oil that is crushed on the spot from the
**shop's own seed**. One crushing = one entry in the Quick Register
(🫗 **Fresh crush sale**, green Money In side).

**What it is NOT:** if the customer brings **their own seed**, it is
job-work (GST Section 143 / ITC-04) — use **Job-Work → New intake**, never
this form.

## 1. At the counter (manager)

1. Weigh the seed taken from our stock **before** crushing.
2. Crush. Weigh the oil that comes out.
3. Weigh / measure what the customer takes, and agree the rate.
4. If oil is left over, move it to the tank or barrel and note which one.
5. Weigh the oil cake (khali) kept by the shop.
6. In the Quick Register tap **🫗 Fresh crush sale** and fill:
   - **Which seed** (Groundnut / Karadi / Sunflower / Mustard / Other)
   - ① **Seed used kg**, **Oil crushed kg**
   - ② **Oil sold** (kg or litre), **Rate**, Amount fills itself;
     **Paid how** (Cash / UPI / Udhaar); customer name (optional)
   - ③ **Extra oil to tank/barrel kg** (fills itself as *oil − sold*
     when sold in kg) and **which tank/barrel**; **Oil cake kg**
7. Check the green/red box before saving:
   - **Oil yield %** (oil ÷ seed)
   - **Loss** = seed − oil − cake. Over **2 %** turns red: re-weigh.
     (Same 2 % rule as `oil_yield_tracker.py`.)
   - "Oil not sold and not moved to tank" means the numbers are missing
     some oil — fix before saving.
8. Save. Cash sales add to *Should be in counter* and are included in the
   Tally 1 / Tally 2 counts like any other sale.

## 2. At day closing (accountant)

Quick Register → **Reports** → pick the day → **🫗 Fresh crush** card →
**Copy Vyapar day-closing sheet**. For each crushing it lists:

1. **SALE** — item, qty, rate, amount, payment mode → sales invoice in
   Vyapar.
2. **MANUFACTURE / STOCK** — seed consumed (kg) → oil produced (kg) +
   oil cake (kg) → record as manufacturing / stock adjustment, whichever
   method you use in Vyapar.
3. **TRANSFER** — extra oil kg → tank/barrel → stock transfer / tank
   stock as you record it today.

Day totals per seed are at the bottom. The **CSV for accountant** also
carries the seed → oil → tank → cake line for every entry.

## 3. Things to know

- The register does **not** change Vyapar or the Karadi tank scale
  readings by itself. The tank scale (`TankMovement`) remains the physical
  evidence; the fresh-crush entry is the business record of why oil went
  into the tank.
- Khali from fresh crush is shown in the fresh-crush report, not in the
  Job-Work desk's khali widget (that widget is job-work cake only).
- Tax treatment (GST rate, invoice type) is for the accountant to decide;
  this tool records quantities and money only.
