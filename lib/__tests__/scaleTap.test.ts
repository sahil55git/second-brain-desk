import { describe, expect, it } from "vitest";
import { scaleTapPlan } from "@/lib/mill/scaleTap";

const base = { support: "native" as const, hasConfig: true, status: "off" as const, error: null, name: "iScale" };

describe("Mill Desk scale tap", () => {
  it("a browser that cannot do Bluetooth goes straight to the scale set-up page", () => {
    expect(scaleTapPlan({ ...base, support: "none" }).act).toBe("setup");
  });
  it("no scale chosen yet goes to set-up", () => {
    expect(scaleTapPlan({ ...base, hasConfig: false }).act).toBe("setup");
  });
  it("switched off connects", () => {
    expect(scaleTapPlan(base).act).toBe("connect");
  });
  it("a failing link is retried at once and shows why", () => {
    const p = scaleTapPlan({ ...base, status: "waiting", error: "Bluetooth is off. Turn it on." });
    expect(p.act).toBe("retry");
    expect(p.text).toContain("Bluetooth is off");
  });
  it("a refused permission is retried too (asks again)", () => {
    expect(scaleTapPlan({ ...base, status: "blocked", error: null }).act).toBe("retry");
  });
  it("connecting and live do nothing extra", () => {
    expect(scaleTapPlan({ ...base, status: "connecting" }).act).toBe("none");
    expect(scaleTapPlan({ ...base, status: "live" }).bad).toBe(false);
  });
});
