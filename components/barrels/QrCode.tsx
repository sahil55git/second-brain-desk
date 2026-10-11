// Draws a QR code as inline SVG (works on screen and when printed).
import { qrSvg } from "@/lib/qr";

export default function QrCode({ value, moduleSize = 4, className }: { value: string; moduleSize?: number; className?: string }) {
  let svg = "";
  try {
    svg = qrSvg(value, { moduleSize }).svg;
  } catch {
    return <span className="bd-err">Cannot draw QR</span>;
  }
  // Built by our own encoder from a validated string, never from user HTML.
  return <span className={className} style={{ display: "inline-block", lineHeight: 0, maxWidth: "100%" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="max-width:100%;height:auto" ') }} />;
}
