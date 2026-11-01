import { describe, expect, it } from "vitest";
import { barrelCounts, bearer, cleanDeviceName, hashDeviceToken, looksLikeToken, newDeviceToken, widgetAlerts } from "../deviceToken";
import { parseTime, reminderNotification, REMINDERS, toBase64 } from "../native";

describe("phone widget keys", () => {
  it("makes long random keys and keeps only their hash", () => {
    const a = newDeviceToken(), b = newDeviceToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(hashDeviceToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(a)).toBe(hashDeviceToken(a));
  });
  it("reads only Bearer widget keys", () => {
    const t = newDeviceToken();
    expect(bearer(`Bearer ${t}`)).toBe(t);
    expect(bearer("Bearer abc")).toBeNull();
    expect(bearer(null)).toBeNull();
    expect(cleanDeviceName("  Redmi   Note 12 ")).toBe("Redmi Note 12");
    expect(cleanDeviceName(5)).toBe("Android phone");
  });
});

describe("widget summary", () => {
  const now = new Date("2026-11-01T10:00:00Z").getTime();
  const day = 86400000;
  it("counts barrels to weigh and waiting, and the old ones", () => {
    const b = barrelCounts([
      { grossKg: null, emptyKg: null, grossAt: null },
      { grossKg: 190, emptyKg: null, grossAt: new Date(now - 9 * day) },
      { grossKg: 190, emptyKg: null, grossAt: new Date(now - 2 * day) },
      { grossKg: 190, emptyKg: 18, grossAt: new Date(now - 20 * day) },
    ], now);
    expect(b).toEqual({ toWeighFull: 1, waitingEmpty: 2, waitingLong: 1, oldestDays: 9 });
  });
  it("alerts: barrels a week old, cash after 8 pm, low stock, overdue job-work; staff get barrels only", () => {
    const b = { toWeighFull: 0, waitingEmpty: 2, waitingLong: 1, oldestDays: 9 };
    const m = { today: "2026-11-01", cashCounted: false, lowStock: ["Sunflower 15L"], jobWorkOverdue: 2 };
    expect(widgetAlerts(b, m, 21, "2026-11-01").map((a) => a.url)).toEqual(["/barrels?weigh=empty", "/cash", "/stock", "/?desk=jobwork"]);
    expect(widgetAlerts(b, m, 15, "2026-11-01").some((a) => a.url === "/cash")).toBe(false);
    expect(widgetAlerts(b, null, 21, "2026-11-01")).toHaveLength(1);
    expect(widgetAlerts({ ...b, waitingLong: 0 }, { ...m, cashCounted: true, lowStock: [], jobWorkOverdue: 0 }, 22, "d")).toEqual([]);
  });
});

describe("phone helpers", () => {
  it("base64 of bytes", () => {
    expect(toBase64(new Uint8Array([77, 97, 104]))).toBe("TWFo");
    expect(toBase64(new Uint8Array(100000)).length).toBe(133336);
  });
  it("reminder times and notifications", () => {
    expect(parseTime("20:30")).toEqual({ hour: 20, minute: 30 });
    expect(parseTime("25:00")).toBeNull();
    const stock = REMINDERS.find((r) => r.key === "stock")!;
    expect(reminderNotification(stock, 9, 15)).toMatchObject({ id: stock.id, extra: { url: "/stock" }, schedule: { on: { hour: 9, minute: 15, weekday: 1 } } });
  });
});
