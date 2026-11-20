// Icon library for the mill and the whole business: every icon has a stable id, a group, an English
// name and a Kannada name, so it can be used on any page, tab or Quick-links tile.
// All icons share one 48×48 line style (round caps, currentColor); oil is amber, rust is brown.
// Add a new icon by adding one entry to ICONS (or one badge combo to COMBOS) — the /icons page,
// the tile picker and <MillIcon id="…"/> pick it up automatically. Pure helpers, tested in
// lib/__tests__/millIcons.test.ts.

export type IconGroupId = "seed" | "oil" | "khali" | "cans" | "barrels" | "badges" | "tiles" | "groups";

export interface IconGroup { id: IconGroupId; title: string; kn: string; note: string }
export interface IconDef { id: string; group: IconGroupId; name: string; kn: string; hint?: string; inner: string; candidate?: boolean }

export const ICON_GROUPS: IconGroup[] = [
  { id: "tiles", title: "Ready tiles", kn: "ಟೈಲ್", note: "The weighing tiles as used on the Mill Desk: item + badge" },
  { id: "seed", title: "Oil seed", kn: "ಎಣ್ಣೆ ಬೀಜ", note: "Seeds, plain. Candidates are options to choose from" },
  { id: "oil", title: "Oil", kn: "ಎಣ್ಣೆ", note: "Oil drop" },
  { id: "khali", title: "Khali (oil cake)", kn: "ಹಿಂಡಿ", note: "Round disc with dots" },
  { id: "cans", title: "Oil cans and tins", kn: "ಎಣ್ಣೆ ಡಬ್ಬ", note: "15 kg tin, 5 kg jerrycan. Full is filled with oil, empty has none" },
  { id: "barrels", title: "Barrels", kn: "ಬ್ಯಾರೆಲ್", note: "Empty, half and full, oil level inside" },
  { id: "badges", title: "Badges and arrows", kn: "ಬ್ಯಾಡ್ಜ್", note: "Person, factory, in, out, new, old" },
  { id: "groups", title: "Group headers", kn: "ವಿಭಾಗ", note: "Icons for the row headings" },
];

export const OIL = "#EF9F27";
const RUST = "#9C4A17";
const MUD = "#6E6253";
const SLUDGE = "#4A3C2C";
const DULL = "#8B8579";

const oval = (x: number, y: number, r: number, rx = 2.4, ry = 1.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})"/>`;

function sunflower(): string {
  let p = "";
  for (let a = 0; a < 10; a++) {
    const t = (a * 36 * Math.PI) / 180;
    const x = (24 + 12.5 * Math.cos(t)).toFixed(1);
    const y = (24 + 12.5 * Math.sin(t)).toFixed(1);
    p += `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="2.2" transform="rotate(${a * 36} ${x} ${y})"/>`;
  }
  return p + `<circle cx="24" cy="24" r="6.5"/><path d="M22 23h.01M26 23h.01M24 26h.01M21 26h.01M27 26h.01"/>`;
}

function barrel(id: string, level: number): string {
  const body = "M11 10v26c0 2.8 5.8 5 13 5s13-2.2 13-5V10";
  const y = 41 - level * 31;
  const fill = level > 0 ? `<clipPath id="${id}"><path d="${body}z"/></clipPath><rect x="10" y="${y}" width="28" height="${42 - y}" fill="${OIL}" stroke="none" opacity=".9" clip-path="url(#${id})"/>` : "";
  const top = level >= 1 ? `<ellipse cx="24" cy="10" rx="13" ry="5" fill="${OIL}" opacity=".95"/>` : `<ellipse cx="24" cy="10" rx="13" ry="5"/>`;
  return `${fill}<path d="${body}"/>${top}<path d="M11 19c0 2.8 5.8 5 13 5s13-2.2 13-5M11 28c0 2.8 5.8 5 13 5s13-2.2 13-5"/>`;
}

const SHAPES = {
  tin: { body: "M7 11h34v31a3 3 0 01-3 3H10a3 3 0 01-3-3z", win: [12, 17, 24, 22], line: `<path d="M13 11V6h22v5"/><rect x="12" y="17" width="24" height="22" rx="1.5" stroke-width="1.5"/>` },
  jerry: { body: "M13 18l4-5h14l4 5v20a4 4 0 01-4 4H17a4 4 0 01-4-4z", win: [17, 22, 9, 16], line: `<path d="M18 13V8h10v5M31 13l4-4"/><rect x="17" y="22" width="9" height="16" rx="1" stroke-width="1.4"/>` },
} as const;

