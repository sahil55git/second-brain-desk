import { describe, expect, it } from "vitest";
import { cleanCfg, cleanDoc, explainPrintError, jobBytes, layoutDoc, MillPrintError, paginate, planJob, TEST_DOC, wrapText, labelCandidates, isBleName, type MillPrintDoc, type Op } from "@/lib/mill/millPrint";
import { mmToDots } from "@/lib/printerLang";

const measure = (t: string, px: number, bold: boolean) => t.length * px * (bold ? 0.62 : 0.55);

const slip: MillPrintDoc = {
  kind: "slip",
  code: "WS-0012",
  shop: "MAHADEV TRADERS",
  title: "Mill 1 · WEIGHT SLIP",
  when: "20 Nov 06:11 PM",
  rows: [["Customer seed · Customer no. 3 · 2 bags", "98.50 kg"], ["Our oil", "180.10 kg"]],
  foot: ["By Raju", "06:11 PM"],
};
const token: MillPrintDoc = {
  kind: "token",
  code: "JW-0012",
  shop: "MAHADEV TRADERS",
  title: "JOB-WORK TOKEN",
  sub: "Bidar · Mill 1",
  when: "20 Nov 06:11 PM",
  rows: [["Token no. (today)", "4"], ["Invoice no.", "#12"], "-", ["Customer", "Ramesh Patil"], ["Village", "Humnabad"], "-", ["Bag 1", "50.00 kg"], ["Bag 2", "48.50 kg"], ["Total seed", "98.5 kg · 2 bags"], ["Khali", "Shop keeps · ₹6/kg"], ["Customer advance", "₹500"]],
  total: ["Estimate", "₹ 1,250"],
  foot: ["By Raju", "20 Nov"],
  qr: true,
};

describe("what the desk sends", () => {
  it("is cleaned: limits, no line breaks, a code is needed", () => {
    expect(cleanDoc(null)).toBeNull();
    expect(cleanDoc({ rows: [] })).toBeNull();
    const d = cleanDoc({ code: "JW-1\n", rows: [["a\nb", "c"], "-", 5, ["x"]], kind: "token", title: "T".repeat(99), qr: true })!;
    expect(d.code).toBe("JW-1");
    expect(d.rows).toEqual([["a b", "c"], "-"]);
    expect(d.title).toHaveLength(40);
    expect(d.kind).toBe("token");
    expect(d.shop).toBe("MAHADEV TRADERS");
  });
  it("a bad saved printer is dropped, a good one is kept within limits", () => {
    expect(cleanCfg({ id: "usb:1" })).toBeNull();
    expect(cleanCfg({ id: "nbt:AA:BB", widthMm: 999, heightMm: 0, density: 99 })).toMatchObject({ widthMm: 108, heightMm: 0, density: 15, invert: true, gapMm: 3 });
  });
});

describe("layout", () => {
  it("wraps words by measured width and cuts a word that is too long", () => {
    expect(wrapText("one two three four", 100, 20, false, measure).length).toBeGreaterThan(1);
    expect(wrapText("x".repeat(60), 100, 20, false, measure).every((l) => measure(l, 20, false) <= 100)).toBe(true);
  });
  it("every row and the QR (not a barcode: phones scan it) are drawn, top to bottom, inside the width", () => {
    const w = 400;
    const { ops, height } = layoutDoc(token, w, measure);
    expect(ops.some((o) => o.t === "bars")).toBe(false);
    expect(ops.some((o) => o.t === "qr")).toBe(true);
    for (const o of ops) {
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y + o.h).toBeLessThanOrEqual(height);
      if (o.t === "bars") expect(o.x + o.modules.length * o.mod).toBeLessThanOrEqual(w);
      if (o.t === "qr") expect(o.x + o.matrix.length * o.mod).toBeLessThanOrEqual(w);
    }
    expect(ops.filter((o) => o.t === "text").map((o) => (o as Extract<Op, { t: "text" }>).text)).toContain("JW-0012");
    expect(layoutDoc(slip, w, measure).ops.some((o) => o.t === "qr")).toBe(true); // the weight slip has the QR too
    expect(layoutDoc({ ...slip, qr: false }, w, measure).ops.some((o) => o.t === "bars")).toBe(true); // barcode only when asked for
  });
  it("a row's amount sits on the right of its first line", () => {
    const t = layoutDoc(slip, 400, measure).ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.text === "98.50 kg")[0];
    expect(t.align).toBe("right");
    expect(t.x).toBeGreaterThan(300);
  });
});

