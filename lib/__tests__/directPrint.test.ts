import { describe, expect, it } from "vitest";
import { PRINTER_SERVICES, directConfig, directDefaults, explainError, pickWriteChar, sendBytes, shortId, unsupportedReason, type CharInfo, type Sink } from "../directPrint";

const ch = (uuid: string, write: boolean, writeNoResponse: boolean, service = "svc"): CharInfo => ({ service, uuid, write, writeNoResponse });
const sink = (log: number[], failWhen?: (n: number, call: number) => boolean): Sink => {
  let call = 0;
  return {
    write: async (c) => {
      call++;
      if (failWhen?.(c.length, call)) throw new Error("GATT write failed");
      log.push(c.length);
    },
  };
};
const noWait = async () => {};

describe("settings", () => {
  it("labels start on TSPL at the paper width, receipt slips on ESC/POS at the print width", () => {
    expect(directDefaults("label", 50)).toMatchObject({ lang: "tspl", gapMm: 3, widthMm: 50 });
    expect(directDefaults("slip", 80)).toMatchObject({ lang: "escpos", gapMm: 0, widthMm: 72 });
    expect(directDefaults("slip", 58)).toMatchObject({ lang: "escpos", widthMm: 48 });
    expect(directDefaults("slip", 101.6)).toMatchObject({ lang: "tspl", widthMm: 101.6 });
  });
  it("saved values override, nonsense falls back and numbers are kept in range", () => {
    const c = directConfig("label", 50, { lang: "zpl", density: 99, gapMm: -4, threshold: 5, chunk: 9999, service: " FFE0 " });
    expect(c).toMatchObject({ lang: "zpl", density: 15, gapMm: 0, threshold: 40, chunk: 512, service: "ffe0" });
    expect(directConfig("label", 50, { lang: "nope" as never }).lang).toBe("tspl");
    expect(directConfig("label", 50, null)).toEqual(directDefaults("label", 50));
  });
});

describe("browser support", () => {
  it("explains why, in words", () => {
    expect(unsupportedReason({ bluetooth: true, usb: false, secure: true }, "")).toBe("");
    expect(unsupportedReason({ bluetooth: false, usb: false, secure: true }, "Mozilla/5.0 (iPhone; CPU iPhone OS 17)")).toMatch(/iPhone/);
    expect(unsupportedReason({ bluetooth: false, usb: false, secure: false }, "Chrome")).toMatch(/https/);
    expect(unsupportedReason({ bluetooth: false, usb: false, secure: true }, "Firefox")).toMatch(/Chrome/);
  });
});

describe("choosing the Bluetooth write channel", () => {
  it("prefers the known printer channels over a random writable one", () => {
    const list = [ch("0000abcd-0000-1000-8000-00805f9b34fb", false, true), ch("0000ff02-0000-1000-8000-00805f9b34fb", true, true)];
    expect(pickWriteChar(list)?.uuid).toBe("0000ff02-0000-1000-8000-00805f9b34fb");
  });
  it("otherwise takes write-without-response (fast), then plain write, ignores read-only", () => {
    const a = ch("a", true, false), b = ch("b", false, true), r = ch("r", false, false);
    expect(pickWriteChar([r, a, b])?.uuid).toBe("b");
    expect(pickWriteChar([r, a])?.uuid).toBe("a");
    expect(pickWriteChar([r])).toBeNull();
    expect(pickWriteChar([])).toBeNull();
  });
  it("asks Chrome for the usual printer services and shows short ids", () => {
    expect(PRINTER_SERVICES).toContain("000018f0-0000-1000-8000-00805f9b34fb");
    expect(PRINTER_SERVICES).toContain("49535343-fe7d-4ae5-8fa9-9fafd205e455");
    expect(shortId("0000ffe1-0000-1000-8000-00805f9b34fb")).toBe("FFE1");
    expect(shortId("49535343-8841-43f4-a8d4-ecbe34729bb3")).toBe("49535343-8841-43f4-a8d4-ecbe34729bb3");
  });
});

describe("sending in pieces", () => {
  it("sends every byte in order, in pieces of the chosen size, with progress", async () => {
    const sizes: number[] = [];
    const prog: number[] = [];
    const used = await sendBytes(sink(sizes), new Uint8Array(250), { chunk: 100, sleep: noWait, onProgress: (s) => prog.push(s) });
    expect(sizes).toEqual([100, 100, 50]);
    expect(prog).toEqual([100, 200, 250]);
    expect(used).toBe(100);
  });
  it("pauses between pieces but not after the last", async () => {
    const waits: number[] = [];
    await sendBytes(sink([]), new Uint8Array(250), { chunk: 100, delayMs: 20, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([20, 20]);
  });
  it("halves the piece size when a write fails and carries on from the same place", async () => {
    const got: number[] = [];
    const data = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const received: number[] = [];
    const s: Sink = {
      write: async (c) => {
        if (c.length > 50) throw new Error("too big");
        got.push(c.length);
        received.push(...Array.from(c));
      },
    };
    const used = await sendBytes(s, data, { chunk: 200, sleep: noWait });
    expect(used).toBe(50);
    expect(received).toEqual(Array.from(data)); // nothing lost, nothing doubled
  });
  it("gives up with the error once it is at the smallest piece", async () => {
    await expect(sendBytes(sink([], () => true), new Uint8Array(100), { chunk: 40, minChunk: 20, sleep: noWait })).rejects.toThrow("GATT write failed");
  });
  it("sends nothing for no bytes", async () => {
    const sizes: number[] = [];
    expect(await sendBytes(sink(sizes), new Uint8Array(0), { chunk: 100, sleep: noWait })).toBe(100);
    expect(sizes).toEqual([]);
  });
});

describe("error wording", () => {
  const err = (name: string, message = "") => Object.assign(new Error(message), { name });
  it("says what to do, not what the browser said", () => {
    expect(explainError(err("NotFoundError", "User cancelled the requestDevice() chooser."), "bluetooth")).toBe("No printer was chosen.");
    expect(explainError(err("NotFoundError", "No device selected."), "usb")).toBe("No printer was chosen.");
    expect(explainError(err("NetworkError", "GATT Error: Not supported."), "bluetooth")).toMatch(/another phone, tablet or PC/);
    expect(explainError(err("NotAllowedError"), "bluetooth")).toMatch(/Location/);
    expect(explainError(err("SecurityError", "Access denied."), "usb")).toMatch(/USB/);
    expect(explainError(err("InvalidStateError"))).toMatch(/lost/);
    expect(explainError(new Error("claimInterface: Access denied"))).toMatch(/holding the USB printer/);
    expect(explainError(new Error("Something odd"))).toBe("Something odd");
    expect(explainError(undefined)).toBe("Printing did not work.");
  });
});
