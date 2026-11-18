import { describe, expect, it } from "vitest";
import { appHint, cleanVpa, mergeShopPay, parseShopPay, payeeFromLink, payLink, pickAccount, shopProblem, validVpa, vpaProblem } from "../shopPay";

describe("UPI id cleaning", () => {
  it("trims, lower-cases and drops spaces", () => {
    expect(cleanVpa("  Mahadev Traders @YBL ")).toBe("mahadevtraders@ybl");
    expect(cleanVpa("shop@okicici.")).toBe("shop@okicici");
    expect(cleanVpa(null)).toBe("");
  });
  it("takes the id (and name) out of a pasted UPI link or QR text", () => {
    const link = "upi://pay?pa=Mahadev.Traders@okhdfcbank&pn=Mahadev%20Traders&cu=INR";
    expect(cleanVpa(link)).toBe("mahadev.traders@okhdfcbank");
    expect(payeeFromLink(link)).toBe("Mahadev Traders");
    expect(payeeFromLink("shop@ybl")).toBe("");
  });
  it("explains what is wrong, and accepts empty", () => {
    expect(vpaProblem("")).toBeNull();
    expect(vpaProblem("shopname")).toMatch(/@/);
    expect(vpaProblem("a b@")).not.toBeNull();
    expect(vpaProblem("shop@ybl")).toBeNull();
    expect(validVpa("9876543210@paytm")).toBe(true);
    expect(validVpa("x@y")).toBe(false);
  });
  it("names the usual app from the handle, never blocks", () => {
    expect(appHint("a@ybl")).toBe("PhonePe");
    expect(appHint("a@okaxis")).toBe("Google Pay");
    expect(appHint("a@paytm")).toBe("Paytm");
    expect(appHint("a@sbi")).toBe("");
  });
});

describe("shop pay settings", () => {
  it("old data with only {name, upi} keeps working", () => {
    const p = parseShopPay({ name: "Mahadev Traders, Bidar", upi: "Mahadev@ybl" });
    expect(p.upi).toBe("mahadev@ybl");
    expect(p.accounts).toHaveLength(1);
    expect(p.accounts[0].label).toBe("Main");
    expect(p.payee).toBe("");
  });
  it("broken or empty data gives no accounts", () => {
    expect(parseShopPay(null)).toEqual({ payee: "", upi: "", accounts: [] });
    expect(parseShopPay({ upi: "nonsense", accounts: [{ vpa: "bad" }, 5, null] }).accounts).toEqual([]);
  });
  it("keeps the list order, drops duplicates, caps at five", () => {
    const accounts = Array.from({ length: 8 }, (_, i) => ({ label: `A${i}`, vpa: `a${i % 6}@ybl` }));
    const p = parseShopPay({ accounts });
    expect(p.accounts.length).toBeLessThanOrEqual(5);
    expect(new Set(p.accounts.map((a) => a.vpa)).size).toBe(p.accounts.length);
    expect(p.upi).toBe("a0@ybl");
  });
  it("saving keeps other shop fields and sets upi to the first account", () => {
    const m = mergeShopPay({ name: "Shop", lat: 17.9, lng: 77.5, upi: "old@ybl" }, { payee: " Mahadev  Traders ", accounts: [{ label: "SBI", vpa: "New@oksbi" }, { label: "x", vpa: "bad" }] });
    expect(m.name).toBe("Shop");
    expect(m.lat).toBe(17.9);
    expect(m.upi).toBe("new@oksbi");
    expect(m.upiName).toBe("Mahadev Traders");
    expect((m.accounts as unknown[]).length).toBe(1);
    // reading it back gives the same
    expect(parseShopPay(m).upi).toBe("new@oksbi");
  });
  it("clearing every id clears the default too", () => {
    const m = mergeShopPay({ upi: "old@ybl" }, { payee: "", accounts: [] });
    expect(m.upi).toBe("");
    expect(parseShopPay(m).accounts).toEqual([]);
  });
  it("the server refuses a bad id and allows an empty one", () => {
    expect(shopProblem({ upi: "bad" })).not.toBeNull();
    expect(shopProblem({ upi: "" })).toBeNull();
    expect(shopProblem({ name: "x" })).toBeNull();
    expect(shopProblem({ accounts: [{ vpa: "ok@ybl" }, { vpa: "bad" }] })).not.toBeNull();
    expect(shopProblem({ accounts: Array.from({ length: 6 }, (_, i) => ({ vpa: `a${i}@ybl` })) })).not.toBeNull();
  });
  it("picks the asked account, else the default", () => {
    const p = parseShopPay({ accounts: [{ id: "a", label: "A", vpa: "aa@ybl" }, { id: "b", label: "B", vpa: "bb@ybl" }] });
    expect(pickAccount(p, "b")?.vpa).toBe("bb@ybl");
    expect(pickAccount(p, "gone")?.vpa).toBe("aa@ybl");
    expect(pickAccount(parseShopPay(null))).toBeNull();
  });
});

describe("pay link", () => {
  it("with an amount fills the pay screen in", () => {
    const l = payLink({ vpa: "shop@ybl", payee: "Mahadev Traders", amount: 1234.5, note: "Bill 12" });
    expect(l).toContain("pa=shop@ybl");
    expect(l).toContain("pn=Mahadev%20Traders");
    expect(l).toContain("am=1234.50");
    expect(l).toContain("cu=INR");
    expect(l).toContain("tn=Bill%2012");
    expect(l).not.toContain("+");
  });
  it("without an amount leaves it for the customer to type", () => {
    const l = payLink({ vpa: "shop@ybl", payee: "Shop" });
    expect(l).not.toContain("am=");
    expect(payLink({ vpa: "shop@ybl", payee: "Shop", amount: 0 })).not.toContain("am=");
  });
});
