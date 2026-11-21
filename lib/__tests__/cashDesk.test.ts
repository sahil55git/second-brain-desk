import { describe, expect, it } from "vitest";
import { cashReceived, changeFor, noteChips } from "../cashDesk";

describe("cashier desk", () => {
  it("change or shortfall", () => {
    expect(changeFor(460, 500)).toEqual({ change: 40, short: 0 });
    expect(changeFor(460, 460)).toEqual({ change: 0, short: 0 });
    expect(changeFor(460, 400)).toEqual({ change: 0, short: 60 });
    expect(changeFor(99.5, 100)).toEqual({ change: 0.5, short: 0 });
  });
  it("quick notes: exact first, then round figures above it", () => {
    expect(noteChips(460)).toEqual([460, 500]);
    expect(noteChips(1234.5)).toEqual([1235, 1300, 1500]);
    expect(noteChips(30)).toEqual([30, 50, 100, 500]);
    expect(noteChips(150)).toEqual([150, 200, 500]);
    expect(noteChips(1050)).toEqual([1050, 1100, 1500]);
    expect(noteChips(21.08)).toEqual([22, 50, 100, 500]);
    expect(noteChips(500)).toEqual([500, 1000, 1500]);
    expect(noteChips(1234.5).includes(2000)).toBe(false);
    expect(noteChips(1234.5)[0]).toBe(1235);
    expect(noteChips(0)).toEqual([]);
  });
  it("cash received counts bills taken at once and held bills once confirmed", () => {
    const b = (modes: Record<string, number>, track: object) => ({ modes, track: track as never });
    expect(
      cashReceived([
        b({ CASH: 100 }, {}),
        b({ CASH: 200 }, { handover: "HELD", cashWait: true }),
        b({ CASH: 300 }, { handover: "HELD", cashWait: true, cashOk: { at: "x", by: "y" } }),
        b({ UPI: 400 }, { handover: "HELD" }),
        b({ CASH: 50, UPI: 50 }, { handover: "GIVEN" }),
      ])
    ).toBe(450);
  });
});
