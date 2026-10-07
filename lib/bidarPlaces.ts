// Places people come from when they visit the Bidar (585401) mill — used as
// customer / ledger names for job-work, payments and tracking, so "Kamthana"
// is one account no matter who brings the seed.
// Sources: Census 2011 village list of Bidar taluk; India Post list of places
// under PIN 585401 (Bidar Post Office). Spellings are the common English forms;
// edit any name in the Parties desk after adding.
export type PlaceGroup = "city" | "village" | "town";

export const PLACE_GROUPS: Record<PlaceGroup, { title: string; note: string }> = {
  city: { title: "Bidar city localities", note: "Areas of Bidar town under PIN 585401" },
  village: { title: "Villages of Bidar taluk", note: "Census 2011 village list" },
  town: { title: "Nearby towns", note: "Taluk towns around Bidar district" },
};

const CITY = [
  "Bidar", "Chidri", "Naubad", "Mangalpet", "Lalwadi", "Pakalwada", "Hamnabad", "Nawadgeri", "Solpur",
  "Linganand Nagar", "Channabasav Nagar", "New Adarsh Colony", "Haq Colony", "Devi Colony", "Nandi Nagar",
  "Nandi Colony", "Madhav Nagar", "Badruddin Colony", "Multani Colony", "Airport Area", "Basaveshwara Nagar", "Vidya Nagar",
];

const VILLAGE = [
  "Aliamber", "Allapur", "Almaspur", "Ambalpad", "Amlapur", "Andura", "Ashtur", "Atwal", "Ayazpur", "Bagdal",
  "Bahirnalli", "Bakchawadi", "Bambalgi", "Bapur", "Baridabad", "Barur", "Basanthpur", "Baugi", "Bellura",
  "Benakanalli", "Bhangoor", "Bompalli", "Budhera", "Chambool", "Chatnalli", "Chikpet", "Chillargi", "Chimkod",
  "Chintalgera", "Chitta", "Chondi", "Chouli", "Daddapur", "Dharmapur", "Fathepur", "Gadgi", "Ghodepalli",
  "Ghumma", "Goonalli", "Gornalli", "Gouspur", "Hamilapur", "Hippalgaon", "Hochaknalli", "Hokrana", "Honaddi",
  "Honnakheri", "Imampur", "Immamabad", "Islampur", "Jampad", "Janawada", "Kabirwada", "Kadwad", "Kamthana",
  "Kanalli", "Kangankot", "Kangathi", "Kaplapur", "Kasimpur", "Khadernagar", "Khajapur", "Kolhar", "Madaknalli",
  "Magdal", "Mahamdapur", "Malegaon", "Malik Mirzapur", "Malkapur", "Mamankeri", "Manhalli", "Markhal",
  "Markunda", "Mirzapur", "Mirzapur Taj", "Nagora", "Nandagaon", "Naulaspur", "Nelwad", "Nematabad",
  "Nidwancha", "Nizampur", "Odwada", "Paterpalli", "Qutubabad", "Rajgera", "Rajnal", "Ranjolkheni",
  "Rasoolabad", "Rekulgi", "Sangahalli", "Sangolgi", "Sangvi", "Satoli", "Secundrapur", "Shahpur",
  "Shamrajapur", "Shamshirnagar", "Shekapur", "Siddapur", "Sindhol", "Sippalgeri", "Sirimandal",
  "Sirkatnalli", "Sirsi", "Soupur", "Sultanpur", "Tadpalli", "Tajlapur", "Telang Mirzapur", "Vilaspur",
  "Yadlapur", "Yakatpur", "Yarnalli", "Yarnhalli", "Zamistanpur",
];

const TOWN = ["Humnabad", "Bhalki", "Basavakalyan", "Aurad (B)", "Kamalnagar", "Santpur", "Chitguppa", "Hulsur", "Gorta"];

export interface Place {
  name: string;
  group: PlaceGroup;
}

export const PLACES: Place[] = [
  ...CITY.map((name) => ({ name, group: "city" as const })),
  ...VILLAGE.map((name) => ({ name, group: "village" as const })),
  ...TOWN.map((name) => ({ name, group: "town" as const })),
];

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Places of the chosen groups that are not already a party (case-insensitive). */
export function newPlaces(groups: PlaceGroup[], existingNames: string[]): Place[] {
  const have = new Set(existingNames.map(key));
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of PLACES) {
    const k = key(p.name);
    if (!groups.includes(p.group) || have.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** Address text stored with a place account. */
export const placeAddress = (p: Place) =>
  p.group === "city" ? `${p.name}, Bidar, Karnataka 585401` : p.group === "village" ? `${p.name}, Bidar taluk, Karnataka` : `${p.name}, Bidar district, Karnataka`;
