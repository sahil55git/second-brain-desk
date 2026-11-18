import { describe, expect, it } from "vitest";
import { billIcon, billName } from "../counterName";

describe("bill names", () => {
  it("a typed customer name always wins", () => {
    expect(billName("Ramesh", { CASH: 10 })).toBe("Ramesh");
  });
  it("otherwise the bill is named by how it was paid", () => {
    expect(billName("", { CASH: 720 })).toBe("Cash bill");
    expect(billName(null, { UPI: 5 })).toBe("UPI bill");
    expect(billName("  ", { CREDIT: 5 })).toBe("Udhaar bill");
    expect(billName("", { CASH: 5, UPI: 5 })).toBe("Cash + UPI bill");
    expect(billName("", { CASH: 5 }, true)).toBe("ನಗದು ಬಿಲ್");
    expect(billName("", {})).toBe("Bill");
  });
  it("icons follow the payment", () => {
    expect(billIcon({ CASH: 1 })).toBe("💵");
    expect(billIcon({ UPI: 1 })).toBe("📲");
    expect(billIcon({ CASH: 1, UPI: 1 })).toBe("💵📲");
  });
});
