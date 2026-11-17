import { describe, expect, it } from "vitest";
import { billText, daySummaryDoc, mobileOf, whatsappLink } from "../counterShare";

describe("counter sharing", () => {
  it("finds a mobile number in the customer field", () => {
    expect(mobileOf("Ravi 98450 12345")).toBe("9845012345");
    expect(mobileOf("+91 9845012345")).toBe("9845012345");
    expect(mobileOf("Ravi")).toBeNull();
    expect(mobileOf("12345")).toBeNull();
  });
  it("makes a readable bill text and a WhatsApp link", () => {
    const t = billText({ title: "RECEIPT", no: "5", rows: [{ name: "Karadi", detail: "2 kg × ₹260", amount: "₹520" }], totals: [{ label: "TOTAL", value: "₹520", strong: true }] }, "MAHADEV TRADERS");
    expect(t).toContain("Karadi (2 kg × ₹260) — ₹520");
    expect(t).toContain("*TOTAL: ₹520*");
    expect(whatsappLink("hi there", "9845012345")).toBe("https://wa.me/919845012345?text=hi%20there");
    expect(whatsappLink("x")).toBe("https://wa.me/?text=x");
  });
  it("day summary shows net after returns", () => {
    const d = daySummaryDoc({ when: "w", from: "2026-11-17", to: "2026-11-17", count: 3, total: 1000, kg: 4.5, modes: { Cash: 700, UPI: 300 }, returned: 100 });
    expect(d.totals?.at(-1)).toEqual({ label: "NET", value: "₹900", strong: true });
  });
});
