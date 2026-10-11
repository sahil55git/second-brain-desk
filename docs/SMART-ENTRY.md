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

## Limits

- Speech and camera scanning need Chrome or Edge; on iPhone Safari type, or use a Bluetooth scanner.
- AI reading of bills is good but not perfect — that is why every fill is reviewed and every bill is checked by exact rules.
- Kannada/Hindi speech quality depends on the phone's speech engine.
