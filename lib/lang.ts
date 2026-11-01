// 🗣️ Hindi / Hinglish / Kannada → the English words the voice and chat parsers understand.
// "दो सौ रुपये का सरसों तेल बेचा रमेश को" → "200 rs mustard oil sold to रमेश". Pure; tested in
// lib/__tests__/lang.test.ts. Names stay as spoken.

const DEV_DIGITS = "०१२३४५६७८९";
const KN_DIGITS = "೦೧೨೩೪೫೬೭೮೯";

// longest phrases first; whole-word only (spaces / start / end around)
const PHRASES: [string, string][] = [
  // udhaar received before plain udhaar
  ["उधार वापस", "udhaar received"], ["उधार आया", "udhaar received"], ["उधार मिला", "udhaar received"], ["udhar wapas", "udhaar received"], ["udhaar wapas", "udhaar received"], ["udhar aaya", "udhaar received"], ["udhaar aaya", "udhaar received"], ["ಉದ್ರಿ ಬಂತು", "udhaar received"], ["ಉದ್ರಿ ವಾಪಸ್", "udhaar received"],
  // sale
  ["बेचा", "sold"], ["बेची", "sold"], ["बेचे", "sold"], ["बिक्री", "sale"], ["बिका", "sold"], ["becha", "sold"], ["bechi", "sold"], ["beche", "sold"], ["bikri", "sale"], ["ಮಾರಿದೆ", "sold"], ["ಮಾರಿದ್ದು", "sold"], ["ಮಾರಾಟ ಮಾಡಿದೆ", "sold"], ["ಕೊಟ್ಟೆ", "sold"],
  // purchase
  ["खरीदा", "bought"], ["खरीदी", "bought"], ["खरीद", "purchase"], ["kharida", "bought"], ["kharidi", "bought"], ["kharid", "purchase"], ["ತೆಗೆದುಕೊಂಡೆ", "bought"], ["ಖರೀದಿಸಿದೆ", "bought"], ["ತಂದೆ", "bought"],
  // expense / payment
  ["खर्चा", "expense"], ["खर्च", "expense"], ["तनख्वाह", "salary"], ["तनख़्वाह", "salary"], ["पगार", "salary"], ["वेतन", "salary"], ["tankhwah", "salary"], ["pagar", "salary"], ["ಪಗಾರ", "salary"],
  // pay mode
  ["नकद", "cash"], ["नगद", "cash"], ["कैश", "cash"], ["nakad", "cash"], ["nagad", "cash"], ["उधार", "udhaar"], ["उधारी", "udhaar"], ["udhar", "udhaar"], ["udhari", "udhaar"], ["फोनपे", "phonepe"], ["ಫೋನ್ ಪೇ", "phonepe"],
  // items
  ["सरसों", "mustard"], ["सरसो", "mustard"], ["sarson", "mustard"], ["sarso", "mustard"], ["मूंगफली", "groundnut"], ["मूँगफली", "groundnut"], ["moongfali", "groundnut"], ["mungfali", "groundnut"], ["शेंगा", "groundnut"], ["सूरजमुखी", "sunflower"], ["surajmukhi", "sunflower"],
  ["कुसुम", "karadi"], ["करडी", "karadi"], ["kusum", "karadi"], ["खली", "cake"], ["बीज", "seed"], ["beej", "seed"], ["डिब्बा", "tin"], ["डिब्बे", "tins"], ["पीपा", "tin"], ["dabba", "tin"], ["dabbe", "tins"], ["peepa", "tin"],
  ["डीजल", "diesel"], ["डीज़ल", "diesel"], ["चाय", "tea"], ["नाश्ता", "food"], ["बिजली", "power"], ["bijli", "power"], ["भाड़ा", "transport"], ["bhada", "transport"], ["तेल", "oil"], ["tel", "oil"], ["ಸಾಸಿವೆ", "mustard"], ["ಎಣ್ಣೆ", "oil"], ["ಡಬ್ಬಿ", "tin"], ["ರಾಗಿ", "ragi"],
  // units
  ["किलो", "kg"], ["केजी", "kg"], ["लीटर", "litre"], ["बोरी", "bags"], ["bori", "bags"], ["ಕಿಲೋ", "kg"], ["ಕೆ.ಜಿ", "kg"], ["ಲೀಟರ್", "litre"], ["भाव", "rate"], ["bhav", "rate"], ["दर", "rate"], ["रुपये", "rs"], ["रुपए", "rs"], ["रुपया", "rs"], ["rupaye", "rs"], ["rupay", "rs"],
  ["सौ", "hundred"], ["हज़ार", "thousand"], ["हजार", "thousand"], ["hazaar", "thousand"], ["hazar", "thousand"], ["लाख", "lakh"],
  // questions
  ["कितना स्टॉक", "stock"], ["स्टॉक", "stock"], ["ಎಷ್ಟು ಸ್ಟಾಕ್", "stock"], ["आज का हिसाब", "today"], ["आज", "today"], ["ಇವತ್ತು", "today"], ["ಇಂದು", "today"], ["ನಿನ್ನೆ", "yesterday"], ["इस हफ्ते", "week"], ["इस महीने", "month"],
  ["ರಿಪೋರ್ಟ್", "report"], ["रिपोर्ट", "report"], ["गल्ला", "cash"], ["galla", "cash"],
  // "to" markers
  ["को", "to"], ["से", "from"], ["ko", "to"], ["ರಿಗೆ", " to"],
];
const NUMS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, पच्चीस: 25, डेढ़: 1.5, ढाई: 2.5,
  ek: 1, teen: 3, char: 4, paanch: 5, panch: 5, saat: 7, aath: 8, bees: 20, pachaas: 50, pachas: 50, dhai: 2.5, dedh: 1.5,
  ಹನ್ನೊಂದು: 11, ಹನ್ನೆರಡು: 12, ಹದಿನೈದು: 15, ಮೂವತ್ತು: 30, ನಲವತ್ತು: 40, ಅರವತ್ತು: 60, ಎಪ್ಪತ್ತು: 70, ಎಂಬತ್ತು: 80, ತೊಂಬತ್ತು: 90, ಇಪ್ಪತ್ತೈದು: 25,
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SORTED = [...PHRASES].sort((a, b) => b[0].length - a[0].length);
// a word boundary that also works for Devanagari / Kannada letters (ES5: no \p{L})
const B = "(^|[\\s,.?!])";
const E = "(?=$|[\\s,.?!])";

