// Quick Register words, English + Kannada. Kannada wording should be
// checked by a fluent speaker before wide use.
import type { LangMode } from "./register";

export const W = {
  title: ["Mahadev Traders", "ಮಹಾದೇವ ಟ್ರೇಡರ್ಸ್"],
  register: ["Quick Register", "ತ್ವರಿತ ದಾಖಲೆ"],
  moneyIn: ["Money In", "ಬರುವ ಹಣ"],
  moneyOut: ["Money Out", "ಹೋಗುವ ಹಣ"],
  otherCash: ["Cash taken out of counter", "ಕೌಂಟರಿನಿಂದ ತೆಗೆದ ನಗದು"],
  notExpense: ["not expense", "ಖರ್ಚು ಅಲ್ಲ"],
  SALE: ["Sale", "ಮಾರಾಟ"],
  UDHAAR_IN: ["Udhaar received", "ಉದ್ರಿ ವಸೂಲಿ"],
  PURCHASE: ["Purchase", "ಖರೀದಿ"],
  EXPENSE: ["Expense", "ಖರ್ಚು"],
  PAYMENT: ["Payment / Salary", "ಪಾವತಿ / ಸಂಬಳ"],
  PIGMEE: ["Pigmee", "ಪಿಗ್ಮಿ"],
  OWNER_DRAW: ["Sahil took", "ಸಾಹಿಲ್ ತೆಗೆದದ್ದು"],
  jobWork: ["Job-Work", "ಕೆಲಸದ ಗಾಣ"],
  jwNew: ["New intake", "ಹೊಸ ದಾಖಲೆ"],
  jwSettle: ["Pay / settle", "ಇತ್ಯರ್ಥ"],
  count: ["Count cash", "ನಗದು ಎಣಿಕೆ"],
  calc: ["Calculator", "ಕ್ಯಾಲ್ಕುಲೇಟರ್"],
  reports: ["Reports", "ವರದಿ"],
  opening: ["Yesterday closing", "ನಿನ್ನೆಯ ಮುಚ್ಚುವ ನಗದು"],
  cashIn: ["Cash in", "ನಗದು ಬಂತು"],
  cashOut: ["Cash out", "ನಗದು ಹೋಯ್ತು"],
  jwCash: ["Job-work cash", "ಗಾಣದ ನಗದು"],
  inCounter: ["Should be in counter", "ಕೌಂಟರಿನಲ್ಲಿ ಇರಬೇಕಾದ್ದು"],
  t1: ["Tally 1 (midday)", "ಎಣಿಕೆ 1 (ಮಧ್ಯಾಹ್ನ)"],
  t2: ["Tally 2 (closing)", "ಎಣಿಕೆ 2 (ಮುಚ್ಚುವ)"],
  notDone: ["not done", "ಆಗಿಲ್ಲ"],
  matched: ["Matched", "ಸರಿಯಾಗಿದೆ"],
  short: ["Short", "ಕಡಿಮೆ"],
  extra: ["Extra", "ಹೆಚ್ಚು"],
  overLimit: ["above ₹300 limit — tell Sahil", "₹300 ಮಿತಿ ಮೀರಿದೆ — ಸಾಹಿಲ್‌ಗೆ ತಿಳಿಸಿ"],
  entries: ["Today's entries", "ಇಂದಿನ ದಾಖಲೆಗಳು"],
  none: ["Nothing yet", "ಇನ್ನೂ ಏನೂ ಇಲ್ಲ"],
  what: ["What?", "ಏನು?"],
  itemName: ["What is it? (type the name)", "ಏನು? (ಹೆಸರು ಬರೆಯಿರಿ)"],
  qty: ["Quantity", "ಪ್ರಮಾಣ"],
  rate: ["Rate ₹ per", "ದರ ₹ ಪ್ರತಿ"],
  amount: ["Amount ₹", "ಮೊತ್ತ ₹"],
  how: ["Paid how?", "ಹೇಗೆ?"],
  who: ["Name (optional)", "ಹೆಸರು (ಬೇಕಾದರೆ)"],
  note: ["Note", "ಟಿಪ್ಪಣಿ"],
  save: ["Save", "ಉಳಿಸಿ"],
  saving: ["Saving…", "ಉಳಿಸಲಾಗುತ್ತಿದೆ…"],
  saved: ["Saved ✓", "ಉಳಿಸಲಾಗಿದೆ ✓"],
  needAmount: ["Enter the amount", "ಮೊತ್ತ ಹಾಕಿ"],
  needKg: ["Enter seed kg", "ಬೀಜದ ಕೆಜಿ ಹಾಕಿ"],
  needName: ["Enter customer name", "ಗ್ರಾಹಕರ ಹೆಸರು ಹಾಕಿ"],
  deleteQ: ["Delete this entry?", "ಈ ದಾಖಲೆ ಅಳಿಸಬೇಕೇ?"],
  deleted: ["Deleted", "ಅಳಿಸಲಾಗಿದೆ"],
  CASH: ["Cash", "ನಗದು"],
  UPI: ["UPI", "UPI"],
  CREDIT: ["Udhaar", "ಉದ್ರಿ"],
  itemwise: ["Item-wise", "ಐಟಂ ಪ್ರಕಾರ"],
  totalSale: ["Total sale (scale slip)", "ಒಟ್ಟು ಮಾರಾಟ (ಸ್ಕೇಲ್ ಸ್ಲಿಪ್)"],
  partial: ["Part", "ಸ್ವಲ್ಪ"],
  full: ["Full closing", "ಪೂರ್ತಿ"],
  which: ["Which count?", "ಯಾವ ಎಣಿಕೆ?"],
  coins: ["Coins ₹", "ನಾಣ್ಯ ₹"],
  counted: ["Counted", "ಎಣಿಸಿದ್ದು"],
  editOpening: ["Change yesterday closing", "ನಿನ್ನೆಯ ನಗದು ಬದಲಿಸಿ"],
  vehicle: ["Auto / vehicle no. (optional)", "ಆಟೋ / ವಾಹನ ನಂ (ಬೇಕಾದರೆ)"],
  seedKg: ["Seed (kg)", "ಬೀಜ (ಕೆಜಿ)"],
  cakeQ: ["Who keeps the cake?", "ಹಿಂಡಿ ಯಾರ ಬಳಿ?"],
  cakeShop: ["Shop keeps cake", "ಅಂಗಡಿ ಹಿಂಡಿ ಇಟ್ಟುಕೊಳ್ಳುತ್ತದೆ"],
  cakeCustomer: ["Customer keeps cake", "ಗ್ರಾಹಕ ಹಿಂಡಿ ತೆಗೆದುಕೊಳ್ಳುತ್ತಾರೆ"],
  advCustomer: ["Advance to customer ₹", "ಗ್ರಾಹಕರಿಗೆ ಮುಂಗಡ ₹"],
  advAuto: ["Advance to auto ₹", "ಆಟೋಗೆ ಮುಂಗಡ ₹"],
  cans: ["Oil cans taken", "ಎಣ್ಣೆ ಡಬ್ಬಿ"],
  expected: ["Expected settlement", "ನಿರೀಕ್ಷಿತ ಇತ್ಯರ್ಥ"],
  shopPays: ["Shop pays", "ಅಂಗಡಿ ಕೊಡಬೇಕು"],
  customerPays: ["Customer pays", "ಗ್ರಾಹಕ ಕೊಡಬೇಕು"],
  logIntake: ["Log intake", "ದಾಖಲಿಸಿ"],
  khali: ["Khali (cake) stock", "ಹಿಂಡಿ ಸ್ಟಾಕ್"],
  unsettled: ["Unsettled", "ಇತ್ಯರ್ಥವಾಗದ"],
  pay: ["Pay", "ಪಾವತಿಸಿ"],
  payCustomer: ["To / from customer ₹", "ಗ್ರಾಹಕ ₹"],
  payAuto: ["To auto ₹", "ಆಟೋ ₹"],
  confirmPay: ["Confirm payment", "ಪಾವತಿ ದೃಢೀಕರಿಸಿ"],
  paid: ["Paid", "ಪಾವತಿಯಾಗಿದೆ"],
  print: ["Print", "ಮುದ್ರಿಸಿ"],
  share: ["Share", "ಹಂಚಿ"],
  csv: ["Copy for accountant", "ಲೆಕ್ಕಿಗರಿಗೆ ಕಾಪಿ"],
  copied: ["Copied ✓", "ಕಾಪಿ ಆಯಿತು ✓"],
  day: ["Day", "ದಿನ"],
  month: ["This month", "ಈ ತಿಂಗಳು"],
  language: ["Language", "ಭಾಷೆ"],
  langBoth: ["Both", "ಎರಡೂ"],
  langEn: ["English only", "ಇಂಗ್ಲಿಷ್ ಮಾತ್ರ"],
  langKn: ["Kannada only", "ಕನ್ನಡ ಮಾತ್ರ"],
  library: ["Saved items", "ಉಳಿಸಿದ ಐಟಂಗಳು"],
  rates: ["Saved rates", "ಉಳಿಸಿದ ದರಗಳು"],
  pigmeeDefault: ["Pigmee daily amount", "ಪಿಗ್ಮಿ ದಿನದ ಮೊತ್ತ"],
  offline: ["Database not connected — entries cannot be saved yet.", "ಡೇಟಾಬೇಸ್ ಸಂಪರ್ಕವಿಲ್ಲ — ಉಳಿಸಲಾಗುವುದಿಲ್ಲ."],
  error: ["Could not save. Try again.", "ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."],
  fullDesk: ["Full desk", "ಪೂರ್ಣ ಡೆಸ್ಕ್"],
  close: ["Close", "ಮುಚ್ಚಿ"],
  ownerOnly: ["Owner only", "ಮಾಲೀಕರಿಗೆ ಮಾತ್ರ"],
  summary: ["Cash summary", "ನಗದು ಸಾರಾಂಶ"],
  favourites: ["Favourites", "ಮೆಚ್ಚಿನವು"],
  editFavs: ["Choose favourites", "ಮೆಚ್ಚಿನವು ಆಯ್ಕೆ"],
  favHint: ["Tap any button to add ★ or remove ☆ it from Favourites.", "ಮೆಚ್ಚಿನವುಗಳಿಗೆ ಸೇರಿಸಲು/ತೆಗೆಯಲು ಬಟನ್ ಒತ್ತಿ."],
  done: ["Done", "ಮುಗಿಯಿತು"],
  layout: ["Screen layout", "ಪರದೆ ವಿನ್ಯಾಸ"],
  layoutHint: [
    "Side by side: forms open on the right while buttons stay on the left. Phones always use one column.",
    "ಪಕ್ಕ-ಪಕ್ಕ: ಬಟನ್‌ಗಳು ಎಡಕ್ಕೆ, ಫಾರ್ಮ್ ಬಲಕ್ಕೆ. ಮೊಬೈಲ್‌ನಲ್ಲಿ ಯಾವಾಗಲೂ ಒಂದೇ ಕಾಲಮ್.",
  ],
  jwEdit: ["Edit intake", "ದಾಖಲೆ ಬದಲಿಸಿ"],
  updateIntake: ["Update intake", "ದಾಖಲೆ ಉಳಿಸಿ"],
  edit: ["Edit", "ಬದಲಿಸಿ"],
  due: ["Due", "ಬಾಕಿ"],
  colTime: ["Time", "ಸಮಯ"],
  colCustomer: ["Customer", "ಗ್ರಾಹಕ"],
  colVehicle: ["Auto/Vehicle", "ಆಟೋ/ವಾಹನ"],
  colSeed: ["Seed kg", "ಬೀಜ ಕೆಜಿ"],
  colCake: ["Cake", "ಹಿಂಡಿ"],
  colNotes: ["Notes", "ಟಿಪ್ಪಣಿ"],
  colStatus: ["Status", "ಸ್ಥಿತಿ"],
  colActions: ["Actions", "ಕ್ರಿಯೆ"],
  cakeShopShort: ["Shop", "ಅಂಗಡಿ"],
  cakeCustomerShort: ["Customer", "ಗ್ರಾಹಕ"],
} as const;

export type WordKey = keyof typeof W;

/** Primary + secondary text for a word under the chosen language mode. */
export function words(k: WordKey, mode: LangMode): { main: string; sub?: string } {
  const [en, kn] = W[k];
  if (mode === "en") return { main: en };
  if (mode === "kn") return { main: kn };
  return { main: en, sub: kn };
}

/** Single string (used in toasts, prompts, aria labels, print). */
export function word(k: WordKey, mode: LangMode): string {
  const [en, kn] = W[k];
  return mode === "kn" ? kn : en;
}

export function pairLabel(en: string, kn: string, mode: LangMode): { main: string; sub?: string } {
  if (mode === "en") return { main: en };
  if (mode === "kn") return { main: kn };
  return en === kn ? { main: en } : { main: en, sub: kn };
}
