// "Search the app": find any page or entry form by English or Kannada words. Pure, tested in
// lib/__tests__/navSearch.test.ts; used by the search box in the top bar of every page.
import { GROUP_META, visibleLinks, type QuickLink } from "@/lib/quickLinks";

export interface NavHit {
  id: string;
  icon: string;
  title: string;
  kn: string;
  sub: string;
  href: string;
}

const EXTRA: QuickLink[] = [
  { id: "home", icon: "🏠", title: "Home", kn: "ಮನೆ", desc: "Today at a glance", href: "/", group: "office" },
  { id: "golinks", icon: "🔗", title: "Quick links", kn: "ತ್ವರಿತ ಲಿಂಕ್", desc: "Every tile", href: "/go", group: "office" },
  { id: "appearance", icon: "🎨", title: "Appearance / theme", kn: "ಥೀಮ್", desc: "Colours, dark mode, glass, matte", href: "/appearance", group: "office" },
];

// keep letters (any script), digits and Kannada marks; everything else becomes a space
const norm = (s: string) => s.toLowerCase().replace(/[!-/:-@[-`{-~₹·…—–]/g, " ").replace(/\s+/g, " ").trim();

/** Best matches first: a title that starts with the words, then a title that has them, then anything else that has them. */
export function navSearch(q: string, isOwner: boolean, limit = 12): NavHit[] {
  const n = norm(q);
  const all = [...visibleLinks(isOwner), ...EXTRA.filter((e) => !visibleLinks(isOwner).some((l) => l.href === e.href))];
  const words = n.split(" ").filter(Boolean);
  const scored: { l: QuickLink; s: number }[] = [];
  for (const l of all) {
    const t = norm(l.title);
    const hay = `${t} ${norm(l.kn)} ${norm(l.desc)} ${norm(GROUP_META[l.group].title)} ${l.id}`;
    if (!words.length) {
      scored.push({ l, s: 0 });
      continue;
    }
    if (!words.every((w) => hay.includes(w))) continue;
    const s = t.startsWith(n) ? 3 : words.every((w) => t.includes(w)) ? 2 : 1;
    scored.push({ l, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const seen = new Set<string>();
  const out: NavHit[] = [];
  for (const { l } of scored) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push({ id: l.id, icon: l.icon, title: l.title, kn: l.kn, sub: l.desc, href: l.href });
    if (out.length >= limit) break;
  }
  return out;
}
