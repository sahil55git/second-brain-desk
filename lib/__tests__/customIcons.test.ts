import { describe, expect, it } from "vitest";
import { cleanCustomIcon, customIdFromName, isCustomId } from "../customIcons";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("custom icons", () => {
  it("makes safe ids and avoids clashes", () => {
    expect(customIdFromName("Press (new)")).toBe("my_press_new");
    expect(customIdFromName("Press", ["my_press"])).toBe("my_press_2");
    expect(customIdFromName("ಹಿಂಡಿ")).toBe("my_icon");
    expect(isCustomId("my_press_2")).toBe(true);
    expect(isCustomId("oil_drop")).toBe(false);
  });
  it("accepts a named PNG and rejects bad input", () => {
    const ok = cleanCustomIcon({ name: " Press ", dataUrl: PNG });
    expect(ok.ok && ok.icon.id).toBe("my_press");
    expect(cleanCustomIcon({ name: "", dataUrl: PNG }).ok).toBe(false);
    expect(cleanCustomIcon({ name: "x", dataUrl: "data:image/svg+xml;base64,AAAA" }).ok).toBe(false);
    expect(cleanCustomIcon({ name: "x", dataUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanCustomIcon({ name: "x", dataUrl: "data:image/png;base64," + "A".repeat(130_000) }).ok).toBe(false);
  });
});
