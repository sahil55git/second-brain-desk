// Draws a Code 128 barcode as inline SVG (works on screen and when printed).
import { code128Ok, code128Svg } from "@/lib/code128";

export default function Barcode({ value, moduleWidth = 2, height = 56, className }: { value: string; moduleWidth?: number; height?: number; className?: string }) {
  if (!code128Ok(value)) return <span className="bd-err">Cannot draw barcode</span>;
  const { svg } = code128Svg(value, { moduleWidth, height });
  // The SVG is built by our own encoder from a validated string, never from user HTML.
  return <span className={className} style={{ display: "inline-block", lineHeight: 0, maxWidth: "100%" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="max-width:100%;height:auto" ') }} />;
}
