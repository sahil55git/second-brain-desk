// "More windows" arrangement of the Quick Register Cash sheet: which cards the person hid and the
// link cards they added. Kept on the device only, so it is read defensively.
export interface CustomCard {
  id: string;
  icon: string;
  title: string;
  href: string;
}
export interface MoreState {
  hidden: string[];
  custom: CustomCard[];
  collapsed: boolean;
}
export const MORE_KEY = "qr-more-v1";
export const EMPTY_MORE: MoreState = { hidden: [], custom: [], collapsed: false };

/** Own cards may only point to a page of this app or an https address. */
export function safeHref(h: string): boolean {
  const s = h.trim();
  return (s.startsWith("/") && !s.startsWith("//")) || /^https:\/\//i.test(s);
}

/** Reads the saved arrangement; anything odd falls back to the default. */
export function normalizeMore(raw: unknown): MoreState {
  if (!raw || typeof raw !== "object") return EMPTY_MORE;
  const r = raw as Partial<MoreState>;
  const str = (v: unknown): v is string => typeof v === "string";
  return {
    hidden: Array.isArray(r.hidden) ? r.hidden.filter(str) : [],
    custom: Array.isArray(r.custom)
      ? r.custom
          .filter((c): c is CustomCard => !!c && str(c.id) && str(c.title) && str(c.href) && safeHref(c.href))
          .map((c) => ({ id: c.id, icon: str(c.icon) && c.icon ? c.icon : "🔗", title: c.title.slice(0, 40), href: c.href.trim() }))
      : [],
    collapsed: r.collapsed === true,
  };
}