describe("pages", () => {
  it("never cuts through a line: every page starts at 0 and fits", () => {
    const { ops } = layoutDoc(token, 400, measure);
    const pageDots = mmToDots(30);
    const pages = paginate(ops, pageDots);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p[0].y).toBeGreaterThanOrEqual(0);
      expect(Math.max(...p.map((o) => o.y + o.h))).toBeLessThanOrEqual(Math.max(pageDots, ...p.map((o) => o.h)));
    }
    expect(pages.flat()).toHaveLength(ops.length);
  });
  it("a short slip stays on one label; a long token shrinks a little before it is split", () => {
    expect(planJob(slip, { widthMm: 50, heightMm: 75 }, measure).pages).toHaveLength(1);
    const tall = planJob(token, { widthMm: 75, heightMm: 100 }, measure);
    expect(tall.pages).toHaveLength(1);
    const small = planJob(token, { widthMm: 50, heightMm: 75 }, measure);
    expect(small.scale).toBeLessThanOrEqual(1);
  });
  it("a continuous roll is one page as tall as the slip", () => {
    const p = planJob(token, { widthMm: 50, heightMm: 0 }, measure);
    expect(p.pages).toHaveLength(1);
    expect(p.pageDots[0]).toBeGreaterThan(400);
  });
});

describe("TSPL bytes", () => {
  const mono = (h: number) => ({ width: 400, height: h, rowBytes: 50, data: new Uint8Array(50 * h) });
  const txt = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
  it("one label: size, gap, darkness, a bitmap of the right size and the copies", () => {
    const s = txt(jobBytes([mono(600)], { widthMm: 50, heightMm: 75, gapMm: 3, density: 9, invert: true }, 2));
    expect(s).toContain("SIZE 50 mm,75 mm");
    expect(s).toContain("GAP 3 mm,0 mm");
    expect(s).toContain("DENSITY 9");
    expect(s).toContain("BITMAP 0,0,50,600,0,");
    expect(s).toContain("PRINT 2,1");
  });
  it("two pages are sent one after the other; a roll has no gap", () => {
    const two = txt(jobBytes([mono(240), mono(240)], { widthMm: 50, heightMm: 30, gapMm: 3, density: 8, invert: true }, 1));
    expect(two.match(/PRINT 1,1/g)).toHaveLength(2);
    const roll = txt(jobBytes([mono(500)], { widthMm: 50, heightMm: 0, gapMm: 3, density: 8, invert: true }, 1));
    expect(roll).toContain("GAP 0 mm,0 mm");
  });
  it("white paper is all 1s when inverted, so the printer prints nothing there", () => {
    const b = jobBytes([mono(8)], { widthMm: 50, heightMm: 75, gapMm: 3, density: 8, invert: true }, 1);
    const at = txt(b).indexOf("BITMAP 0,0,50,8,0,") + "BITMAP 0,0,50,8,0,".length;
    expect(b[at]).toBe(0xff);
  });
});

describe("words for the person", () => {
  it("each failure says what to do", () => {
    expect(explainPrintError(new MillPrintError("BT_OFF", "x")).fix).toBe("bt-on");
    expect(explainPrintError(new MillPrintError("NO_PRINTER", "x")).fix).toBe("setup");
    expect(explainPrintError(new MillPrintError("NOT_APP", "x")).fix).toBe("app");
    expect(explainPrintError(new MillPrintError("NO_ANSWER", "boom")).text).toMatch(/not answering/);
  });
  it("label printers such as the Helett come first in the list", () => {
    const l = labelCandidates([
      { id: "nbt:1", name: "POS-80", kind: "bluetooth", printer: true },
      { id: "nbt:2", name: "Helett H30C", kind: "bluetooth", printer: false },
      { id: "nusb:3", name: "USB", kind: "usb", printer: true },
    ]);
    expect(l.map((p) => p.name)).toEqual(["Helett H30C", "POS-80", "USB"]); // a USB cable printer is listed too
  });
  it("the low-energy twin of a printer goes last and is explained", () => {
    const l = labelCandidates([
      { id: "nbt:1", name: "H30C_F1BA_BLE", kind: "bluetooth", printer: false },
      { id: "nbt:2", name: "MPT-III", kind: "bluetooth", printer: true },
      { id: "nbt:3", name: "H30C_F1BA", kind: "bluetooth", printer: true },
    ]);
    expect(l.map((p) => p.name)).toEqual(["H30C_F1BA", "MPT-III", "H30C_F1BA_BLE"]);
    expect(isBleName("H30C_F1BA_BLE")).toBe(true);
    expect(isBleName("H30C_F1BA")).toBe(false);
    expect(explainPrintError(new MillPrintError("NO_ANSWER", "x"), "H30C_F1BA_BLE").text).toMatch(/without “_BLE”/);
  });
  it("a token with its QR stays on ONE 50x75 label instead of using two", () => {
    const plan = planJob(token, { widthMm: 50, heightMm: 75 }, measure);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].some((o) => o.t === "qr")).toBe(true);
    expect(plan.pages[0].some((o) => o.t === "bars")).toBe(false);
  });
  it("the test slip is a valid doc", () => {
    expect(cleanDoc(TEST_DOC)?.code).toBe("TEST-0001");
  });
});

