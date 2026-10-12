"use client";

// One glyph for the Quick Register: in the designed looks (any skin) an emoji
// becomes the matching line icon, tinted for oil / seed items; in the classic
// look the emoji stays exactly as before.
import { useCustomize } from "@/lib/customize";
import { EMOJI_ICON, EMOJI_TINT, Icon } from "@/components/ui/Icons";

export function useSkinned(): boolean {
  const { prefs } = useCustomize();
  return prefs.look.skin !== "none";
}

export function G({ e }: { e: string }) {
  const skinned = useSkinned();
  const name = EMOJI_ICON[e] || EMOJI_ICON[e.replace(/️/g, "")];
  if (!skinned || !name) return <>{e}</>;
  const tint = EMOJI_TINT[e];
  return (
    <span className={`g-ic${tint ? " tint" : ""}`} style={tint ? ({ "--g": tint } as React.CSSProperties) : undefined} aria-hidden>
      <Icon name={name} size={20} />
    </span>
  );
}
