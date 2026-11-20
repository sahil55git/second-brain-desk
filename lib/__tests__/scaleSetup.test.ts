import { describe, expect, it } from "vitest";
import { safeBack, scaleSetupHref } from "@/lib/scaleSetup";

describe("scale set-up link", () => {
  it("opens the Live scales page, with a way back", () => {
    expect(scaleSetupHref()).toBe("/scales");
    expect(scaleSetupHref("/mill")).toBe("/scales?back=%2Fmill");
    expect(scaleSetupHref("/register/counter")).toBe("/scales?back=%2Fregister%2Fcounter");
  });
  it("only ever goes back to a page of this site", () => {
    expect(safeBack("/mill/counter")).toBe("/mill/counter");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "", null, undefined, "/scales", "/scales?back=/x"]) expect(safeBack(bad as string)).toBe("/");
  });
});
