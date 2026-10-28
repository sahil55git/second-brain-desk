import { describe, expect, it } from "vitest";
import { FONTS, fontFaceCss, fontNeeds, fontOf, needSpec, parseSpec } from "@/lib/fonts";

describe("fonts", () => {
  it("every font has a 400 and a 700 file and a unique family", () => {
    expect(new Set(FONTS.map((f) => f.family)).size).toBe(FONTS.length);
    for (const f of FONTS) expect(f.files.map((x) => x.weight)).toEqual([400, 700]);
  });
  it("fontFaceCss has one rule per file and can swap the url", () => {
    const css = fontFaceCss((u) => `data:${u}`);
    expect(css.match(/@font-face/g)).toHaveLength(FONTS.length * 2);
    expect(css).toContain('url("data:/fonts/inter-400.woff2")');
  });
  it("unknown font ids fall back to sans", () => {
    expect(fontOf("nope").id).toBe("sans");
  });
  it("fontNeeds adds the base font for script fonts and script fonts for matching letters", () => {
    expect(needSpec(fontNeeds("sans", false, "BRL-01"))).toBe("sans:400");
    expect(needSpec(fontNeeds("kannada", true, "ಕ"))).toBe("kannada:700,sans:700");
    expect(needSpec(fontNeeds("sans", false, "ಕ महा"))).toBe("hindi:400,kannada:400,sans:400");
  });
  it("parseSpec round-trips and ignores junk", () => {
    expect(parseSpec("sans:400,kannada:700,bogus:400,sans:500")).toEqual([{ id: "sans", weight: 400 }, { id: "kannada", weight: 700 }]);
    expect(parseSpec(null)).toEqual([]);
  });
});
