import { describe, expect, it } from "vitest";
import { priceCheck } from "../priceCheck";

describe("price check", () => {
  it("shows the change against the last rate", () => {
    expect(priceCheck("165", 158)).toMatchObject({ direction: "up", diffInr: 7, text: "↑ ₹7" });
    expect(priceCheck("150", 158)).toMatchObject({ direction: "down", diffInr: 8, text: "↓ ₹8" });
  });
  it("says so when the rate matches", () => {
    expect(priceCheck("158", 158)?.text).toBe("same as last");
  });
  it("shows nothing without an entered rate or a last rate", () => {
    expect(priceCheck("", 158)).toBeNull();
    expect(priceCheck("165", null)).toBeNull();
    expect(priceCheck("abc", 158)).toBeNull();
  });
});
