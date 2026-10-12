import { describe, expect, it } from "vitest";
import { udhaarFor } from "../udhaarHint";

const rows = [
  { name: "Ramesh Stores", balance: 8400 },
  { name: "Karadi Stores", balance: 0 },
];

describe("udhaar hint lookup", () => {
  it("finds a party owing money, ignoring case and extra spaces", () => {
    expect(udhaarFor(rows, "  ramesh   STORES ")).toBe(8400);
  });
  it("shows nothing for parties who owe nothing, unknown names, or an empty name", () => {
    expect(udhaarFor(rows, "Karadi Stores")).toBeNull();
    expect(udhaarFor(rows, "Walk-in")).toBeNull();
    expect(udhaarFor(rows, "   ")).toBeNull();
  });
});
