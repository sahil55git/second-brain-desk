import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cleanSettings, filterStaff, lateSuggestions, minutesLate, parseQuickEntry } from "@/lib/staffRules";

// 9:52 AM India time = 04:22 UTC
const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 13, h, m) - 330 * 60000).toISOString();
const emps = [{ id: "r", name: "Ramesh Patil" }, { id: "s", name: "Suresh Kumar" }, { id: "g", name: "Ganesh Patil" }];

describe("late arrival", () => {
  it("is on time inside the grace (open 9:30 + 10 min)", () => {
    expect(minutesLate(at(9, 40), "09:30", 10)).toBe(0);
    expect(minutesLate(at(9, 20), "09:30", 10)).toBe(0);
  });
  it("is late after 9:40, counted from opening", () => {
    expect(minutesLate(at(9, 41), "09:30", 10)).toBe(11);
    expect(minutesLate(at(9, 52), "09:30", 10)).toBe(22);
  });
  it("ignores missing or bad times", () => {
    expect(minutesLate(null, "09:30", 10)).toBe(0);
    expect(minutesLate("nope", "09:30", 10)).toBe(0);
  });
  it("suggests one deduction per late person, skips absent and already-applied", () => {
    const rows = [
      { employeeId: "r", inAt: at(9, 52), status: "P" },
      { employeeId: "s", inAt: at(9, 35), status: "P" },
      { employeeId: "g", inAt: at(10, 30), status: "A" },
    ];
    const names = { r: "Ramesh", s: "Suresh", g: "Ganesh" };
    const out = lateSuggestions(rows, names, DEFAULT_SETTINGS, "2026-11-13", new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ employeeId: "r", minutes: 22, amountInr: 50, done: false });
    expect(out[0].note).toContain("[late:2026-11-13]");
    expect(lateSuggestions(rows, names, DEFAULT_SETTINGS, "2026-11-13", new Set(["r"]))[0].done).toBe(true);
  });
});

describe("settings", () => {
  it("falls back to safe defaults", () => {
    const s = cleanSettings({ openTime: "25:99", graceMin: -5, lateCutInr: "x", rules: "no" });
    expect(s.openTime).toBe("09:30");
    expect(s.graceMin).toBe(10);
    expect(s.lateCutInr).toBe(50);
    expect(s.rules.length).toBeGreaterThan(0);
  });
  it("keeps custom rules, drops bad ones, makes ids unique", () => {
    const s = cleanSettings({ openTime: "08:45", graceMin: 5, lateCutInr: 30, rules: [
      { label: "Phone on shop floor", kind: "CUT", amountInr: 20 },
      { label: "Phone on shop floor", kind: "CUT", amountInr: 25 },
      { label: "x", amountInr: 5 },
      { label: "No amount", amountInr: 0 },
      { label: "Festival gift", kind: "BONUS", amountInr: 500 },
    ] });
    expect(s.openTime).toBe("08:45");
    expect(s.rules.map((r) => r.label)).toEqual(["Phone on shop floor", "Phone on shop floor", "Festival gift"]);
    expect(new Set(s.rules.map((r) => r.id)).size).toBe(3);
    expect(s.rules[2].kind).toBe("BONUS");
  });
});

describe("quick entry (typed or spoken)", () => {
  it("late + amount", () => {
    expect(parseQuickEntry("ramesh late 50", emps, DEFAULT_SETTINGS)).toMatchObject({ employeeId: "r", type: "CUT", amountInr: 50, note: "Late arrival" });
  });
  it("late with no amount uses the late rule amount", () => {
    expect(parseQuickEntry("suresh was late", emps, DEFAULT_SETTINGS)).toMatchObject({ employeeId: "s", type: "CUT", amountInr: 50 });
  });
  it("a saved reason fills type and amount", () => {
    expect(parseQuickEntry("ganesh oil not crushed for own sale", emps, DEFAULT_SETTINGS)).toMatchObject({ employeeId: "g", type: "CUT", amountInr: 50, ruleId: "oil-not-crushed" });
  });
  it("bonus and advance with UPI", () => {
    expect(parseQuickEntry("suresh bonus 200", emps, DEFAULT_SETTINGS)).toMatchObject({ employeeId: "s", type: "BONUS", amountInr: 200 });
    expect(parseQuickEntry("ramesh advance 500 rupees upi", emps, DEFAULT_SETTINGS)).toMatchObject({ employeeId: "r", type: "ADV", amountInr: 500, mode: "UPI" });
  });
  it("two people with the same word is not guessed", () => {
    expect(parseQuickEntry("patil late 50", emps, DEFAULT_SETTINGS).employeeId).toBeNull();
  });
  it("words as numbers", () => {
    expect(parseQuickEntry("ramesh fine two hundred", emps, DEFAULT_SETTINGS).amountInr).toBe(200);
  });
});

describe("search", () => {
  it("finds by name, role or phone", () => {
    const l = [{ name: "Ramesh", role: "Operator", phone: "98450" }, { name: "Suresh", role: "Loader", phone: null }];
    expect(filterStaff(l, "ram")).toHaveLength(1);
    expect(filterStaff(l, "load")).toHaveLength(1);
    expect(filterStaff(l, "9845")).toHaveLength(1);
    expect(filterStaff(l, "")).toHaveLength(2);
  });
});
