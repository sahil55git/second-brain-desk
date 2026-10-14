// Draws a Code 128 barcode as inline SVG (works on screen and when printed).
import { code128Ok, code128Svg } from "@/lib/code128";

export default function Barcode({ value, moduleWidth = 2, height = 56, className, fill }: { value: string; moduleWidth?: number; height?: number; className?: string; fill?: boolean }) {
  if (!code128Ok(value)) return <span className="bd-err">Cannot draw barcode</span>;
  const { svg } = code128Svg(value, { moduleWidth, height });
  // The SVG is built by our own encoder from a validated string, never from user HTML.
  // fill: stretch to the box the CSS gives the wrapper (small stickers need an exact bar height)
  if (fill) return <span className={`${className ?? ""} fill`} style={{ display: "block", lineHeight: 0, width: "100%" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg preserveAspectRatio="none" style="width:100%;height:100%" ') }} />;
  return <span className={className} style={{ display: "inline-block", lineHeight: 0, maxWidth: "100%" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="max-width:100%;height:auto" ') }} />;
}
