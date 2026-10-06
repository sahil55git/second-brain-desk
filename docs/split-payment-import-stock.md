# Split payment, dropdown forms, bulk import/export, stock tally window

## Split payment (Quick Register → Sale / Fresh crush)
"Paid how?" now offers **Cash · UPI · Owner PhonePe · Udhaar · ➗ Split payment**.
Split lets one sale be paid across several channels; the amounts must add up to the sale
(the screen shows "Left to assign" and "+ rest" buttons). Udhaar needs the customer's name.

* Stored as one register row per channel, linked by `details.split.id`, so every existing
  cash / UPI / udhaar report stays correct. Quantity and rate sit on the first row only, so
  stock and item reports never count the oil twice.
* **Owner PhonePe** is the owner's personal PhonePe: not counter cash and not shop UPI. It is
  stored as mode `OTHER` + `details.channel = "OWNER_PHONEPE"` and shown as its own line
  (Quick Register summary, Cash report, day book).
* Deleting any part of a split sale deletes the whole sale. No database change.

## Compact forms
Item lists are now a searchable drop-down; quantity / unit / rate share one row; payment
options are compact chips; the note field opens on demand.

## Import / export (Settings → 📥 Import / Export, owner only)
One Excel workbook with sheets **Parties**, **Register items**, **Stock items** (+ Instructions).
Download the template, fill it, upload it, check the preview, press Import. Names that already
exist are skipped; nothing is overwritten. CSV works for a single list. "Export" produces the
same format from live data, so it can be edited and imported back.

## Stock tally window (/stock)
Product entry cards (counted now, yesterday closing with override, scale report sale, live
system sale and gap), a Guided step-by-step mode, Excel/CSV import, and a "Present stock" table
for the day (Tally 1, Tally 2, sale, report, gap) with Excel export. Uses the same maths and the
same saved record as the Daily Closing desk and the Quick Register stock sheet.
