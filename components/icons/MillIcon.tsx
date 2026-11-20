// <MillIcon id="barrel_full" size={32} /> — draws any icon from the icon library (lib/millIcons.ts)
// or one Sahil uploaded (id "my_…", lib/customIcons.ts).
// <TileGlyph v="mi:oil_drop" /> — a Quick-links tile icon value: "mi:<id>" is a library icon, anything else is text/emoji.
"use client";
import { useEffect, useSyncExternalStore } from "react";
import { millIconSvg } from "@/lib/millIcons";
import { customIconsSnapshot, findCustomIcon, isCustomId, loadCustomIcons, subscribeCustomIcons } from "@/lib/customIcons";

export default function MillIcon({ id, size = 32, color = "currentColor", className }: { id: string; size?: number; color?: string; className?: string }) {
  useSyncExternalStore(subscribeCustomIcons, customIconsSnapshot, customIconsSnapshot);
  const custom = isCustomId(id);
  useEffect(() => { if (custom) void loadCustomIcons(); }, [custom]);
  if (custom) {
    const c = findCustomIcon(id);
    // eslint-disable-next-line @next/next/no-img-element
    return c ? <img src={c.dataUrl} alt={c.name} width={size} height={size} className={className} style={{ objectFit: "contain", flex: "none" }} /> : <span style={{ width: size, height: size, display: "inline-block" }} />;
  }
  const svg = millIconSvg(id, size, color);
  if (!svg) return null;
  return <span className={className} style={{ display: "inline-flex", lineHeight: 0, flex: "none" }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function TileGlyph({ v, size = 30 }: { v: string; size?: number }) {
  if (v.startsWith("mi:")) return <MillIcon id={v.slice(3)} size={size} />;
  return <>{v}</>;
}
