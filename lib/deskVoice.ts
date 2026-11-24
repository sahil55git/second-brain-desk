import type { SavedBill } from "./counterRecords";
import { isTracked, payStatus } from "./counterTrack";

export type DeskCommand =
  | { action: "discount" }
  | { action: "all" }
  | { action: "return" | "cancel" | "cash"; no: string };

const small = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const tens = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

const kannadaNumbers = "ಸೊನ್ನೆ ಒಂದು ಎರಡು ಮೂರು ನಾಲ್ಕು ಐದು ಆರು ಏಳು ಎಂಟು ಒಂಬತ್ತು ಹತ್ತು ಹನ್ನೊಂದು ಹನ್ನೆರಡು ಹದಿಮೂರು ಹದಿನಾಲ್ಕು ಹದಿನೈದು ಹದಿನಾರು ಹದಿನೇಳು ಹದಿನೆಂಟು ಹತ್ತೊಂಬತ್ತು".split(" ");
const kannadaTens = "ಇಪ್ಪತ್ತು ಮೂವತ್ತು ನಲವತ್ತು ಐವತ್ತು ಅರವತ್ತು ಎಪ್ಪತ್ತು ಎಂಬತ್ತು ತೊಂಬತ್ತು".split(" ");
const kannadaTensPrefixes = "ಇಪ್ಪತ್ತ ಮೂವತ್ತ ನಲವತ್ತ ಐವತ್ತ ಅರವತ್ತ ಎಪ್ಪತ್ತ ಎಂಬತ್ತ ತೊಂಬತ್ತ".split(" ");
const joinedUnits = "ೊಂದು ೆರಡು ಮೂರು ನಾಲ್ಕು ೈದು ಾರು ೇಳು ೆಂಟು ೊಂಬತ್ತು".split(" ");

const kannadaBillNumbers = new Map<string, string>();
kannadaNumbers.slice(1).forEach((word, i) => kannadaBillNumbers.set(word, String(i + 1)));
kannadaTens.forEach((word, i) => {
  const ten = (i + 2) * 10;
  kannadaBillNumbers.set(word, String(ten));
  kannadaNumbers.slice(1, 10).forEach((unit, j) => {
    const prefix = kannadaTensPrefixes[i];
    const value = String(ten + j + 1);
    kannadaBillNumbers.set(word + " " + unit, value);
    kannadaBillNumbers.set(prefix + " " + unit, value);
    kannadaBillNumbers.set(prefix + joinedUnits[j], value);
  });
});

export function spokenBillNumber(raw: string): string | null {
  const digits = raw.normalize("NFC").trim().toLowerCase().replace(/[೦-೯]/g, d => String("೦೧೨೩೪೫೬೭೮೯".indexOf(d)));
  if (/^[1-9]\d*$/.test(digits)) return digits;
  const kannada = kannadaBillNumbers.get(digits);
  if (kannada) return kannada;
  const [first, second, ...rest] = digits.split(/[ -]+/);
  if (rest.length) return null;
  if (!second && small.indexOf(first) > 0) return String(small.indexOf(first));
  const ten = tens.indexOf(first);
  const unit = second ? small.indexOf(second) : 0;
  return ten >= 0 && (!second || (unit > 0 && unit < 10)) ? String((ten + 2) * 10 + unit) : null;
}

export function deskCommand(raw: string): DeskCommand | null {
  const words = raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ")
    .replace(/(?:ಎಲ್ಲಾ|ಎಲ್ಲ|ಎಲ್ಲವೂ) (?:ಬಾಕಿ|ಪೆಂಡಿಂಗ್) (?:ಬಿಲ್‌?ಗಳ(?:ಿಗೆ|ಿಂದ)?|ಬಿಲ್ಲುಗಳ(?:ಿಗೆ|ಿಂದ)?|ಬಿಲ್) (?:ನಗದು|ಹಣ|ಕ್ಯಾಶ್) (?:ಬಂದಿದೆ|ಬಂತು|ಪಡೆದಿದ್ದೇನೆ|ಸ್ವೀಕರಿಸಿದೆ|ಸ್ವೀಕರಿಸಲಾಗಿದೆ)/g, "received all pending bills")
    .replace(/(?:ರಿಯಾಯಿತಿ|ಡಿಸ್ಕೌಂಟ್)(?: (?:ಕೊಡಿ|ನೀಡಿ|ತೆರೆಯಿರಿ|ತೆರೆ|ಓಪನ್ ಮಾಡಿ))?/g, "discount")
    .replace(/(?:ರದ್ದು|ಕ್ಯಾನ್ಸಲ್)(?: ಮಾಡಿ)?/g, "cancel")
    .replace(/(?:ವಾಪಸ್|ರಿಟರ್ನ್)(?: (?:ಮಾಡಿ|ತೆಗೆದುಕೊಳ್ಳಿ))?|ಹಿಂತಿರುಗಿಸಿ/g, "return")
    .replace(/ ಅನ್ನು (?=cancel|return)/g, " ")
    .replace(/(?:ನಗದು|ಹಣ|ಕ್ಯಾಶ್) (?:ಬಂದಿದೆ|ಬಂತು|ಪಡೆದಿದ್ದೇನೆ|ಸ್ವೀಕರಿಸಿದೆ|ಸ್ವೀಕರಿಸಲಾಗಿದೆ)/g, "cash received")
    .replace(/ಬಿಲ್ಲಿಗೆ|ಬಿಲ್‌ಗೆ|ಬಿಲ್ಗೆ|ಬಿಲ್ಲನ್ನು|ಬಿಲ್ ಅನ್ನು|ಬಿಲ್ಲು|ಬಿಲ್/g, "bill")
    .replace(/ಸಂಖ್ಯೆ|ನಂಬರ್|ನಂಬರು|ನಂ\./g, "number")
    .replace(/[೦-೯]/g, d => String("೦೧೨೩೪೫೬೭೮೯".indexOf(d)))
    .replace(/\bno\.\s*/g, "number ").replace(/[.!?]$/, "").replace(/\s+/g, " ").trim();
  if (/^(?:(?:open|give|bill) )?(?:discount|dicount)$/.test(words)) return { action: "discount" };
  if (/^(?:(?:received|receive|paid) all pending bills?|all pending bills? (?:paid|received))$/.test(words)) return { action: "all" };
  const bill = /^bill(?: (?:no|number))?(?:[ #]+(.+))?$/;
  for (const action of ["return", "cancel", "cash"] as const) {
    const verb = action === "cash" ? "(?:cash received|received cash|ನಗದು ಬಂದಿದೆ)" : action;
    const match = words.match(new RegExp("^" + verb + " (?:for )?(.+)$")) ||
      words.match(new RegExp("^(.+) " + verb + "$"));
    const phrase = match?.[1].trim();
    const target = phrase?.match(bill) || phrase?.match(/^(.+?)(?: number)? bill$/);
    if (target) {
      const number = target[1] || "";
      const stem = number.endsWith("ಕ್ಕೆ") ? number.slice(0, -"ಕ್ಕೆ".length) : number;
      const no = !number ? "" : spokenBillNumber(stem) ?? (stem !== number ? spokenBillNumber(stem + "ು") : null);
      if (no !== null) return { action, no };
    }
  }
  return null;
}

export function voiceCashDue(b: Pick<SavedBill, "track" | "modes" | "total">) {
  return isTracked(b.track) && (b.track.payPending ? b.total > 0 : payStatus(b.modes, b.track).cashDue > 0);
}

