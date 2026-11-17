import { describe, expect, it } from "vitest";
import { kioskAllows, type KioskState } from "../counterKiosk";

const on = (allow: KioskState["allow"] = []): KioskState => ({ on: true, pinHash: "x", allow });

describe("counter-only mode", () => {
  it("lets everything open when off", () => {
    expect(kioskAllows(null, "/sales", "")).toBe(true);
    expect(kioskAllows({ on: false, pinHash: "", allow: [] }, "/sales", "")).toBe(true);
  });
  it("keeps only the counter (and sign-in) open when on", () => {
    expect(kioskAllows(on(), "/register/counter", "")).toBe(true);
    expect(kioskAllows(on(), "/login", "")).toBe(true);
    expect(kioskAllows(on(), "/go", "")).toBe(false);
    expect(kioskAllows(on(), "/register", "")).toBe(false);
    expect(kioskAllows(on(), "/", "?desk=scales")).toBe(false);
  });
  it("opens the pages the owner ticked", () => {
    expect(kioskAllows(on(["register"]), "/register/pos", "")).toBe(true);
    expect(kioskAllows(on(["scales"]), "/", "?desk=scales")).toBe(true);
    expect(kioskAllows(on(["scales"]), "/", "?desk=sales")).toBe(false);
    expect(kioskAllows(on(["cash"]), "/cashbook", "")).toBe(false);
  });
});
