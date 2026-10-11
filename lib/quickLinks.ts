// Quick links — one list of every business function with its own URL, so each
// can be a tile on the Quick links page (/go) or pinned to a phone home screen
// ("Add to Home screen" works on any of these addresses). Register links use
// ?open=<key>, which Quick Register turns into the right form on arrival.
export type LinkGroup = "entry" | "jobwork" | "tally" | "mfg" | "office";

export interface QuickLink {
  id: string;
  icon: string;
  title: string;
  kn: string;
  desc: string;
  href: string;
  group: LinkGroup;
  ownerOnly?: boolean;
}

export const GROUP_META: Record<LinkGroup, { icon: string; title: string; kn: string }> = {
  entry: { icon: "📒", title: "Daily entries", kn: "ದಿನದ ಎಂಟ್ರಿ" },
  jobwork: { icon: "🌾", title: "Job-work", kn: "ಜಾಬ್-ವರ್ಕ್" },
  tally: { icon: "🧮", title: "Tally & counts", kn: "ಎಣಿಕೆ" },
  mfg: { icon: "🏭", title: "Manufacturing", kn: "ತಯಾರಿಕೆ" },
  office: { icon: "🗂️", title: "Office & reports", kn: "ಕಚೇರಿ / ವರದಿ" },
};

