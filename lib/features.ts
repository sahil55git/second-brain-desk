// 🧩 Feature switches: every optional feature can be turned off shop-wide in Settings → Features.
// Off means its pages, Insights tabs, quick links, chat commands and scheduled messages are hidden
// or skipped — no data is deleted, and turning it back on brings everything back. Pure.

export type FeatureGroup = "money" | "stock" | "factory" | "sales" | "ai" | "staff" | "reports";
export const FEATURE_GROUPS: { key: FeatureGroup; label: string }[] = [
  { key: "money", label: "💰 Money & GST" },
  { key: "stock", label: "📦 Stock, buying & godown" },
  { key: "factory", label: "🏭 Factory & machines" },
  { key: "sales", label: "🛒 Sales & customers" },
  { key: "reports", label: "📈 Insights & reports" },
  { key: "ai", label: "🤖 AI & automation" },
  { key: "staff", label: "👥 Staff" },
];

export interface Feature {
  key: string;
  icon: string;
  title: string;
  desc: string;
  group: FeatureGroup;
  /** Insights tabs it owns */
  tabs?: string[];
  /** quick-link ids it owns */
  links?: string[];
  /** pages it owns (path prefixes) */
  paths?: string[];
  /** chat commands (Cmd.t) it owns */
  cmds?: string[];
  /** starts off until switched on */
  defaultOff?: boolean;
}

