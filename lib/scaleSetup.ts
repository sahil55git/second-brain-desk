// One place for "take me to the scale set-up / Live scales page". Every Set up scale button in
// the app links here, so it opens the page straight away (not the Home desk tabs) and a Back
// link returns to where the person was.
export const SCALES_PATH = "/scales";

/** Only a page of this site: starts with one "/", no scheme, no "//", not too long. */
export function safeBack(b: string | null | undefined): string {
  const s = (b || "").trim();
  if (!s || s.length > 200 || !s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /^\/+[a-z][a-z0-9+.-]*:/i.test(s)) return "/";
  if (s === SCALES_PATH || s.startsWith(SCALES_PATH + "?") || s.startsWith(SCALES_PATH + "/")) return "/";
  return s;
}

/** The link for a Set up scale button; `back` is the page to come back to. */
export function scaleSetupHref(back?: string): string {
  const b = back ? safeBack(back) : "";
  return b && b !== "/" ? `${SCALES_PATH}?back=${encodeURIComponent(b)}` : SCALES_PATH;
}
