"use client";

// "🖨️ Print" for a list, ledger or report: prints only the part of the page given by `area` (a CSS
// selector), on A4 unless told otherwise, through the browser's print window (pick the printer there,
// or "Save as PDF"). Buttons and anything marked .pa-hide inside the area are left out.
import "./print.css";
import ShareButton from "@/components/share/ShareButton";

export function printArea(area?: string, paper: "a4" | "a4-landscape" | "auto" = "a4") {
  const el = area ? document.querySelector<HTMLElement>(area) : null;
  const html = document.documentElement;
  const style = document.createElement("style");
  style.textContent = paper === "auto" ? "" : `@page { size: A4${paper === "a4-landscape" ? " landscape" : ""}; margin: 10mm }`;
  document.head.appendChild(style);
  if (el) {
    el.setAttribute("data-print-area", "");
    html.classList.add("pa-scope");
  }
  let cleaned = false;
  const done = () => {
    if (cleaned) return;
    cleaned = true;
    el?.removeAttribute("data-print-area");
    html.classList.remove("pa-scope");
    style.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // phones return from print() at once and send afterprint later; keep the scope for a while for them
  setTimeout(done, 60_000);
}

export default function PrintButton({
  area,
  paper = "a4",
  label = "🖨️ Print",
  className = "hub-btn",
  title = "Print or save as PDF",
  disabled,
  share = true,
}: {
  area?: string;
  paper?: "a4" | "a4-landscape" | "auto";
  label?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  /** also show 📤 Share next to it (WhatsApp, email, picture, Excel...) */
  share?: boolean;
}) {
  // "🖨️ Print sales list" → "Sales list"
  const what = label.replace(/^[^A-Za-z0-9]*Print\s*/i, "").trim();
  return (
    <>
      <button type="button" className={`${className} pa-btn`} title={title} disabled={disabled} onClick={() => printArea(area, paper)}>
        {label}
      </button>
      {share && <ShareButton area={area} className={className} title={what ? what.charAt(0).toUpperCase() + what.slice(1) : undefined} />}
    </>
  );
}
