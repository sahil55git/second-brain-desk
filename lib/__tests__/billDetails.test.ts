import { describe, expect, it } from "vitest";
import { joinParty, splitParty } from "../../components/counter/BillDetails";

describe("customer name and mobile on a saved bill", () => {
  it("splits and joins name + mobile", () => {
    expect(splitParty("Ramesh 9876543210")).toEqual({ name: "Ramesh", mobile: "9876543210" });
    expect(splitParty("9876543210")).toEqual({ name: "", mobile: "9876543210" });
    expect(splitParty("Ramesh Kumar")).toEqual({ name: "Ramesh Kumar", mobile: "" });
    expect(splitParty(null)).toEqual({ name: "", mobile: "" });
    expect(joinParty("Ramesh", "9876543210")).toBe("Ramesh 9876543210");
    expect(joinParty("", "9876543210")).toBe("9876543210");
    expect(joinParty("Ramesh", "")).toBe("Ramesh");
  });
});
