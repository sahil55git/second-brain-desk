"use client";

// Print centre (/print): everything about printing in one place. The printers of this device (saved and
// found right now), the label and receipt designer, and a tile for every page that prints something,
// shown only when this person may open that page.
import { useState } from "react";
import { useAccess } from "@/components/AccessProvider";
import PrintersCard from "@/components/hub/PrintersCard";
import type { PageKey } from "@/lib/access";

interface Tile {
  icon: string;
  title: string;
  desc: string;
  href: string;
  /** any of these pages lets the person open it; none = everyone */
  need?: PageKey[];
  ownerOnly?: boolean;
}

const DESIGN: Tile[] = [
  { icon: "🎨", title: "Label designer", desc: "Barrel labels: text, Kannada, barcode, QR, logo, tare & date", href: "/barrels/fleet/designer?kind=label", need: ["mfg", "stock"] },
  { icon: "🧾", title: "Receipt / slip designer", desc: "Weighing slips and receipts for the roll printer", href: "/barrels/fleet/designer?kind=slip", need: ["mfg", "stock"] },
  { icon: "⚙️", title: "Printer setup", desc: "Connect, test and save a label or receipt printer", href: "/barrels/fleet/printers", need: ["mfg", "stock"] },
];

const GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: "Labels",
    tiles: [
      { icon: "🛢️", title: "Our barrel labels", desc: "Permanent label for every barrel (or pick some)", href: "/barrels/fleet/labels?codes=all", need: ["mfg", "stock"] },
      { icon: "📥", title: "Receiving lot labels", desc: "Labels for a lot of barrels that came in", href: "/barrels", need: ["mfg", "stock"] },
      { icon: "🏷️", title: "Item labels", desc: "Barcode stickers for tins, bottles, packs", href: "/labels", need: ["mfg", "stock"] },
    ],
  },
  {
    title: "Slips & receipts",
    tiles: [
      { icon: "⚖️", title: "Barrel weighing slip", desc: "Open a barrel → Weigh → print its slip", href: "/barrels/fleet", need: ["mfg", "stock"] },
      { icon: "🧾", title: "Receiving weighment slip", desc: "Slip for a receiving lot", href: "/barrels", need: ["mfg", "stock"] },
    ],
  },
  {
    title: "Day books & reports",
    tiles: [
      { icon: "📒", title: "Today's register", desc: "Quick Register → summary → Print", href: "/register", need: ["register"] },
      { icon: "💵", title: "Cash tally", desc: "Count and closing, print or save PDF", href: "/cash", need: ["register"] },
      { icon: "💰", title: "Sales", desc: "Sales list and bills", href: "/sales", need: ["sales"] },
      { icon: "📊", title: "Reports", desc: "Sales, stock, udhar, cash reports", href: "/reports", ownerOnly: true },
    ],
  },
];

export default function PrintCentre() {
  const acc = useAccess();
  const [note, setNote] = useState("");
  const may = (t: Tile) => (t.ownerOnly ? acc.isOwner : !t.need || acc.isOwner || t.need.some((k) => acc.page(k)));
  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 3000);
  };
  const tile = (t: Tile) => (
    <a key={t.href + t.title} className="pc-tile" href={t.href}>
      <span className="ic" aria-hidden>{t.icon}</span>
      <span className="t">{t.title}</span>
      <span className="d">{t.desc}</span>
    </a>
  );
  const design = DESIGN.filter(may);
  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🖨️ Print centre</h1>
          <div className="hub-m">Your printers on this device, the label designer, and every page that prints. Press Print on any page: it uses the printer you used last.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/go">🔗 Quick links</a>
          <a className="hub-btn" href="/">🏠 Home</a>
        </nav>
      </header>
      {note && <div className="hub-banner" role="status">{note}</div>}
      <div className="hub-grid2">
        <PrintersCard flash={flash} />
        {design.length > 0 && (
          <section className="hub-card">
            <h3>🎨 Design and set up</h3>
            <div className="pc-grid" style={{ marginTop: 10 }}>{design.map(tile)}</div>
            <div className="hub-m small" style={{ marginTop: 10 }}>
              A layout saved in the designer is used by every phone, tablet and PC. The printer is chosen per device: each device remembers the one it printed with last.
            </div>
          </section>
        )}
      </div>
      {GROUPS.map((g) => {
        const list = g.tiles.filter(may);
        if (!list.length) return null;
        return (
          <section key={g.title} className="hub-card">
            <h3>{g.title}</h3>
            <div className="pc-grid" style={{ marginTop: 10 }}>{list.map(tile)}</div>
          </section>
        );
      })}
    </div>
  );
}
