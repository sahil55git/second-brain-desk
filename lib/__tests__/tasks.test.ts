import { describe, expect, it } from "vitest";
import { dueText, parseTask, taskWords } from "@/lib/tasks";

const SUN = "2026-11-01"; // a Sunday

describe("tasks from the chat", () => {
  it("finds the task words", () => {
    expect(taskWords("remind me friday to pay digwal")).toBe("friday to pay digwal");
    expect(taskWords("todo order tins")).toBe("order tins");
    expect(taskWords("remind ramesh")).toBeNull();
  });
  it("reads the day and the time", () => {
    expect(parseTask("friday to pay digwal", SUN)).toEqual({ text: "Pay digwal", due: "2026-11-06", dueTime: null });
    expect(parseTask("tomorrow 5 pm call ramesh", SUN)).toEqual({ text: "Call ramesh", due: "2026-11-02", dueTime: "17:00" });
    expect(parseTask("order tins in 3 days", SUN)).toMatchObject({ text: "Order tins", due: "2026-11-04" });
    expect(parseTask("10/11 GST return", SUN)).toMatchObject({ text: "GST return", due: "2026-11-10" });
    expect(parseTask("5th dec renew licence", SUN)).toMatchObject({ text: "Renew licence", due: "2026-12-05" });
    expect(parseTask("next monday bank visit", SUN)).toMatchObject({ due: "2026-11-09" });
    expect(parseTask("check scale", SUN)).toEqual({ text: "Check scale", due: null, dueTime: null });
  });
  it("says when", () => {
    expect(dueText("2026-11-02", "17:00", SUN)).toBe("tomorrow 5 pm");
    expect(dueText("2026-10-30", null, SUN)).toMatch(/overdue/);
    expect(dueText("2026-11-06", null, SUN)).toBe("Friday");
  });
});
