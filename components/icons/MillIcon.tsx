// <MillIcon id="barrel_full" size={32} /> — draws any icon from the icon library (lib/millIcons.ts).
// <TileGlyph v="mi:oil_drop" /> — a Quick-links tile icon value: "mi:<id>" is a library icon, anything else is text/emoji.
import { millIconSvg } from "@/lib/millIcons";

export default function MillIcon({ id, size = 32, color = "currentColor", className }: { id: string; size?: number; color?: string; className?: string }) {
  const svg = millIconSvg(id, size, color);
  if (!svg) return null;
  return <span className={className} style={{ display: "inline-flex", lineHeight: 0, flex: "none" }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function TileGlyph({ v, size = 30 }: { v: string; size?: number }) {
  if (v.startsWith("mi:")) return <MillIcon id={v.slice(3)} size={size} />;
  return <>{v}</>;
}
