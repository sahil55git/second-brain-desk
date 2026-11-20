/**
 * Browser print for the Mill Desk papers. `window.print()` inside the desk's iframe does nothing in the
 * Android app's WebView and is unreliable in mobile Chrome, so the desk hands the paper HTML to this page,
 * which prints it from a real window (or a hidden frame if pop-ups are blocked).
 */
export function buildPrintDoc(html: string, css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print</title><style>${css}
html,body{background:#fff!important;margin:0}#printarea{display:block!important;color:#000;background:#fff}
@media screen{#printarea .paper{margin:8px auto!important}}</style></head><body><div id="printarea">${html}</div></body></html>`;
}

export function printHtml(html: string, css: string): boolean {
  const doc = buildPrintDoc(html, css);
  const run = (w: Window) => {
    // wait for fonts/layout, then print
    const go = () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* the person can still use the browser's own print */
      }
    };
    if (w.document.readyState === "complete") setTimeout(go, 250);
    else w.addEventListener("load", () => setTimeout(go, 250));
  };
  try {
    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(doc);
      w.document.close();
      run(w);
      return true;
    }
  } catch {
    /* fall through to the hidden frame */
  }
  try {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.srcdoc = doc;
    f.onload = () => {
      setTimeout(() => {
        try {
          f.contentWindow?.focus();
          f.contentWindow?.print();
        } catch {
          /* ignore */
        }
        setTimeout(() => f.remove(), 60000);
      }, 250);
    };
    document.body.appendChild(f);
    return true;
  } catch {
    return false;
  }
}
