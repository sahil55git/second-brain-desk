// Turns a picture the owner picks (a photo of the logo, a PNG, a JPEG) into a small, printer-friendly PNG data: URL.
// Thermal printers print black dots only, so by default the picture becomes black on white.
import { LIMITS } from "@/lib/labelTemplate";

export interface LogoOpts {
  /** longest side in pixels (203 dpi: 8 px per mm) */
  maxPx?: number;
  blackWhite?: boolean;
  /** 0–255: darker than this prints black */
  threshold?: number;
}

function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("That file is not a picture this browser can open. Use a PNG or JPEG."));
    };
    img.src = url;
  });
}

export async function fileToLogo(file: File, o: LogoOpts = {}): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error("Choose a PNG or JPEG picture.");
  const img = await loadImg(file);
  let max = o.maxPx ?? 480;
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser cannot prepare the picture.");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    if (o.blackWhite !== false) {
      const d = g.getImageData(0, 0, w, h);
      const t = o.threshold ?? 170;
      for (let i = 0; i < d.data.length; i += 4) {
        const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        const v = lum < t ? 0 : 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
    }
    const url = c.toDataURL("image/png");
    if (url.length <= LIMITS.maxImageChars - 2000) return url;
    max = Math.round(max * 0.75);
  }
  throw new Error("The picture is too detailed to store. Use a simpler logo.");
}