export const QUICK_LINKS: QuickLink[] = [
  // Daily entries — straight into the form
  { id: "sale", icon: "💰", title: "Sale", kn: "ಮಾರಾಟ", desc: "Add a sale", href: "/register?open=sale", group: "entry" },
  { id: "crush", icon: "🫗", title: "Fresh crush", kn: "ತಾಜಾ ಗಾಣ", desc: "Own seed crushed for a customer", href: "/register?open=crush", group: "entry" },
  { id: "udhaar", icon: "🙌", title: "Udhar received", kn: "ಉದ್ರಿ ಬಂತು", desc: "Old credit collected", href: "/register?open=udhaar", group: "entry" },
  { id: "purchase", icon: "🛒", title: "Purchase", kn: "ಖರೀದಿ", desc: "Seed, oil, tins, labels", href: "/register?open=purchase", group: "entry" },
  { id: "expense", icon: "🧾", title: "Expense", kn: "ಖರ್ಚು", desc: "Diesel, tea, power, repair", href: "/register?open=expense", group: "entry" },
  { id: "payment", icon: "🤝", title: "Payment", kn: "ಪಾವತಿ", desc: "Salary / supplier payment", href: "/register?open=payment", group: "entry" },
  { id: "pigmee", icon: "🏦", title: "Pigmee / bank", kn: "ಪಿಗ್ಮಿ", desc: "Cash to bank, not an expense", href: "/register?open=pigmee", group: "entry" },
  { id: "draw", icon: "🧔", title: "Owner draw", kn: "ಮಾಲೀಕ ತೆಗೆದದ್ದು", desc: "Cash taken by owner", href: "/register?open=draw", group: "entry" },
  { id: "scan", icon: "📸", title: "Scan slip / bill", kn: "ಚೀಟಿ / ಬಿಲ್ ಸ್ಕ್ಯಾನ್", desc: "Weighbridge, weighing slip, bill, receipt", href: "/register?open=scan", group: "entry" },
  { id: "register", icon: "📒", title: "Quick Register", kn: "ಕ್ವಿಕ್ ರಿಜಿಸ್ಟರ್", desc: "Today's full screen", href: "/register", group: "entry" },
  // Job-work
  { id: "jwnew", icon: "🌾", title: "New job-work", kn: "ಹೊಸ ಜಾಬ್-ವರ್ಕ್", desc: "Customer seed received", href: "/register?open=jobwork", group: "jobwork" },
  { id: "jwsettle", icon: "💳", title: "Job-work settle", kn: "ಜಾಬ್-ವರ್ಕ್ ಪಾವತಿ", desc: "Open ledger, settle a customer", href: "/register?open=jwsettle", group: "jobwork" },
  { id: "tally-jw", icon: "🧾", title: "Customer seed count", kn: "ಗ್ರಾಹಕರ ಬೀಜ ಎಣಿಕೆ", desc: "Seed in shop vs challans", href: "/tallies?desk=JOBWORK", group: "jobwork" },
  // Tally
  { id: "cash", icon: "💵", title: "Cash tally", kn: "ಕ್ಯಾಶ್ ಎಣಿಕೆ", desc: "Count notes, see the gap", href: "/cash", group: "tally" },
  { id: "stock", icon: "📦", title: "Oil stock tally", kn: "ಸ್ಟಾಕ್ ಎಣಿಕೆ", desc: "10 products, closing stock", href: "/stock", group: "tally" },
  { id: "tallies", icon: "🧮", title: "All tallies", kn: "ಎಲ್ಲಾ ಎಣಿಕೆ", desc: "Six count desks in one", href: "/tallies", group: "tally" },
  { id: "tally-seed", icon: "🌾", title: "Seed stock", kn: "ಬೀಜ ಸ್ಟಾಕ್", desc: "Raw material count", href: "/tallies?desk=SEED", group: "tally" },
  { id: "tally-cake", icon: "🟤", title: "Cake stock", kn: "ಹಿಂಡಿ ಸ್ಟಾಕ್", desc: "Cake & by-products", href: "/tallies?desk=CAKE", group: "tally" },
  { id: "tally-pack", icon: "📦", title: "Packaging stock", kn: "ಪ್ಯಾಕಿಂಗ್ ಸ್ಟಾಕ್", desc: "Tins, bottles, labels", href: "/tallies?desk=PACK", group: "tally" },
  { id: "tally-udhar", icon: "📒", title: "Udhar balances", kn: "ಉದ್ರಿ ಬಾಕಿ", desc: "Customers & suppliers", href: "/tallies?desk=UDHAR", group: "tally" },
  { id: "tally-tank", icon: "🛢️", title: "Tank dip", kn: "ಟ್ಯಾಂಕ್ ಅಳತೆ", desc: "Dip vs book stock", href: "/tallies?desk=TANK", group: "tally" },
  // Manufacturing
  { id: "mfg", icon: "🏭", title: "Manufacturing", kn: "ತಯಾರಿಕೆ", desc: "Barrels, steps, yield", href: "/mfg", group: "mfg" },
  { id: "mfgnew", icon: "➕", title: "New barrel", kn: "ಹೊಸ ಬ್ಯಾರಲ್", desc: "Start a batch", href: "/mfg?new=1", group: "mfg" },
  // Office
  { id: "records", icon: "🗂️", title: "Proofs & scans", kn: "ಪುರಾವೆ ಮತ್ತು ಸ್ಕ್ಯಾನ್", desc: "Signatures, slips, bills; cash paid without proof", href: "/records", group: "office", ownerOnly: true },
  { id: "reports", icon: "📊", title: "Reports", kn: "ವರದಿ", desc: "Sales, stock, udhar, cash", href: "/reports", group: "office", ownerOnly: true },
  { id: "settings", icon: "⚙️", title: "Settings", kn: "ಸೆಟ್ಟಿಂಗ್ಸ್", desc: "Items, rates, import / export", href: "/settings", group: "office", ownerOnly: true },
  { id: "desk", icon: "🗂️", title: "Full desk", kn: "ಪೂರ್ಣ ಡೆಸ್ಕ್", desc: "Job-work, closing, manufacturing", href: "/", group: "office" },
];

export const GROUP_ORDER: LinkGroup[] = ["entry", "jobwork", "tally", "mfg", "office"];

/** Sheets Quick Register can open from ?open=<key>. */
export const REGISTER_OPEN_KEYS = ["sale", "crush", "udhaar", "purchase", "expense", "payment", "pigmee", "draw", "jobwork", "jwsettle", "cash", "stock", "calc", "scan"] as const;
export type RegisterOpenKey = (typeof REGISTER_OPEN_KEYS)[number];

/** Which links to show this person. */
export function visibleLinks(isOwner: boolean): QuickLink[] {
  return QUICK_LINKS.filter((l) => isOwner || !l.ownerOnly);
}