/** A tin (15 kg) or jerrycan (5 kg). level 0 = no oil, 1 = full. wear 0 new, 1 old, 3 very old (sediment). */
function can(id: string, shape: "tin" | "jerry", level: number, wear: number, sediment = false): string {
  const d = SHAPES[shape];
  let fill = "";
  if (level > 0) {
    if (shape === "jerry" && !sediment) {
      const y = 42 - level * 29;
      fill = `<clipPath id="${id}"><path d="${d.body}"/></clipPath><rect x="10" y="${y}" width="28" height="${44 - y}" fill="${OIL}" stroke="none" opacity=".9" clip-path="url(#${id})"/>`;
    } else {
      const [x, wy, w, h] = d.win;
      const y = wy + h - level * h;
      fill = `<clipPath id="${id}"><rect x="${x}" y="${wy}" width="${w}" height="${h}"/></clipPath><rect x="${x}" y="${y}" width="${w}" height="${h + 2}" fill="${sediment ? SLUDGE : OIL}" stroke="none" opacity=".9" clip-path="url(#${id})"/>`;
    }
  }
  const col = wear > 0 ? (sediment ? MUD : DULL) : "currentColor";
  const tint = wear > 0 ? `<path d="${d.body}" fill="${MUD}" fill-opacity="${sediment ? 0.6 : 0.28}" stroke="none"/>` : "";
  let w = "";
  if (wear > 0) {
    w = `<path d="M14 36l4-1 2 3-3 3-4-2zM30 22l4 1-1 4-4-1z" fill="${RUST}" stroke="none" opacity=".75"/><path d="M15 25l4 3-3 3 4 3-3 3" stroke="${MUD}" stroke-width="1.6"/><path d="M18 20l9 4M17 30l9 3M30 16l4 5" stroke="${MUD}" stroke-width="1.1" opacity=".9"/>` +
      [[20, 41], [33, 34], [14, 29], [27, 19]].map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="1.3" fill="${RUST}" stroke="none"/>`).join("");
    if (sediment) {
      w = `<path d="M26 36l5-1 3 4-3 3-6-1zM15 21l3 1-1 3-3-1zM22 17l4 1-1 3-4-1zM30 30l3 2-2 4-3-2z" fill="${RUST}" stroke="none" opacity=".8"/><path d="M19 14v7M31 15v9" stroke="#C0692A" stroke-width="2.2" opacity=".75"/><path d="M13 38a4 4 0 004 4h14a4 4 0 004-4" stroke="${RUST}" stroke-width="3" opacity=".7" stroke-dasharray="3 2"/>` + w;
    }
  }
  // colour wrapper so wear colours apply to the outline only
  return `<g stroke="${col}">${tint}${fill}<path d="${d.body}"/>${d.line}${w}</g>`;
}

const KHALI = `<ellipse cx="24" cy="17" rx="15" ry="6"/><path d="M9 17v10c0 3.3 6.7 6 15 6s15-2.7 15-6V17"/><path d="M17 17h.01M24 19h.01M31 17h.01M21 24h.01M28 25h.01"/>`;

export const ICONS: IconDef[] = [
  // oil seed (S0 is the one used so far; S1–S7 are candidates to choose from)
  { id: "seed", group: "seed", name: "Seed", kn: "ಬೀಜ", hint: "Chosen icon — used on every Seed tile", inner: `<g transform="translate(1.5 1) scale(1.9)" stroke-width="1.15"><path d="M12 21V9"/><path d="M12 9c-2.4-1-3.4-3-3.4-5.4 2.4.2 3.4 2.4 3.4 5.4zM12 9c2.4-1 3.4-3 3.4-5.4-2.4.2-3.4 2.4-3.4 5.4zM12 14c-2.4-1-3.4-3-3.4-5M12 14c2.4-1 3.4-3 3.4-5M12 19c-2.4-1-3.4-3-3.4-5M12 19c2.4-1 3.4-3 3.4-5"/></g>` },
  { id: "seed_wheat", group: "seed", name: "Seed, ear", kn: "ಬೀಜ", hint: "S0 · option", candidate: true, inner: `<path d="M24 42V12"/><path d="M24 12c-3-2-4-5-4-8 3 1 4 4 4 8zM24 12c3-2 4-5 4-8-3 1-4 4-4 8zM24 20c-4-1-6-4-6-7 4 1 6 3 6 7zM24 20c4-1 6-4 6-7-4 1-6 3-6 7zM24 28c-4-1-6-4-6-7 4 1 6 3 6 7zM24 28c4-1 6-4 6-7-4 1-6 3-6 7z"/>` },
  { id: "seed_heap", group: "seed", name: "Seed heap", kn: "ಬೀಜದ ರಾಶಿ", hint: "S1 · heap of oilseed", candidate: true, inner: `<path d="M6 40h36"/><path d="M9 40c1-10 7-17 15-17s14 7 15 17"/>${oval(18, 34, -20)}${oval(25, 31, 15)}${oval(31, 35, -35)}${oval(22, 37, 40)}${oval(28, 27, -10)}${oval(15, 38, 10)}` },
  { id: "seed_sunflower", group: "seed", name: "Sunflower", kn: "ಸೂರ್ಯಕಾಂತಿ", hint: "S2 · sunflower head", candidate: true, inner: sunflower() },
  { id: "seed_groundnut", group: "seed", name: "Groundnut", kn: "ಶೇಂಗಾ", hint: "S3 · peanut pod", candidate: true, inner: `<g transform="rotate(30 24 24)"><path d="M24 4c6 0 9.5 4 9.5 9.5 0 3.2-2.2 5.4-3.5 7.5 1.3 2.1 3.5 4.3 3.5 7.5C33.5 34 30 44 24 44s-9.5-4-9.5-9.5c0-3.200 2.2-5.4 3.5-7.5-1.3-2.1-3.5-4.3-3.5-7.5C14.500 8 18 4 24 4z"/><path d="M20 12h.01M26 14h.01M22 17h.01M25 33h.01M21 36h.01M27 38h.01M20 31h.01" stroke-width="2"/></g>` },
  { id: "seed_scattered", group: "seed", name: "Loose seeds", kn: "ಚೆಲ್ಲಿದ ಬೀಜ", hint: "S4", candidate: true, inner: `${oval(14, 15, -30, 4, 2.3)}${oval(30, 13, 20, 4, 2.3)}${oval(22, 26, -10, 4, 2.3)}${oval(36, 28, 40, 4, 2.3)}${oval(13, 36, 25, 4, 2.3)}${oval(28, 38, -25, 4, 2.3)}` },
  { id: "seed_sack", group: "seed", name: "Seed sack", kn: "ಬೀಜದ ಚೀಲ", hint: "S5 · sack with seeds", candidate: true, inner: `<path d="M12 22h24l2 4v14a3 3 0 01-3 3H13a3 3 0 01-3-3V26z"/><path d="M10 26h28M13 31h22M13 36h22M18 28v14M24 28v14M30 28v14" stroke-width="1.1"/>${oval(18, 17, -20)}${oval(24, 15, 10)}${oval(30, 17, 25)}${oval(21, 20, 40)}${oval(27, 20, -35)}` },
  { id: "seed_small", group: "seed", name: "Small seeds", kn: "ಸಣ್ಣ ಬೀಜ", hint: "S6 · mustard, sesame", candidate: true, inner: `<circle cx="14" cy="14" r="3"/><circle cx="26" cy="11" r="2.4"/><circle cx="36" cy="18" r="3"/><circle cx="20" cy="24" r="3.2"/><circle cx="32" cy="30" r="2.6"/><circle cx="12" cy="34" r="2.6"/><circle cx="24" cy="38" r="3"/><circle cx="38" cy="40" r="2"/>` },
  { id: "seed_sprout", group: "seed", name: "Seedling", kn: "ಸಸಿ", hint: "S7", candidate: true, inner: `<path d="M24 41V25M24 29c-9 0-13-4-13-11 9 0 13 4 13 11zM24 24c0-7 4-11 13-11 0 7-4 11-13 11z"/>` },
  // oil
  { id: "oil_drop", group: "oil", name: "Oil", kn: "ಎಣ್ಣೆ", inner: `<path d="M24 6s12 13 12 22a12 12 0 01-24 0c0-9 12-22 12-22z"/>` },
  { id: "oil_drop_full", group: "oil", name: "Oil, filled", kn: "ಎಣ್ಣೆ", inner: `<path d="M24 6s12 13 12 22a12 12 0 01-24 0c0-9 12-22 12-22z" fill="${OIL}" fill-opacity=".9"/>` },
  // khali
  { id: "khali_disc", group: "khali", name: "Khali", kn: "ಹಿಂಡಿ", hint: "Round disc with dots — final", inner: KHALI },
  // cans
  { id: "tin15_empty", group: "cans", name: "15 kg tin, empty", kn: "೧೫ ಕೆಜಿ ಟಿನ್ ಖಾಲಿ", hint: "Top handle, wide window", inner: can("mi-tin15-e", "tin", 0, 0) },
  { id: "tin15_full", group: "cans", name: "15 kg tin, full", kn: "೧೫ ಕೆಜಿ ಟಿನ್ ತುಂಬಿದ", inner: can("mi-tin15-f", "tin", 1, 0) },
  { id: "jerry5_empty", group: "cans", name: "5 kg can, empty", kn: "೫ ಕೆಜಿ ಡಬ್ಬ ಖಾಲಿ", inner: can("mi-j5-e", "jerry", 0, 0) },
  { id: "jerry5_full", group: "cans", name: "5 kg can, full", kn: "೫ ಕೆಜಿ ಡಬ್ಬ ತುಂಬಿದ", hint: "Whole can filled with oil", inner: can("mi-j5-f", "jerry", 1, 0) },
  { id: "jerry5_old_empty", group: "cans", name: "5 kg can, old, empty", kn: "೫ ಕೆಜಿ ಹಳೆಯ ಖಾಲಿ", hint: "Dull, rusty, dented", inner: can("mi-j5o-e", "jerry", 0, 1) },
  { id: "jerry5_old_full", group: "cans", name: "5 kg can, old, full", kn: "೫ ಕೆಜಿ ಹಳೆಯ ತುಂಬಿದ", inner: can("mi-j5o-f", "jerry", 1, 1) },
  { id: "sediment_empty", group: "cans", name: "Sediment can, empty", kn: "ಕೆಸರಿನ ಡಬ್ಬ ಖಾಲಿ", hint: "Very old crusty can", inner: can("mi-sed-e", "jerry", 0, 3, true) },
  { id: "sediment_full", group: "cans", name: "Sediment can, with sludge", kn: "ಕೆಸರಿನ ಡಬ್ಬ", inner: can("mi-sed-f", "jerry", 1, 3, true) },
  // barrels
  { id: "barrel_empty", group: "barrels", name: "Barrel, empty", kn: "ಬ್ಯಾರೆಲ್ ಖಾಲಿ", inner: barrel("mi-b0", 0) },
  { id: "barrel_half", group: "barrels", name: "Barrel, half", kn: "ಬ್ಯಾರೆಲ್ ಅರ್ಧ", inner: barrel("mi-b5", 0.5) },
  { id: "barrel_full", group: "barrels", name: "Barrel, full", kn: "ಬ್ಯಾರೆಲ್ ತುಂಬಿದ", inner: barrel("mi-b1", 1) },
  // plain symbols for group headers and badges (24-box paths drawn in 48 space)
  { id: "person", group: "badges", name: "Person", kn: "ವ್ಯಕ್ತಿ", inner: `<circle cx="24" cy="16" r="7.2"/><path d="M10 40c0-7.2 6-12 14-12s14 4.8 14 12"/>` },
  { id: "factory", group: "badges", name: "Factory, production", kn: "ಗಿರಣಿ", inner: `<path d="M6 42V20l12 6V20l12 6V10h10v32z"/><path d="M14 34h2M24 34h2M34 34h2"/>` },
  { id: "arrow_in", group: "badges", name: "In (comes to us)", kn: "ಒಳಗೆ", inner: `<path d="M24 8v32M12 28l12 12 12-12"/>` },
  { id: "arrow_out", group: "badges", name: "Out (goes from us)", kn: "ಹೊರಗೆ", inner: `<path d="M24 40V8M12 20L24 8l12 12"/>` },
  { id: "spark", group: "badges", name: "New", kn: "ಹೊಸ", inner: `<path d="M24 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/>` },
  { id: "clock", group: "badges", name: "Old", kn: "ಹಳೆಯ", inner: `<circle cx="24" cy="24" r="18"/><path d="M24 14v10l6 4"/>` },
  { id: "tempo", group: "badges", name: "Tempo / auto, advance", kn: "ಟೆಂಪೋ", hint: "Tempo advance on a job", inner: `<g transform="scale(2)" stroke-width="1"><path d="M2 16V9l4-4h8l3 4h4v7"/><path d="M6 9h8"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></g>` },
  { id: "rupee", group: "badges", name: "Rupee, cash", kn: "ರೂಪಾಯಿ", inner: `<path d="M14 10h20M14 18h20M14 10c10 0 14 3 14 8s-4 8-14 8l14 12"/>` },
  { id: "grid", group: "badges", name: "Other", kn: "ಇತರೆ", inner: `<rect x="8" y="8" width="14" height="14" rx="3"/><rect x="26" y="8" width="14" height="14" rx="3"/><rect x="8" y="26" width="14" height="14" rx="3"/><rect x="26" y="26" width="14" height="14" rx="3"/>` },
];

export type BadgeId = "person" | "factory" | "in" | "out" | "new" | "old";
const BADGES: Record<BadgeId, { color: string; icon: string }> = {
  person: { color: "#5F82D4", icon: "person" },
  factory: { color: "#C98A25", icon: "factory" },
  in: { color: "#3F9D63", icon: "arrow_in" },
  out: { color: "#E5604A", icon: "arrow_out" },
  new: { color: "#3F9D63", icon: "spark" },
  old: { color: "#C98A25", icon: "clock" },
};

/** The weighing tiles: a base icon + a small round badge. Same names as the Mill Desk. */
export interface ComboDef { id: string; name: string; kn: string; base: string; badge?: BadgeId; hint?: string }
export const COMBOS: ComboDef[] = [
  { id: "jw_seed", name: "Job work · Seed", kn: "ಬೀಜ", base: "seed", badge: "person", hint: "Customer brings seed" },
  { id: "jw_oil", name: "Job work · Oil", kn: "ಎಣ್ಣೆ", base: "oil_drop", badge: "person" },
  { id: "jw_khali", name: "Job work · Khali", kn: "ಹಿಂಡಿ", base: "khali_disc", badge: "person" },
  { id: "mill_seed", name: "Our mill · Seed", kn: "ಬೀಜ", base: "seed", badge: "factory", hint: "To the expeller" },
  { id: "mill_oil", name: "Our mill · Oil", kn: "ಎಣ್ಣೆ", base: "oil_drop", badge: "factory" },
  { id: "mill_khali", name: "Our mill · Khali", kn: "ಹಿಂಡಿ", base: "khali_disc", badge: "factory" },
  { id: "buy_seed", name: "Seed buy", kn: "ಬೀಜ ಖರೀದಿ", base: "seed", badge: "in" },
  { id: "buy_khali", name: "Khali buy", kn: "ಹಿಂಡಿ ಖರೀದಿ", base: "khali_disc", badge: "in" },
  { id: "buy_oil", name: "Oil buy", kn: "ಎಣ್ಣೆ ಖರೀದಿ", base: "oil_drop", badge: "in" },
  { id: "sell_oil", name: "Oil sell", kn: "ಎಣ್ಣೆ ಮಾರಾಟ", base: "oil_drop", badge: "out" },
  { id: "sell_khali", name: "Khali sell", kn: "ಹಿಂಡಿ ಮಾರಾಟ", base: "khali_disc", badge: "out" },
  { id: "can15", name: "15 kg tin", kn: "೧೫ ಕೆಜಿ ಟಿನ್", base: "tin15_full" },
  { id: "can5_new", name: "5 kg can, new", kn: "೫ ಕೆಜಿ ಹೊಸ", base: "jerry5_full", badge: "new" },
  { id: "can5_old", name: "5 kg can, old", kn: "೫ ಕೆಜಿ ಹಳೆಯ", base: "jerry5_old_full", badge: "old" },
  { id: "barrel_in", name: "Barrel full (from supplier)", kn: "ಬ್ಯಾರೆಲ್ ತುಂಬಿದ", base: "barrel_full", badge: "in" },
  { id: "barrel_weigh_empty", name: "Barrel empty", kn: "ಬ್ಯಾರೆಲ್ ಖಾಲಿ", base: "barrel_empty" },
  { id: "barrel_out", name: "Barrel out", kn: "ಬ್ಯಾರೆಲ್ ಹೊರಗೆ", base: "barrel_full", badge: "out" },
  { id: "sediment", name: "Sediment", kn: "ಕೆಸರು", base: "sediment_full" },
];

const BY_ID = new Map(ICONS.map((i) => [i.id, i]));
const COMBO_BY_ID = new Map(COMBOS.map((c) => [c.id, c]));

/** Group headers reuse badge icons. */
export const GROUP_HEADER_ICONS: { id: string; name: string; kn: string; base: string }[] = [
  { id: "hdr_jobwork", name: "Job work · customer", kn: "ಕೂಲಿ ಕೆಲಸ", base: "person" },
  { id: "hdr_mill", name: "Our mill · production", kn: "ನಮ್ಮ ಗಿರಣಿ", base: "factory" },
  { id: "hdr_buysell", name: "Buy / Sell", kn: "ಖರೀದಿ / ಮಾರಾಟ", base: "rupee" },
  { id: "hdr_other", name: "Other", kn: "ಇತರೆ", base: "grid" },
];

/** Every id the library knows, for pickers and validation. */
export function allIconIds(): string[] {
  return [...ICONS.map((i) => i.id), ...COMBOS.map((c) => c.id), ...GROUP_HEADER_ICONS.map((g) => g.id)];
}

export function iconInner(id: string): string | null {
  const direct = BY_ID.get(id);
  if (direct) return direct.inner;
  const hdr = GROUP_HEADER_ICONS.find((g) => g.id === id);
  if (hdr) return BY_ID.get(hdr.base)?.inner ?? null;
  const combo = COMBO_BY_ID.get(id);
  if (!combo) return null;
  const base = BY_ID.get(combo.base);
  if (!base) return null;
  if (!combo.badge) return base.inner;
  const b = BADGES[combo.badge];
  const glyph = BY_ID.get(b.icon)?.inner ?? "";
  // base drawn a little smaller to leave room; badge bottom-right with a white glyph
  return `<g transform="translate(2 1) scale(.9)">${base.inner}</g><circle cx="38" cy="38" r="9" fill="${b.color}" stroke="none"/><g transform="translate(30.5 30.5) scale(.31)" stroke="#fff" stroke-width="6" fill="none">${glyph}</g>`;
}

/** A complete <svg> string for an icon id, or "" if unknown. color applies to the outline. */
export function millIconSvg(id: string, size = 40, color = "currentColor"): string {
  const inner = iconInner(id);
  if (inner == null) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${id}">${inner}</svg>`;
}

/** A small data: URL for a Quick-links tile picture (outline drawn in a dark neutral so it shows on any tile). */
export function millIconDataUrl(id: string, color = "#e5e7eb"): string {
  const svg = millIconSvg(id, 96, color);
  return svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : "";
}

export interface IconRow { id: string; name: string; kn: string; hint?: string; group: IconGroupId; candidate?: boolean }

/** Everything for the gallery, in group order. */
export function iconRows(): IconRow[] {
  const tiles: IconRow[] = [
    ...COMBOS.map((c) => ({ id: c.id, name: c.name, kn: c.kn, hint: c.hint, group: "tiles" as const })),
  ];
  const headers: IconRow[] = GROUP_HEADER_ICONS.map((g) => ({ id: g.id, name: g.name, kn: g.kn, group: "groups" as const }));
  const rest: IconRow[] = ICONS.map((i) => ({ id: i.id, name: i.name, kn: i.kn, hint: i.hint, group: i.group, candidate: i.candidate }));
  return [...tiles, ...rest, ...headers];
}

/** Search by id, English or Kannada name. */
export function searchIcons(rows: IconRow[], q: string): IconRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => r.id.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.kn.includes(q.trim()) || (r.hint || "").toLowerCase().includes(s));
}