export const FEATURES: Feature[] = [
  // money
  { key: "gstInvoice", icon: "🧾", title: "GST invoice extras", desc: "HSN tax summary, amount in words and signatory line on printed bills", group: "money" },
  { key: "upiQr", icon: "📲", title: "UPI QR on bills", desc: "Scan-to-pay QR on credit / UPI invoices and in WhatsApp orders", group: "money" },
  { key: "eway", icon: "🚚", title: "E-way bill JSON", desc: "E-way bill button on bills over ₹50,000", group: "money" },
  { key: "rateCards", icon: "📋", title: "Rate cards", desc: "Price lists per customer; fills and checks rates on bills", group: "money", tabs: ["rates"] },
  { key: "profitCash", icon: "💰", title: "Profit & cash forecast", desc: "P&L for any period and the 30-day cash forecast", group: "money", tabs: ["pl"] },
  { key: "budgets", icon: "🎯", title: "Expense budgets", desc: "Monthly limits per expense with pace alerts", group: "money", tabs: ["budget"] },
  { key: "costKg", icon: "🧮", title: "True cost per kg", desc: "Seed, power, labour, packing, freight and interest per kg of oil", group: "money", tabs: ["cost"] },
  { key: "bankMatch", icon: "🏦", title: "Bank / UPI matching", desc: "Match a bank statement with the register", group: "money", tabs: ["bank"] },
  { key: "udhaarRemind", icon: "🙌", title: "Udhaar reminders", desc: "WhatsApp reminders and promised dates", group: "money", tabs: ["udhaar"] },
  // stock & buying
  { key: "runOut", icon: "📦", title: "Stock run-out", desc: "Days left per product and what to buy", group: "stock", tabs: ["stock"] },
  { key: "purchaseOrders", icon: "🧾", title: "Purchase orders & supplier scores", desc: "Write, send and print orders to suppliers; they fill from purchases; supplier 0–100 score", group: "stock", tabs: ["orders"], paths: ["/purchase-orders"], links: ["po"] },
  { key: "poShare", icon: "🔗", title: "PO supplier link", desc: "A link the supplier opens to view and print an order — no sign-in. Off = existing links stop working", group: "stock" },
  { key: "poAlerts", icon: "📅", title: "Purchase order reminders", desc: "Late orders, orders due today or tomorrow and unsent drafts in the chat's needs-attention list", group: "stock" },
  { key: "smartReorder", icon: "🛒", title: "Smart reorder", desc: "Draft purchase orders from forecast and stock", group: "stock", tabs: ["reorder"] },
  { key: "godown", icon: "🏚️", title: "Seed godown", desc: "Bags by stack, moisture loss, oldest-first (FIFO) alerts", group: "stock", paths: ["/godown"], links: ["godown"], tabs: ["godown"] },
  { key: "contracts", icon: "🤝", title: "Contracts & forward buys", desc: "Booked quantity, rate, delivery due and balance per supplier", group: "stock", tabs: ["contracts"] },
  { key: "packing", icon: "🏷️", title: "Packing material & BOM", desc: "Bottles, caps, labels, cartons, tins; cost per SKU; auto-deduct", group: "stock", paths: ["/packing"], links: ["packing"] },
  { key: "dipstick", icon: "📏", title: "Tank dipstick", desc: "Dip in cm → kg using each tank's chart", group: "stock", paths: ["/dip"], links: ["dip"] },
  { key: "variance", icon: "⚖️", title: "Stock variance", desc: "Book stock vs physical count, with an investigation list", group: "stock", tabs: ["variance"] },
  { key: "cycleCount", icon: "🔁", title: "Cycle counting", desc: "3 random items to count each day", group: "stock", paths: ["/count"], links: ["cyclecount"] },
  { key: "barrelDeposit", icon: "🛢️", title: "Barrel deposits", desc: "Who holds how many barrels, deposit and recovery reminders", group: "stock", tabs: ["deposits"] },
  { key: "mandi", icon: "🌾", title: "Mandi prices", desc: "Daily APMC seed prices with buy / wait hint", group: "stock", tabs: ["mandi"], cmds: ["mandi"] },
  { key: "buyAdvisor", icon: "🧭", title: "Buy-now advisor", desc: "Stock days + mandi trend + season + cash → buy signal", group: "stock", tabs: ["advisor"] },
  { key: "weather", icon: "🌦️", title: "Weather & crop watch", desc: "Rain in seed regions as an early price warning", group: "stock", tabs: ["weather"] },
  // factory
  { key: "yield", icon: "🌾", title: "Oil yield trend", desc: "Yield by lot and supplier", group: "factory", tabs: ["yield"] },
  { key: "shouldYield", icon: "🔮", title: "Should-yield prediction", desc: "Expected oil % for a seed lot before you buy", group: "factory", tabs: ["predict"] },
  { key: "machines", icon: "⚙️", title: "Machines", desc: "Hours, power, breakdowns, sediment loss per expeller", group: "factory", tabs: ["machines"], paths: ["/machines"], links: ["machines"] },
  { key: "maintenance", icon: "🔧", title: "Maintenance & spares", desc: "Service calendar by hours, spare-parts stock", group: "factory", paths: ["/maintenance"], links: ["maintenance"] },
  { key: "settling", icon: "⏳", title: "Settling-tank timers", desc: "When a tank is ready to decant", group: "factory", paths: ["/settling"], links: ["settling"] },
  { key: "tankMap", icon: "🛢️", title: "Tanks & barrels map", desc: "Picture of every tank and barrel", group: "factory", tabs: ["map"] },
  // sales
  { key: "forecast", icon: "📦", title: "Demand forecast", desc: "Kg per product for the next 4 weeks with festival lift", group: "sales", tabs: ["forecast"] },
  { key: "waOrders", icon: "💬", title: "WhatsApp orders", desc: "Customers order on WhatsApp; orders desk", group: "sales", paths: ["/orders"], links: ["orders"] },
  { key: "profitKg", icon: "💹", title: "Profit per kg", desc: "Margin per oil and price to keep the target", group: "sales", tabs: ["profit"] },
  // reports
  { key: "commandCentre", icon: "🛰️", title: "Owner command centre", desc: "One live screen: cash, stock days, yield, udhaar, profit, alerts, staff", group: "reports", paths: ["/command"], links: ["command"] },
  { key: "yoy", icon: "📅", title: "Year-on-year", desc: "Each month and festival against last year", group: "reports", tabs: ["yoy"] },
  { key: "scenario", icon: "🎛️", title: "What-if simulator", desc: "Seed price, selling price, volume → profit", group: "reports", tabs: ["scenario"] },
  { key: "watch", icon: "👀", title: "Watch (unusual entries)", desc: "Low rates, back-dated / edited entries, cash short", group: "reports", tabs: ["watch"], cmds: ["watch"] },
  { key: "weekly", icon: "🗓️", title: "Weekly review", desc: "Sunday morning summary and actions", group: "reports", tabs: ["weekly"], cmds: ["review"] },
  // AI & automation
  { key: "askBusiness", icon: "💡", title: "Ask your business", desc: "Questions in plain words answered from your own data", group: "ai", paths: ["/ask"], links: ["ask"] },
  { key: "aiCfo", icon: "🧑‍💼", title: "AI CFO monthly report", desc: "Margins, cash risk, leaks and 3 actions each month", group: "ai", tabs: ["cfo"] },
  { key: "photoAi", icon: "📸", title: "Photo reading", desc: "Bag count, meter and gauge readings from a photo", group: "ai", paths: ["/snap"], links: ["snap"] },
  { key: "voiceAnswer", icon: "🔊", title: "Spoken answers", desc: "The chat reads answers aloud in English, Kannada or Hindi", group: "ai" },
  { key: "rules", icon: "⚡", title: "Rules (if this then that)", desc: "Your own automatic alerts and actions", group: "ai", paths: ["/rules"], links: ["rules"] },
  { key: "driveBackup", icon: "☁️", title: "Google Drive backup", desc: "Nightly CSV files to the Second Brain Drive folders", group: "ai", defaultOff: true },
  { key: "tallySync", icon: "🔄", title: "Tally / Vyapar export", desc: "Tally XML and Vyapar-ready Excel; import Vyapar files", group: "ai", tabs: ["tally"] },
  { key: "backupZip", icon: "💾", title: "Full backup", desc: "Download all data as one zip; nightly copy", group: "ai" },
  { key: "chatBot", icon: "💬", title: "Chat bot", desc: "In-app chat, Telegram and Discord", group: "ai", paths: ["/chat"] },
  { key: "tasks", icon: "📌", title: "Tasks & reminders", desc: "Tasks from chat with morning reminders", group: "ai", cmds: ["task", "tasks"] },
  // staff
  { key: "attendance", icon: "🕘", title: "Attendance", desc: "Present / half / absent with selfie and place", group: "staff", paths: ["/attendance"], links: ["attendance"] },
];

