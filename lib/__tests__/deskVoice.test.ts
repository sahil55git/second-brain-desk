import { describe, expect, it } from "vitest";
import { deskCommand, spokenBillNumber, voiceCashDue } from "../deskVoice";

describe("Android desk commands", () => {
  it.each([
    ["bill no. 21 return", "return", "21"], ["return bill", "return", ""],
    ["cancel bill number thirty-five", "cancel", "35"], ["bill 12 cancel", "cancel", "12"],
    ["cash received for bill no. 12", "cash", "12"], ["ಬಿಲ್ ಸಂಖ್ಯೆ ೧೨ ನಗದು ಬಂದಿದೆ", "cash", "12"],
  ])("understands %s", (text, action, no) => expect(deskCommand(text)).toEqual({ action, no }));
  it.each(["discount", "open discount", "give discount", "open dicount"])("opens the editor for %s", text =>
    expect(deskCommand(text)).toEqual({ action: "discount" }));
  it.each(["received all pending bill", "all pending bills paid"])("selects pending money for %s", text =>
    expect(deskCommand(text)).toEqual({ action: "all" }));
  it.each(["do not cancel bill 2", "cancel bill 2 and 3", "bill 2.3 return", "cash received for bill 0", "all bills", "give discount 100"])("rejects %s", text =>
    expect(deskCommand(text)).toBeNull());
  it("accepts a spoken bill number as the second step", () => {
    expect(spokenBillNumber("forty six")).toBe("46");
    expect(spokenBillNumber("twenty zero")).toBeNull();
  });
});


describe("cash received for one bill", () => {
  const track = { handover: "HELD" as const, cashWait: true };
  it("accepts pending cash and an unassigned payment", () => {
    expect(voiceCashDue({ track, modes: { CASH: 50 }, total: 50 })).toBe(true);
    expect(voiceCashDue({ track: { ...track, payPending: true }, modes: {}, total: 50 })).toBe(true);
  });
  it("excludes UPI, credit, legacy untracked bills and cash already received", () => {
    expect(voiceCashDue({ track, modes: { UPI: 40, CREDIT: 10 }, total: 50 })).toBe(false);
    expect(voiceCashDue({ track: {}, modes: { CASH: 50 }, total: 50 })).toBe(false);
    expect(voiceCashDue({ track: { ...track, cashOk: { at: "now", by: "staff" } }, modes: { CASH: 50 }, total: 50 })).toBe(false);
  });
});
