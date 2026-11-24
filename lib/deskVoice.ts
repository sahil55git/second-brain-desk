import type { SavedBill } from "./counterRecords";
import { isTracked, payStatus } from "./counterTrack";

export type DeskCommand =
  | { action: "discount" }
  | { action: "all" }
  | { action: "return" | "cancel" | "cash"; no: string };

const small = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const tens = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

export function spokenBillNumber(raw: string): string | null {
  const digits = raw.trim().toLowerCase().replace(/[೦-೯]/g, d => String("೦೧೨೩೪೫೬೭೮೯".indexOf(d)));
  if (/^[1-9]\d*$/.test(digits)) return digits;
  const [first, second, ...rest] = digits.split(/[ -]+/);
  if (rest.length) return null;
  if (!second && small.indexOf(first) > 0) return String(small.indexOf(first));
  const ten = tens.indexOf(first);
  const unit = second ? small.indexOf(second) : 0;
  return ten >= 0 && (!second || (unit > 0 && unit < 10)) ? String((ten + 2) * 10 + unit) : null;
}

export function deskCommand(raw: string): DeskCommand | null {
  const words = raw.trim().toLowerCase().replace(/ಬಿಲ್/g, "bill").replace(/ಸಂಖ್ಯೆ/g, "number")
    .replace(/ರದ್ದು/g, "cancel").replace(/ವಾಪಸ್/g, "return").replace(/ರಿಯಾಯಿತಿ/g, "discount")
    .replace(/[೦-೯]/g, d => String("೦೧೨೩೪೫೬೭೮೯".indexOf(d)))
    .replace(/\bno\.\s*/g, "number ").replace(/[.!?]$/, "").replace(/\s+/g, " ").trim();
  if (/^(?:(?:open|give|bill) )?(?:discount|dicount)$/.test(words)) return { action: "discount" };
  if (/^(?:(?:received|receive|paid) all pending bills?|all pending bills? (?:paid|received)|ಎಲ್ಲಾ ಬಾಕಿ bill ಹಣ ಬಂದಿದೆ)$/.test(words)) return { action: "all" };
  const bill = /^bill(?: (?:no|number))?(?:[ #]+(.+))?$/;
  for (const action of ["return", "cancel", "cash"] as const) {
    const verb = action === "cash" ? "(?:cash received|received cash|ನಗದು ಬಂದಿದೆ)" : action;
    const match = words.match(new RegExp("^" + verb + " (?:for )?(.+)$")) ||
      words.match(new RegExp("^(.+) " + verb + "$"));
    const target = match?.[1].match(bill);
    if (target) {
      const no = target[1] ? spokenBillNumber(target[1]) : "";
      if (no !== null) return { action, no };
    }
  }
  return null;
}

export function voiceCashDue(b: Pick<SavedBill, "track" | "modes" | "total">) {
  return isTracked(b.track) && (b.track.payPending ? b.total > 0 : payStatus(b.modes, b.track).cashDue > 0);
}

