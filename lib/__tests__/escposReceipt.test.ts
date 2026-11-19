import { describe, expect, it } from "vitest";
import { asciiText, buildReceiptEscpos, leftRight, needsPicture, qrMono, rasterBands, wrap, type LineRenderer } from "../escposReceipt";
import type { ReceiptDoc } from "../receipt";

const shop = { name: "MAHADEV TRADERS", address: "Main Road, Bidar", phone: "9876543210" };
const bill: ReceiptDoc = {
  title: "RECEIPT",
  no: "1042",
  when: "19 Nov 2026, 7:20 pm",
  party: "Cash bill",
  rows: [
    { name: "Groundnut oil", detail: "5.250 kg × ₹180", amount: "₹945" },
    { name: "Karadi oil (safflower) premium cold pressed", detail: "1 kg × ₹260", amount: "₹260" },
  ],
  totals: [
    { label: "Round-off", value: "−₹0.50" },
    { label: "TOTAL", value: "₹1,204.50", strong: true },
  ],
  notes: ["Mode: Cash · Re-print"],
};
const text = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("asciiText / needsPicture", () => {
  it("maps rupee, minus, times and dots", () => {
    expect(asciiText("₹945 − ₹1 × 2 · ok")).toBe("Rs.945 - Rs.1 x 2 - ok");
  });
  it("Kannada needs a picture, English does not", () => {
    expect(needsPicture("ಧನ್ಯವಾದಗಳು")).toBe(true);
    expect(needsPicture("₹945 · Cash")).toBe(false);
  });
});

describe("layout", () => {
  it("wraps at spaces and never passes the width", () => {
    const w = wrap("Karadi oil safflower premium cold pressed oil from Bidar", 16);
    expect(w.every((l) => l.length <= 16)).toBe(true);
    expect(w.join(" ")).toBe("Karadi oil safflower premium cold pressed oil from Bidar");
  });
  it("puts the amount at the right edge", () => {
    const [l] = leftRight("Groundnut oil", "Rs.945", 32);
    expect(l.length).toBe(32);
    expect(l.endsWith("Rs.945")).toBe(true);
  });
  it("moves the amount to its own line when the name is long", () => {
    const ls = leftRight("x".repeat(30), "Rs.1,204.50", 32);
    expect(ls.at(-1)!.trim()).toBe("Rs.1,204.50");
    expect(ls.every((l) => l.length <= 32)).toBe(true);
  });
});

describe("buildReceiptEscpos", () => {
  it("is small, plain ASCII text and starts with a printer reset", () => {
    const b = buildReceiptEscpos(bill, shop, { paper: 80, kannada: false });
    expect(b[0]).toBe(0x1b);
    expect(b[1]).toBe(0x40);
    expect(b.length).toBeLessThan(1500);
    const t = text(b);
    expect(t).toContain("Groundnut oil");
    expect(t).toContain("Rs.945");
    expect(t).toContain("Rs.1,204.50");
    expect(t).toContain("-Rs.0.50");
    expect(t).not.toMatch(/[\u0080-￿]/);
  });
  it("no printed line is wider than the paper", () => {
    for (const paper of [58, 80] as const) {
      const cols = paper === 58 ? 32 : 48;
      const b = buildReceiptEscpos(bill, shop, { paper, kannada: false });
      // text between line feeds, with ESC/GS commands removed
      const lines = text(b).replace(/\x1b[@t]\x00?|\x1b[aE][\s\S]|\x1d![\s\S]|\x1bd[\s\S]/g, "").split("\n");
      for (const l of lines) expect(l.replace(/[\x00-\x1f]/g, "").length).toBeLessThanOrEqual(cols);
    }
  });
  it("draws Kannada with the renderer and leaves it out without one", () => {
    const seen: string[] = [];
    const render: LineRenderer = (s, w) => {
      seen.push(s);
      const rowBytes = Math.ceil(w / 8);
      return { width: w, height: 30, rowBytes, data: new Uint8Array(rowBytes * 30) };
    };
    const doc = { ...bill, party: "ರಾಮು, ಬೀದರ್" };
    const withPic = buildReceiptEscpos(doc, shop, { paper: 58 }, render);
    expect(seen).toContain("ರಾಮು, ಬೀದರ್");
    expect(seen).toContain("ಧನ್ಯವಾದಗಳು");
    expect(text(withPic)).toContain("\x1dv0"); // GS v 0 picture
    const without = buildReceiptEscpos(doc, shop, { paper: 58 });
    expect(text(without)).not.toContain("\x1dv0");
  });
  it("adds the UPI QR as a picture in 24-row bands", () => {
    const b = buildReceiptEscpos({ ...bill, qr: "upi://pay?pa=shop@okaxis&am=1204.50&cu=INR" }, shop, { paper: 80, kannada: false });
    expect(text(b)).toContain("\x1dv0");
    expect(b.length).toBeLessThan(12000);
  });
  it("prints copies and the cut command", () => {
    const one = buildReceiptEscpos(bill, shop, { kannada: false });
    const two = buildReceiptEscpos(bill, shop, { kannada: false, copies: 2, cut: true });
    expect(two.length).toBeGreaterThan(one.length * 1.8);
    expect(text(two)).toContain("\x1dVB\x00");
  });
});

describe("pictures", () => {
  it("QR is a square that fits the paper, no margin bytes", () => {
    const q = qrMono("upi://pay?pa=a@b&am=10", 384)!;
    expect(q.width).toBeLessThanOrEqual(384);
    expect(q.width % 8).toBe(0);
    expect(Math.abs(q.width - q.height)).toBeLessThan(8);
    expect(q.height).toBeGreaterThan(100);
    expect(q.height).toBeLessThanOrEqual(384);
  });
  it("bands carry the right sizes", () => {
    const m = { width: 16, height: 30, rowBytes: 2, data: new Uint8Array(60) };
    const b = rasterBands(m);
    expect(b.length).toBe(8 + 48 + 8 + 12);
    expect(Array.from(b.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 24, 0]);
  });
});