export type FeatureState = { off: string[]; on?: string[] };

export function isOn(state: FeatureState | null | undefined, key: string): boolean {
  const f = FEATURES.find((x) => x.key === key);
  if (!f) return true;
  if (f.defaultOff) return !!state?.on?.includes(key);
  return !state?.off?.includes(key);
}
/** Keys that are off right now. */
export function offKeys(state: FeatureState | null | undefined): string[] {
  return FEATURES.filter((f) => !isOn(state, f.key)).map((f) => f.key);
}
const ownersOf = (pick: (f: Feature) => string[] | undefined) => (state: FeatureState | null | undefined, id: string) => {
  const f = FEATURES.find((x) => (pick(x) || []).includes(id));
  return !f || isOn(state, f.key);
};
export const tabOn = ownersOf((f) => f.tabs);
export const linkOn = ownersOf((f) => f.links);
export const cmdOn = ownersOf((f) => f.cmds);
export function pathOn(state: FeatureState | null | undefined, path: string): boolean {
  const f = FEATURES.find((x) => (x.paths || []).some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)));
  return !f || isOn(state, f.key);
}
/** Turn one feature on or off; returns the new state. */
export function setFeature(state: FeatureState | null | undefined, key: string, on: boolean): FeatureState {
  const f = FEATURES.find((x) => x.key === key);
  const off = new Set(state?.off || []), onS = new Set(state?.on || []);
  if (f?.defaultOff) { if (on) onS.add(key); else onS.delete(key); }
  else { if (on) off.delete(key); else off.add(key); }
  return { off: Array.from(off), on: Array.from(onS) };
}
