import { describe, expect, it } from "vitest";
import { fitMessage, shareFileName, shareLink, shareMessage, tableCsv, tableText } from "../share";
import { navSearch } from "../navSearch";
import { cleanPops, embedUrl } from "../popWindows";
import { cleanQuickCard, DEFAULT_QUICK_CARD, moveCard } from "../quickCard";

describe("share", () => {
  it("makes the app links with the text filled in", () => {
    expect(shareLink("whatsapp", "Sold ₹5,000")).toBe("https://wa.me/?text=Sold%20%E2%82%B95%2C000");
    expect(shareLink("sms", "hi")).toBe("sms:?&body=hi");
    expect(shareLink("email", "body", "Sales")).toBe("mailto:?subject=Sales&body=body");
    expect(shareLink("gmail", "b", "S")).toContain("mail.google.com/mail/?view=cm&fs=1&su=S&body=b");
    const tg = shareLink("telegram", "Sales list\nhttps://x.app/r");
    expect(tg).toContain("url=https%3A%2F%2Fx.app%2Fr");
    expect(tg).toContain("text=Sales%20list");
  });
  it("tables become readable lines and Excel CSV", () => {
    const rows = [["Party", "Amount", ""], ["Ravi, Bidar", "₹1,200", ""], ["", "", ""]];
    expect(tableText(rows)).toBe("Party | Amount\nRavi, Bidar | ₹1,200");
    expect(tableCsv(rows)).toBe('﻿Party,Amount,\r\n"Ravi, Bidar","₹1,200",\r\n,,');
  });
  it("keeps long messages short enough for WhatsApp / SMS", () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
    const m = fitMessage(long, 300);
    expect(m.length).toBeLessThanOrEqual(330);
    expect(m.endsWith("… (more in the app)")).toBe(true);
    expect(shareMessage("Sales", "a\nb", "https://x.app")).toBe("*Sales*\na\nb\n\nhttps://x.app");
  });
  it("file names", () => {
    expect(shareFileName("Sales list · 31/10", "csv")).toBe("Sales-list-31-10.csv");
    expect(shareFileName("", "png")).toBe("report.png");
  });
});

describe("search the app", () => {
  it("finds pages by English or Kannada words, best match first", () => {
    expect(navSearch("sale", true)[0].href).toContain("open=sale");
    expect(navSearch("ಖರ್ಚು", true).some((h) => h.href.includes("expense"))).toBe(true);
    expect(navSearch("employee", false).some((h) => h.href === "/employees")).toBe(false);
    expect(navSearch("employee", true).some((h) => h.href === "/employees")).toBe(true);
    expect(navSearch("zzzz", true)).toEqual([]);
  });
});

describe("quick windows", () => {
  it("only keeps safe addresses and sensible settings", () => {
    const p = cleanPops([{ title: "Sale", url: "/register?open=sale", size: "x", opacity: 0.1, min: true }, { url: "//evil.com" }, { url: "javascript:alert(1)" }, { url: "https://example.com" }]);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ size: "m", opacity: 0.35, min: true, kind: "App" });
    expect(cleanPops("nope")).toEqual([]);
  });
  it("adds embed=1 to app pages only", () => {
    expect(embedUrl("/go")).toBe("/go?embed=1");
    expect(embedUrl("/register?open=sale")).toBe("/register?open=sale&embed=1");
    expect(embedUrl("/x?embed=1")).toBe("/x?embed=1");
    expect(embedUrl("https://a.com")).toBe("https://a.com");
  });
});

describe("quick card", () => {
  it("cleans settings and moves cards", () => {
    expect(cleanQuickCard(null)).toEqual(DEFAULT_QUICK_CARD);
    const c = cleanQuickCard({ cards: ["today", "nope", "today", "entry"], size: "l", opacity: 5, layout: "list" });
    expect(c).toMatchObject({ cards: ["today", "entry"], size: "l", opacity: 1, layout: "list" });
    expect(moveCard(c, "entry", -1).cards).toEqual(["entry", "today"]);
    expect(moveCard(c, "entry", 1).cards).toEqual(["today", "entry"]);
  });
});
