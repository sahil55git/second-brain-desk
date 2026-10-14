// Per-barrel print buttons under a weight cell: a sticker label and a one-weighing receipt.
export default function RowPrint({ lotQ, seq, code, phase, done, className }: { lotQ: string; seq: number; code: string; phase: "GROSS" | "EMPTY"; done: boolean; className?: string }) {
  const t = phase === "GROSS" ? "full" : "empty";
  return (
    <div className={`bd-rowact${className ? ` ${className}` : ""}`} onClick={(e) => e.stopPropagation()}>
      <a className="bd-pbtn" href={`/barrels/labels?lot=${lotQ}&seq=${seq}&type=${t}`} target="_blank" rel="noreferrer" title={done ? "Print the sticker label with this weight" : "Print the sticker label now; the weight line is left blank to write on"}>🏷️ Label</a>
      {done ? (
        <a className="bd-pbtn" href={`/barrels/print?slip=${encodeURIComponent(code)}&phase=${phase}`} target="_blank" rel="noreferrer" title="Print a receipt for this weighing only">🧾 Receipt</a>
      ) : (
        <span className="bd-pbtn off" title="Weigh first, then print the receipt">🧾 Receipt</span>
      )}
    </div>
  );
}