describe("printing again by itself", () => {
  it("only a job that sent nothing is tried again (never a second copy)", async () => {
    const { safeToRetry, MillPrintError: E } = await import("@/lib/mill/millPrint");
    expect(safeToRetry(new E("NO_ANSWER", "x"))).toBe(true);
    expect(safeToRetry(new E("PARTIAL", "x"))).toBe(false);
    expect(safeToRetry(new E("PAPER_OUT", "x"))).toBe(false);
    expect(safeToRetry(new E("NOT_PAIRED", "x"))).toBe(false);
    expect(safeToRetry({ code: "NO_ANSWER" })).toBe(true);
  });
});

describe("receipt printer (MPT-III)", () => {
  it("knows a receipt printer by its name, and a label printer is not one", async () => {
    const { isReceiptName } = await import("@/lib/mill/millPrint");
    expect(isReceiptName("MPT-III")).toBe(true);
    expect(isReceiptName("POS-58")).toBe(true);
    expect(isReceiptName("RPP02N")).toBe(true);
    expect(isReceiptName("H30C_F1BA")).toBe(false);
    expect(isReceiptName("iScale i-20")).toBe(false);
  });
  it("prints the slip as ESC/POS raster pictures down the roll, once per copy", async () => {
    const { jobBytes } = await import("@/lib/mill/millPrint");
    const m = { width: 384, height: 50, rowBytes: 48, data: new Uint8Array(48 * 50) };
    const b = jobBytes([m], { widthMm: 48, heightMm: 0, gapMm: 0, density: 8, invert: true, lang: "escpos" }, 2);
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    const s = Array.from(b);
    let bands = 0;
    for (let i = 0; i < s.length - 3; i++) if (s[i] === 0x1d && s[i + 1] === 0x76 && s[i + 2] === 0x30) bands++;
    expect(bands).toBe(2 * Math.ceil(50 / 24)); // 3 bands per copy, 2 copies
    expect(new TextDecoder().decode(b)).not.toMatch(/SIZE|BITMAP/); // no label-printer (TSPL) commands
  });
  it("an old saved printer (no type) stays a label printer", async () => {
    const { cleanCfg } = await import("@/lib/mill/millPrint");
    expect(cleanCfg({ id: "nbt:00:11:22:33:44:55", name: "H30C", widthMm: 50, heightMm: 75 })?.lang).toBe("tspl");
    expect(cleanCfg({ id: "nbt:00:11:22:33:44:55", name: "MPT-III", widthMm: 48, heightMm: 0, lang: "escpos" })?.lang).toBe("escpos");
  });
});

describe("sharing the MPT-III with the Weigh & Bill counter", () => {
  it("the Mill Desk lets a receipt printer go 10 s after a slip and never keeps it warm", async () => {
    const m = await import("@/lib/mill/millPrint");
    expect(m.MILL_RECEIPT_KEEP_MS).toBe(10_000);
    const src = (await import("node:fs")).readFileSync("lib/mill/millPrint.ts", "utf8");
    expect(src).toMatch(/keepMs: rc \? MILL_RECEIPT_KEEP_MS : 300_000/);
    expect(src).toMatch(/getMillPrinters\(\)\.label; \/\/ never the receipt printer/);
  });
});

