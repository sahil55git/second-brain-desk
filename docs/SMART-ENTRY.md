# Smart entry — scan, speak, check, ask

Every entry desk now has the same tools. **Nothing is ever saved by the AI** — it drafts the form, the person checks it against the paper and taps the form's own Save.

| Desk | Bill / receipt photo | Speak / type | Barcode / QR | Scale | Live checks | Ready questions |
|---|---|---|---|---|---|---|
| Purchase | ✅ lines, GSTIN, totals; photo filed with the bill | ✅ | ✅ add line | ✅ "Use weight" on the active line | duplicate bill no., GSTIN checksum & mismatch, bill total vs lines, rate vs last purchase | Check this bill · Rate history · What do I owe? · Bill vs barrels weighed (owner) |
| Sales | ✅ | ✅ | ✅ packs count up; loose items take the steady scale weight | ✅ (existing live auto-fill) | selling below last purchase cost, rate far from usual | Check this invoice · What rate to charge? · Who owes me? · Today & this week |
| Expenses | ✅ receipt; photo filed | ✅ | — | — | same receipt twice, unusually large | Is this normal? · This month · Possible duplicates |
| Stock tally (/stock) | ✅ stock sheet | ✅ "sunflower 420, karadi 1310…" | — | — | (existing gap flags) | Explain the gaps · Stock trend |
| Job-work | ✅ (existing) | ✅ | — | ✅ "Use scale weight" for seed kg | — | Check this intake · Pending settlements |
| Manufacturing, Daily closing | ✅ (existing) | ✅ | — | ✅ (existing) | (existing flags) | Check this batch / closing, yield trend, cash mismatches |

## How each piece works

- **Speech** uses the browser's recogniser (Chrome / Edge). Pick English, ಕನ್ನಡ or हिन्दी in the terminal; the choice is remembered on that phone/PC. Spoken numbers in words are turned into digits.
- **Photos** need `GEMINI_API_KEY` (the free provider that reads images). Text and speech fall back to OpenRouter / Groq if set.
- **Matching**: supplier/customer names from a bill or voice are matched to the Parties list (GSTIN first, then name). Item names are matched to Inventory; unmatched lines stay as free text and are listed.
- **Bill photo as proof**: a scanned purchase bill or expense receipt is filed through the same proofs system (Drive / phone copy) when the entry is saved.
- **Checks** are exact rules in `lib/smartEntry.ts` (`CHECK_LIMITS`: purchase rate ±10 %, sale rate ±15 %, total gap ₹1 / 0.5 %, expense 3× usual). They warn; they never block — the button turns into "Save anyway".
- **Ready questions** (`lib/aiPrompts.ts`) send the desk's recent records plus the form being filled to the AI, which only answers. Staff never get barrel challan figures.

## Barcodes and QR codes for items

- **Inventory → "+ code"** gives an item the next shop code (`MT000001`…), or type/scan the manufacturer's barcode into "Barcode / QR code" when adding an item.
- **Print item labels** (`/labels`, or the 🏷️ next to a code): Code 128 + QR, A4 sticker sheet or 50 × 30 mm thermal, with copies per item.
- **Scanning in Sales / Purchase**: a USB/Bluetooth scanner types into the 🔍 box; or use 📷 Scan (Chrome/Edge camera, reads Code 128, QR, EAN-13/8, UPC). A pack code adds 1 to its line; a loose item (kg) gets a new line.
- **Unknown code** (e.g. a new brand's EAN): pick the item once — the code is saved on it and found on every later scan.

## Quick Register (/register)

Same layer, tuned for the counter manager — everything in English + ಕನ್ನಡ.

- **✨ Smart entry tile** (`/register?open=smart`): say, type or photograph what happened → the right form opens pre-filled (kind, item button, qty, rate, amount, UPI/cash/udhaar, name). Nothing is saved until the person taps Save. An item with no button becomes "Other" with the heard name. A sentence the quick voice parser cannot read goes here automatically.
- **Ask / check tab**: ready questions (check the book, who owes us, today, this week, cash, job-work pending) and free questions. Answer-only, in English, Kannada or both.
- **Live checks** under every entry form (`lib/registerChecks.ts`): hand-typed amount ≠ qty × rate (a slipped zero is an alert), rate far from the last 5 same-item entries / saved rate, same entry saved minutes ago, udhaar without a name, amount far above usual, huge quantity, cash going out above what the counter should hold, future or back-dated date. They only point things out; a real alert turns Save into "Save anyway".
- **Scale**: ⚖️ "Use scale weight" appears only while the scale bridge runs — on the sale/purchase quantity, job-work seed kg and fresh-crush seed/oil kg.
- **Item codes**: 🔍 scan or type a barcode/QR in a sale/purchase form → item and unit are set from the Items master.
- **Bill photo**: a photo used for AI fill is filed with the entry but does not count as the owner's proof of payment.

## Limits

- Speech and camera scanning need Chrome or Edge; on iPhone Safari type, or use a Bluetooth scanner.
- AI reading of bills is good but not perfect — that is why every fill is reviewed and every bill is checked by exact rules.
- Kannada/Hindi speech quality depends on the phone's speech engine.
