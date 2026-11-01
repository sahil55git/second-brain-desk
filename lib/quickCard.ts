// The Quick card (/quick): swipe cards for a phone or tablet window kept open beside another app
// (Android split screen, Samsung pop-up view, a home-screen shortcut). Which cards show, in what
// order, how big and how see-through, saved on this device. Pure, tested.
export type CardId = "entry" | "today" | "barrels" | "search" | "tiles";
export type CardSize = "s" | "m" | "l";
export type CardStyle = "solid" | "glass" | "outline";
export interface QuickCardPrefs {
  cards: CardId[];
  size: CardSize;
  style: CardStyle;
  /** 0.3 – 1 */
  opacity: number;
  /** cards side by side (swipe) or one under the other (scroll) */
  layout: "swipe" | "list";
}
export const QUICK_CARD_KEY = "sbd_quick_v1";
export const ALL_CARDS: { id: CardId; name: string; icon: string }[] = [
  { id: "entry", name: "Quick entry", icon: "➕" },
  { id: "today", name: "Today", icon: "📊" },
  { id: "barrels", name: "Barrels", icon: "🛢️" },
  { id: "search", name: "Search", icon: "🔍" },
  { id: "tiles", name: "My tiles", icon: "⭐" },
];
export const DEFAULT_QUICK_CARD: QuickCardPrefs = { cards: ["entry", "today", "barrels", "search", "tiles"], size: "m", style: "solid", opacity: 1, layout: "swipe" };

export function cleanQuickCard(raw: unknown): QuickCardPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = ALL_CARDS.map((c) => c.id);
  const cards = Array.isArray(r.cards) ? (r.cards.filter((c, i, a) => ids.includes(c as CardId) && a.indexOf(c) === i) as CardId[]) : DEFAULT_QUICK_CARD.cards;
  const op = Number(r.opacity);
  return {
    cards: cards.length ? cards : DEFAULT_QUICK_CARD.cards,
    size: r.size === "s" || r.size === "l" ? r.size : "m",
    style: r.style === "glass" || r.style === "outline" ? r.style : "solid",
    opacity: Number.isFinite(op) ? Math.max(0.3, Math.min(1, op)) : 1,
    layout: r.layout === "list" ? "list" : "swipe",
  };
}

/** Move a card one place left (-1) or right (+1). */
export function moveCard(p: QuickCardPrefs, id: CardId, dir: -1 | 1): QuickCardPrefs {
  const i = p.cards.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.cards.length) return p;
  const cards = [...p.cards];
  [cards[i], cards[j]] = [cards[j], cards[i]];
  return { ...p, cards };
}