describe("two printers on one phone: receipt printer + label printer", () => {
  const rc = { id: "nbt:AA:AA:AA:AA:AA:AA", name: "MPT-III", widthMm: 48, heightMm: 0, gapMm: 0, density: 8, invert: true, lang: "escpos" as const };
  const lb = { id: "nbt:BB:BB:BB:BB:BB:BB", name: "H30C_F1BA", widthMm: 50, heightMm: 75, gapMm: 3, density: 8, invert: true, lang: "tspl" as const };
  it("weight slip → receipt printer; token and sticker → label printer", async () => {
    const { printerFor } = await import("@/lib/mill/millPrint");
    const both = { receipt: rc, label: lb };
    expect(printerFor({ kind: "slip" }, both)?.name).toBe("MPT-III");
    expect(printerFor({ kind: "token" }, both)?.name).toBe("H30C_F1BA");
    expect(printerFor({ kind: "sticker" }, both)?.name).toBe("H30C_F1BA");
  });
  it("with only one printer chosen everything goes there (as before)", async () => {
    const { printerFor } = await import("@/lib/mill/millPrint");
    for (const k of ["slip", "token", "sticker"] as const) {
      expect(printerFor({ kind: k }, { receipt: null, label: lb })?.name).toBe("H30C_F1BA");
      expect(printerFor({ kind: k }, { receipt: rc, label: null })?.name).toBe("MPT-III");
      expect(printerFor({ kind: k }, { receipt: null, label: null })).toBeNull();
    }
  });
  it("stores both, and the single printer saved by an older version lands in its own place", async () => {
    const mem = new Map<string, string>();
    const w = {
      localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { window: unknown }).window = w;
    try {
      const m = await import("@/lib/mill/millPrint");
      mem.set("mdMillPrinter.v1", JSON.stringify(lb)); // old version
      expect(m.getMillPrinters().label?.name).toBe("H30C_F1BA");
      expect(m.getMillPrinters().receipt).toBeNull();
      m.setMillPrinterSlot("receipt", { ...rc, lang: "tspl" }); // the slot decides the type
      const p = m.getMillPrinters();
      expect(p.receipt?.lang).toBe("escpos");
      expect(p.label?.name).toBe("H30C_F1BA"); // the old one is kept
      expect(mem.has("mdMillPrinter.v1")).toBe(false);
      m.setMillPrinterSlot("label", null);
      expect(m.getMillPrinters().label).toBeNull();
      expect(m.getMillPrinters().receipt?.name).toBe("MPT-III");
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
  it("a sticker keeps its QR code and is never mixed up with its slip in the not-printed list", async () => {
    const { cleanDoc, docKey, layoutDoc } = await import("@/lib/mill/millPrint");
    const d = cleanDoc({ kind: "sticker", code: "WS-0012", rows: [["Mustard seed", "50.00 kg"]], qr: true })!;
    expect(d.kind).toBe("sticker");
    expect(d.qr).toBe(true);
    expect(docKey(d)).not.toBe(docKey({ kind: "slip", code: "WS-0012" }));
    const { ops } = layoutDoc(d, 400, (t, px) => t.length * px * 0.5);
    expect(ops.some((o) => o.t === "qr")).toBe(true);
  });
});

describe("USB cable printers", () => {
  it("a saved USB printer is accepted, and listed next to the Bluetooth ones", async () => {
    const { cleanCfg, labelCandidates, isUsbId } = await import("@/lib/mill/millPrint");
    expect(isUsbId("nusb:0483:5740")).toBe(true);
    expect(cleanCfg({ id: "nusb:0483:5740", name: "Helett H30C", widthMm: 50, heightMm: 75 })?.id).toBe("nusb:0483:5740");
    expect(cleanCfg({ id: "xyz:1", name: "x" })).toBeNull();
    const l = labelCandidates([
      { id: "nbt:AA", name: "H30C_F1BA_BLE", kind: "bluetooth", printer: true },
      { id: "nusb:1:2", name: "Helett H30C", kind: "usb", printer: true },
      { id: "nbt:BB", name: "H30C_F1BA", kind: "bluetooth", printer: true },
    ]);
    expect(l.map((p) => p.id)).toContain("nusb:1:2");
    expect(l[l.length - 1].name).toBe("H30C_F1BA_BLE"); // the BLE twin stays last
  });
  it("says in plain words what to do when the cable printer fails", async () => {
    const { explainPrintError } = await import("@/lib/mill/millPrint");
    expect(explainPrintError({ code: "USB_UNPLUGGED" }).text).toMatch(/plugged in/i);
    expect(explainPrintError({ code: "USB_DENIED" }).text).toMatch(/allow/i);
    expect(explainPrintError({ code: "USB_BUSY" }).text).toMatch(/busy/i);
    expect(explainPrintError({ code: "USB_FAIL" }, "H30C_F1BA_BLE").text).toMatch(/cable/i); // not the BLE message
  });
  it("native USB code reports a code for every failure and never retries after bytes went out", async () => {
    const src = (await import("node:fs")).readFileSync("mobile/android/app/src/main/java/in/mahadevtraders/desk/MahadevPrinterPlugin.java", "utf8");
    for (const c of ["USB_UNPLUGGED", "USB_DENIED", "USB_BUSY", "USB_FAIL"]) expect(src).toContain(`"${c}"`);
    expect(src).toMatch(/if \(sent\[0\] > 0\) throw new PrintFail\("PARTIAL"/);
    expect(src).toMatch(/if \(!"USB_FAIL"\.equals\(pf\.code\) \|\| attempt == 1\) throw pf;/);
  });
});