export const hasIndic = (s: string) => /[ऀ-ॿಀ-೿]/.test(s);
const HINGLISH = /\b(becha|bechi|beche|bikri|kharida|kharidi|kharid|udhar|udhari|nakad|nagad|sarson|moongfali|dabba|peepa|tankhwah|pagar|hazaar|hazar|rupaye|galla|bhada|bijli)\b/i;
/** True when the text needs translating at all. */
export const needsEnglish = (s: string) => hasIndic(s) || HINGLISH.test(s);

export function toEnglish(raw: string): string {
  let s = ` ${raw.toLowerCase()} `;
  s = s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d))).replace(/[೦-೯]/g, (d) => String(KN_DIGITS.indexOf(d)));
  for (const [from, to] of SORTED) s = s.replace(new RegExp(`${B}${esc(from)}${E}`, "g"), `$1${to}`);
  // the Kannada dative ending stuck to a name: "ರಮೇಶ್‌ಗೆ" → "to ರಮೇಶ್"
  s = s.replace(/([ಀ-೿]{2,})(ಗೆ|ಿಗೆ|ಕ್ಕೆ)(?=\s)/g, "to $1");
  s = s.replace(new RegExp(`${B}([^\\s]+)${E}`, "g"), (m, pre, w) => (NUMS[w] !== undefined ? `${pre}${NUMS[w]}` : m));
  // "2 hundred" → 200, "1.5 thousand" → 1500, "2 lakh" → 200000
  s = s.replace(/(\d+(?:\.\d+)?)\s+hundred/g, (_, n) => String(Number(n) * 100));
  s = s.replace(/(\d+(?:\.\d+)?)\s+thousand/g, (_, n) => String(Number(n) * 1000));
  s = s.replace(/(\d+(?:\.\d+)?)\s+lakh/g, (_, n) => String(Number(n) * 100000));
  s = s.replace(/\bka\b|\bki\b|\bke\b|का|की|के|ಅನ್ನು/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
