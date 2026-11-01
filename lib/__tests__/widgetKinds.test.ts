import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_ACTION_IDS, WIDGETS, actionChoices, actionLabel, actionsFor, cleanMinutes, cleanNote, NOTE_MAX } from "@/lib/widgetKinds";

const java = (f: string) => readFileSync(join(process.cwd(), "mobile/android/app/src/main/java/in/mahadevtraders/desk", f), "utf8");

describe("widget catalogue", () => {
  it("matches the kinds the Android app knows", () => {
    const src = java("Widgets.java");
    const kinds = Array.from(src.matchAll(/KINDS\.put\("([a-z]+)", (\w+)\.class\)/g)).map((m) => m[1]);
    expect(kinds).toEqual(WIDGETS.map((w) => w.kind));
  });
  it("every provider is in the manifest with its info file", () => {
    const man = readFileSync(join(process.cwd(), "mobile/android/app/src/main/AndroidManifest.xml"), "utf8");
    const src = java("Widgets.java");
    for (const m of Array.from(src.matchAll(/KINDS\.put\("([a-z]+)", (\w+)\.class\)/g))) {
      expect(man).toContain(`android:name=".${m[2]}"`);
      expect(man).toContain(`@xml/widget_${m[1]}_info`);
      expect(java(`${m[2]}.java`)).toContain(`return "${m[1]}"`);
    }
  });
});

describe("quick buttons", () => {
  it("turns quick-link ids into short labels and paths", () => {
    const a = actionsFor(["sale", "weighfull", "nope", "sale"]);
    expect(a).toEqual([
      { label: "💰\nSale", path: "/register?open=sale" },
      { label: expect.stringMatching(/^⚖️?\nWeigh full…$/), path: "/barrels?weigh=full" },
    ]);
  });
  it("keeps at most six", () => {
    expect(actionsFor(actionChoices(true).map((l) => l.id))).toHaveLength(6);
  });
  it("the defaults all exist", () => {
    expect(actionsFor(DEFAULT_ACTION_IDS)).toHaveLength(6);
  });
  it("staff do not get owner-only tiles", () => {
    expect(actionChoices(false).some((l) => l.id === "reports")).toBe(false);
    expect(actionChoices(true).some((l) => l.id === "reports")).toBe(true);
  });
  it("shortens long names", () => {
    expect(actionLabel("🛢️", "Barrels: simple mode")).toBe("🛢️\nsimple mode");
    expect(actionLabel("x", "Customer seed count")).toBe("x\nCustomer se…");
  });
});

describe("note and interval", () => {
  it("cleans the note", () => {
    expect(cleanNote("  a\r\n\n\n\nb ")).toBe("a\n\nb");
    expect(cleanNote("x".repeat(900))).toHaveLength(NOTE_MAX);
  });
  it("interval is 15, 30 or 60", () => {
    expect([cleanMinutes(5), cleanMinutes(30), cleanMinutes(45), cleanMinutes(90), cleanMinutes("x")]).toEqual([15, 30, 30, 60, 30]);
  });
});
