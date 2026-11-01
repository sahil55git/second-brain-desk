import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "crypto";
import { discordComponents, pieces, telegramKeyboard, toDiscord, toTelegramHtml } from "@/lib/bot/format";
import { verifyDiscord } from "@/lib/bot/discord";
import { reportFileName, reportTables, spanFor } from "@/lib/bot/reports";
import { describeEntry } from "@/lib/bot/entryText";
import { parseCommand, type EntryCmd } from "@/lib/bot/parse";
import type { BizData } from "@/lib/bizReports";

describe("formats", () => {
  it("telegram html: bold, escaped", () => {
    expect(toTelegramHtml("**Sales ₹500** <b> & co")).toBe("<b>Sales ₹500</b> &lt;b&gt; &amp; co");
  });
  it("pieces for the app", () => {
    expect(pieces("Sales **₹500** today")).toEqual([{ b: false, t: "Sales " }, { b: true, t: "₹500" }, { b: false, t: " today" }]);
    expect(pieces("")).toEqual([]);
  });
  it("discord keeps under 2000", () => {
    expect(toDiscord("x\n".repeat(2000)).length).toBeLessThanOrEqual(1950);
  });
  it("buttons", () => {
    const b = [{ label: "✅ Save", data: "ok:abc" }, { label: "❌ Cancel", data: "no:abc" }];
    expect(telegramKeyboard(b)).toEqual({ inline_keyboard: [[{ text: "✅ Save", callback_data: "ok:abc" }, { text: "❌ Cancel", callback_data: "no:abc" }]] });
    expect(telegramKeyboard([])).toBeUndefined();
    expect(telegramKeyboard([{ label: "x", data: "cmd:remind " + "ರಮೇಶ".repeat(5) }])).toBeUndefined();
    const d = discordComponents(b)[0].components;
    expect(d.map((x) => x.style)).toEqual([3, 4]);
    // four buttons: two per row on Telegram
    expect(telegramKeyboard([...b, ...b])!.inline_keyboard).toHaveLength(2);
  });
});

describe("discord signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const body = JSON.stringify({ type: 1 });
  const ts = "1730450000";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  it("accepts Discord's signature", () => expect(verifyDiscord(raw, sig, ts, body)).toBe(true));
  it("refuses a changed body or missing headers", () => {
    expect(verifyDiscord(raw, sig, ts, body + " ")).toBe(false);
    expect(verifyDiscord(raw, null, ts, body)).toBe(false);
    expect(verifyDiscord("zz", sig, ts, body)).toBe(false);
  });
});

describe("entries and reports", () => {
  it("describes an entry", () => {
    const e = parseCommand("sale 15kg groundnut @180 upi suresh") as EntryCmd;
    expect(describeEntry(e, "2026-11-01")).toBe("**Sale ₹2,700**\nItem: Groundnut 15 kg @ ₹180\nPaid by: UPI / bank\nFrom: Suresh\nDate: 01-11-2026");
    const p = parseCommand("paid 3000 salary raju") as EntryCmd;
    expect(describeEntry(p, "2026-11-01")).toContain("To: Raju");
  });
  it("builds report tables and file names", () => {
    const now = Date.parse("2026-11-01T10:00:00Z");
    const reg = { id: "1", date: "2026-11-01", kind: "SALE", item: "sunflower", itemLabel: null, qty: 2, unit: "kg", rateInr: null, amountInr: 400, paymentMode: "CREDIT", partyName: "Ramesh", notes: null, createdAt: "2026-11-01T05:00:00Z" };
    const d = { sales: [], purchases: [], expenses: [], register: [reg], jobWork: [], mfg: [], closings: [], items: [], refunds: [], adjustments: [] } as unknown as BizData;
    const s = spanFor("today", now);
    expect(s).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    const u = reportTables(d, "udhaar", s, now);
    expect(u[0].rows).toEqual([expect.objectContaining({ name: "Ramesh", balance: 400 })]);
    expect(reportTables(d, "sales", s, now)[2].rows).toHaveLength(1);
    expect(reportTables(d, "day", s, now)[0].rows[0]).toEqual({ k: "Sales", v: 400 });
    expect(reportFileName("day", spanFor("week", now), "pdf")).toBe("Mahadev-Day-book-26-10-2026_to_01-11-2026.pdf");
  });
});
