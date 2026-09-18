// Deterministic fallback for the AI Terminal's oil-can extraction.
//
// The free-tier LLM behind the AI Terminal (aiFillSchemas.ts's canNote
// instructs it correctly) still sometimes fails to turn a phrase like
// "15 kg can" into can15 = 1 and instead drops the raw phrase into
// "notes" — a real, reported bug (Sahil: "15 kg can - not getting entry
// in form field, it is getting in notes"). Rather than depend entirely
// on a small/free model's judgement for a pattern this mechanical, this
// module parses can mentions out of the raw text with plain regex, and
// the API route merges the result over whatever the AI returned —
// regex wins for this specific field, since it's far more reliable here
// than free-tier model inference. This never touches any other field
// (customer, seedKg, notes, etc.) — only can15 / can5new / can5old.

export type CanFieldKey = "can15" | "can5new" | "can5old";

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseCount(raw: string | undefined): number {
  if (!raw) return 1;
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  return NUMBER_WORDS[trimmed] ?? 1;
}

// Matches things like: "15 kg can", "a 15kg can", "2 x 5 kg new cans",
// "5 kg old can", "one 15 kg can", "3 15kg cans". The count word/number
// may appear before the size (common) — a trailing "x2"-style count is
// not handled, since that phrasing hasn't come up in practice.
const CAN_MENTION_RE =
  /\b(?:(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:x\s*)?)?(\d+)\s*kg\s*(new|old)?\s*cans?\b/gi;

export function parseCanMentions(text: string): Partial<Record<CanFieldKey, number>> {
  const result: Partial<Record<CanFieldKey, number>> = {};
  if (!text) return result;
  let m: RegExpExecArray | null;
  const re = new RegExp(CAN_MENTION_RE);
  while ((m = re.exec(text)) !== null) {
    const count = parseCount(m[1]);
    const size = m[2];
    const qualifier = (m[3] || "").toLowerCase();
    let key: CanFieldKey | null = null;
    if (size === "15") key = "can15";
    else if (size === "5") key = qualifier === "old" ? "can5old" : "can5new";
    if (!key) continue;
    result[key] = (result[key] || 0) + count;
  }
  return result;
}

// Merges regex-detected can counts over the AI's own fields for the
// jobwork desk only. Regex wins when it found something for a given
// can key — the AI's fields are left untouched for every other key,
// including "notes" (a duplicate mention there is harmless; a missing
// can-field entry is the actual bug this exists to prevent).
export function applyCanFallback(
  desk: string,
  text: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (desk !== "jobwork") return fields;
  const detected = parseCanMentions(text);
  if (Object.keys(detected).length === 0) return fields;
  return { ...fields, ...detected };
}
