// Ready-made questions for the AI terminal on each desk ("prompt chips").
// The AI only ANSWERS — it reads the desk's records plus the form being filled
// and explains; it never saves or changes anything.

export type AskDesk = "purchase" | "sales" | "expense" | "stock" | "jobwork" | "closing" | "mfg";

export interface DeskPrompt {
  id: string;
  label: string;
  instruction: string;
}

const CHECK_TAIL = " List only real problems, each with the actual figures (₹, kg, date, name). If nothing is wrong, say so in one line. Never invent numbers that are not in the data.";

export const DESK_PROMPTS: Record<AskDesk, DeskPrompt[]> = {
  purchase: [
    { id: "check", label: "✅ Check this bill", instruction: "Check the purchase bill in FORM against the past purchases: rate vs recent rates for the same item and supplier, duplicate bill number, GST % (edible oil is normally 5%), quantities and totals." + CHECK_TAIL },
    { id: "rates", label: "📈 Rate history", instruction: "For each item in FORM, list the last 5 purchase rates (date, supplier, ₹/unit) and say whether today's rate is high, normal or low compared with them." },
    { id: "owe", label: "💰 What do I owe?", instruction: "From the purchase bills with payment CREDIT, total what is unpaid to each supplier, with the oldest unpaid bill date. Highest first." },
    { id: "barrels", label: "🛢️ Bill vs barrels weighed", instruction: "Compare oil received in barrels (BARREL LOTS: measured net kg vs challan kg) with the purchase bills from the same supplier around the same dates. Does the billed quantity match the oil actually weighed? Give differences in kg and, where a rate is known, in ₹." + CHECK_TAIL },
  ],
  sales: [
    { id: "check", label: "✅ Check this invoice", instruction: "Check the sales invoice in FORM: any line sold below its last purchase cost, rates unusual vs recent sales of the same item, missing HSN or GST %." + CHECK_TAIL },
    { id: "quote", label: "🏷️ What rate to charge?", instruction: "For each item in FORM give: last purchase cost (date), the last 5 sale rates, and the margin per kg at the usual sale rate. Suggest a rate range based only on these figures." },
    { id: "credit", label: "📒 Who owes me?", instruction: "From invoices with payment CREDIT, total what each customer owes with the oldest invoice date. Highest first." },
    { id: "today", label: "📊 Today & this week", instruction: "Summarise sales for today and the last 7 days: number of invoices, total ₹, top items by quantity and by ₹, cash vs UPI vs credit." },
  ],
  expense: [
    { id: "check", label: "✅ Is this normal?", instruction: "Compare the expense in FORM with past expenses in the same category (amounts, how often). Is it normal, high, or a possible duplicate?" + CHECK_TAIL },
    { id: "month", label: "📊 This month", instruction: "Total this month's expenses by category and compare with last month. Point out the biggest increase." },
    { id: "dupes", label: "🔁 Possible duplicates", instruction: "List expenses that look entered twice (same or next day, same category, same or nearly the same amount)." + CHECK_TAIL },
  ],
  stock: [
    { id: "gaps", label: "🔍 Explain the gaps", instruction: "Look at the stock count in FORM and the recent closings. For the biggest gaps between counted and expected stock, say which product, how many kg, and what to check physically (spillage, unrecorded sale, wrong count, tank reading)." },
    { id: "trend", label: "📉 Stock trend", instruction: "From the recent closings, which products' stock is falling fastest and which may run out soon?" },
  ],
  jobwork: [
    { id: "check", label: "✅ Check this intake", instruction: "Check the job-work intake in FORM: seed kg, cake ownership, advances, cans — anything unusual compared with this customer's past intakes." + CHECK_TAIL },
    { id: "audit", label: "🧾 Pending settlements", instruction: "List old unsettled job-work intakes (customer, date, seed kg, days pending) — oldest first. These matter for GST Section 143 / ITC-04." },
  ],
  closing: [
    { id: "check", label: "✅ Check this closing", instruction: "Check the cash closing in FORM: does cash in − cash out match the counted cash? Compare with recent closings and point out unusual figures." + CHECK_TAIL },
    { id: "audit", label: "🚨 Cash mismatches", instruction: "List recent cash mismatches (date, session, amount) and whether they repeat." },
  ],
  mfg: [
    { id: "check", label: "✅ Check this batch", instruction: "Check the manufacturing batch in FORM: seed kg, oil yield %, cake — compared with recent batches of the same seed. Flag mass-balance gaps over 2%." + CHECK_TAIL },
    { id: "yield", label: "📈 Yield trend", instruction: "Compare oil yield % across recent batches by seed and supplier. Which supplier's seed gives the best and worst yield?" },
  ],
};

export function deskPrompt(desk: AskDesk, id: string): DeskPrompt | null {
  return DESK_PROMPTS[desk]?.find((p) => p.id === id) ?? null;
}

export const ASK_DESKS = Object.keys(DESK_PROMPTS) as AskDesk[];
