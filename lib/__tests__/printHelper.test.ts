import { describe, expect, it } from "vitest";
import {
  KIOSK_TARGETS, MAX_COPIES, buildHelperJob, cleanPairingCode, clampCopies, isTouchDeviceUA, kioskBat, mmToCssPx, pairingCodeOk, pictureName, pixelRatioFor, printMode, stripDataUrl,
} from "../printHelper";

describe("print helper client rules", () => {
  it("keeps copies between 1 and the limit", () => {
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(-4)).toBe(1);
    expect(clampCopies("x")).toBe(1);
    expect(clampCopies(3.6)).toBe(4);
    expect(clampCopies(500)).toBe(MAX_COPIES);
  });

  it("tidies a typed pairing code", () => {
    expect(cleanPairingCode("3fa9 0c1b-77de_92a4")).toBe("3FA9-0C1B-77DE-92A4");
    expect(cleanPairingCode("3FA90C1B")).toBe("3FA9-0C1B");
    expect(pairingCodeOk("3FA9-0C1B-77DE-92A4")).toBe(true);
    expect(pairingCodeOk("3FA9-0C1B")).toBe(false);
    expect(pairingCodeOk("ZZZZ-0C1B-77DE-92A4")).toBe(false);
  });

  it("builds a job with clean pictures and the paper size", () => {
    const job = buildHelperJob({ printer: "  H30C Thermal Printer ", copies: 99, widthMm: 50, heightMm: 75, pngs: ["data:image/png;base64,AAAA", "BBBB"] });
    expect(job.printer).toBe("H30C Thermal Printer");
    expect(job.copies).toBe(MAX_COPIES);
    expect(job.items).toEqual([
      { png: "AAAA", widthMm: 50, heightMm: 75 },
      { png: "BBBB", widthMm: 50, heightMm: 75 },
    ]);
    expect(stripDataUrl("data:image/png;base64,XYZ")).toBe("XYZ");
  });

  it("a roll slip has no fixed height", () => {
    expect(buildHelperJob({ printer: "P", copies: 1, widthMm: 80, heightMm: null, pngs: ["A"] }).items[0].heightMm).toBeNull();
  });

  it("converts sizes for the picture", () => {
    expect(mmToCssPx(25.4)).toBeCloseTo(96);
    expect(pixelRatioFor(203)).toBeCloseTo(2.114, 2);
    expect(Math.round(mmToCssPx(50) * pixelRatioFor(203))).toBe(400); // a 50 mm label is 400 dots at 203 dpi
  });

  it("reads the saved mode and spots phones and tablets", () => {
    expect(printMode("helper")).toBe("helper");
    expect(printMode("share")).toBe("share");
    expect(printMode("nonsense")).toBe("window");
    expect(printMode(undefined)).toBe("window");
    expect(isTouchDeviceUA("Mozilla/5.0 (Linux; Android 14; 23078PND5G) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe(true);
    expect(isTouchDeviceUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isTouchDeviceUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe(false);
  });

  it("names saved pictures clearly", () => {
    expect(pictureName("BRL-01", "label", 50, 75, 1, 1)).toBe("BRL-01-label-50x75mm.png");
    expect(pictureName("barrel labels", "label", 101.6, 152.4, 3, 12)).toBe("barrel-labels-label-101.6x152.4mm-03.png");
    expect(pictureName("slip", "slip", 80, null, 1, 1)).toBe("slip-slip-80xrollmm.png");
    expect(pictureName("///", "label", 50, 30, 1, 1)).toBe("print-label-50x30mm.png");
  });
});

describe("one-click Chrome shortcut", () => {
  it("opens the right page in its own profile with silent printing", () => {
    const bat = kioskBat("https://mahadev-second-brain.vercel.app/", "labels");
    expect(bat).toContain("--kiosk-printing");
    expect(bat).toContain('--app="https://mahadev-second-brain.vercel.app/barrels/fleet/labels?codes=all&size=50x30&type=tare"');
    expect(bat).toContain("--user-data-dir=");
    expect(bat).toContain("\\MahadevPrint\\labels");
    expect(bat).toContain("\r\n");
    expect(kioskBat("https://x.app", "slips")).toContain("\\MahadevPrint\\slips");
    expect(KIOSK_TARGETS.labels.file).toMatch(/\.bat$/);
  });
});

import { PRINT_MODES, QUEUE_CHUNK, ago, chunkItems } from "../printHelper";
describe("shop printer queue helpers", () => {
  it("splits many pictures into smaller jobs", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 2)).toEqual([]);
    expect(chunkItems(Array.from({ length: 45 }, (_, i) => i)).map((c) => c.length)).toEqual([QUEUE_CHUNK, QUEUE_CHUNK, 5]);
  });
  it("says how long ago", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(ago("2026-10-28T11:59:58Z", now)).toBe("just now");
    expect(ago("2026-10-28T11:59:15Z", now)).toBe("45 s ago");
    expect(ago("2026-10-28T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-28T09:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-26T12:00:00Z", now)).toBe("2 d ago");
    expect(ago(null, now)).toBe("");
  });
  it("has the shop printer mode and keeps its saved value", () => {
    expect(PRINT_MODES.map((m) => m.id)).toContain("queue");
    expect(printMode("queue")).toBe("queue");
  });
});
