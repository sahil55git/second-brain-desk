import { describe, expect, it } from "vitest";
import { canDelete, canEdit, parseMoney, parsePositive, staffRateOk } from "@/lib/editRules";
import { businessDate } from "@/lib/register";
import { auditToCsv } from "@/lib/auditFormat";

const owner = { isOwner: true };
const staff = { isOwner: false };

describe("canDelete / canEdit", () => {
  it("owner may touch any day", () => {
    expect(canDelete(owner, "2026-01-01", "2026-11-10")).toBe(true);
    expect(canEdit(owner, "2026-01-01", "2026-11-10")).toBe(true);
    expect(canDelete(owner, "2026-11-10", "2026-11-10")).toBe(true);
  });
  it("staff may touch only today's record", () => {
    expect(canDelete(staff, "2026-11-10", "2026-11-10")).toBe(true);
    expect(canEdit(staff, "2026-11-10", "2026-11-10")).toBe(true);
    expect(canDelete(staff, "2026-11-09", "2026-11-10")).toBe(false);
    expect(canEdit(staff, "2026-11-09", "2026-11-10")).toBe(false);
  });
  it("a timestamp is judged by its India business date, not its UTC date", () => {
    // 1:00 am on 10 Nov in India is 7:30 pm on 9 Nov in UTC.
    const lateNight = new Date("2026-11-09T19:30:00Z");
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-11-09"); // the trap
    expect(businessDate(lateNight)).toBe("2026-11-10");
    expect(canEdit(staff, businessDate(lateNight), "2026-11-10")).toBe(true);
    // 11:30 pm on 9 Nov in India is still the 9th in UTC too: yesterday for a 10 Nov caller.
    expect(canEdit(staff, businessDate(new Date("2026-11-09T18:00:00Z")), "2026-11-10")).toBe(false);
  });
});

describe("staffRateOk", () => {
  it("allows the standard rate give or take ₹1", () => {
    expect(staffRateOk(10, 10)).toBe(true);
    expect(staffRateOk(11, 10)).toBe(true);
    expect(staffRateOk(9, 10)).toBe(true);
    expect(staffRateOk(11.01, 10)).toBe(false);
    expect(staffRateOk(8, 10)).toBe(false);
    expect(staffRateOk(Number.NaN, 10)).toBe(false);
  });
});

describe("parsePositive / parseMoney", () => {
  it("parsePositive accepts only finite numbers above zero", () => {
    expect(parsePositive(120)).toBe(120);
    expect(parsePositive("120.5")).toBe(120.5);
    for (const bad of [0, -3, "abc", "", null, undefined, Number.NaN, Infinity, {}, [], true]) {
      expect(parsePositive(bad)).toBeNull();
    }
  });
  it("parseMoney accepts zero and up, treats blank as zero, rejects the rest", () => {
    expect(parseMoney(0)).toBe(0);
    expect(parseMoney(250.5)).toBe(250.5);
    expect(parseMoney("300")).toBe(300);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney(null)).toBe(0);
    for (const bad of [-1, "-5", "abc", Number.NaN, Infinity, {}, [], true]) {
      expect(parseMoney(bad)).toBeNull();
    }
  });
});

describe("auditToCsv", () => {
  it("lists when, who, action, record and summary — no JSON", () => {
    const csv = auditToCsv([
      { id: "a1", at: "2026-11-10T10:00:00Z", by: "Nilkant", isOwner: false, action: "DELETE", entity: "Expense", entityId: "e1", summary: 'Tea, Rs 40 "cash"' },
    ]);
    const [head, line] = csv.split("\n");
    expect(head).toBe("at,by,action,entity,entityId,summary");
    expect(line).toContain("Nilkant,DELETE,Expense,e1,");
    expect(line).toContain('"Tea, Rs 40 ""cash"""');
    expect(csv).not.toContain("before");
  });
});
