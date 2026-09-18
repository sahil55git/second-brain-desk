import { describe, expect, it } from "vitest";
import { applyCanFallback, parseCanMentions } from "../canParser";

describe("parseCanMentions", () => {
  it("reads a bare '15 kg can' mention as one can15", () => {
    expect(parseCanMentions("customer took a 15 kg can")).toEqual({ can15: 1 });
  });

  it("reads '15kg can' with no space the same way", () => {
    expect(parseCanMentions("15kg can taken")).toEqual({ can15: 1 });
  });

  it("defaults an unqualified 5 kg can to can5new", () => {
    expect(parseCanMentions("took one 5 kg can")).toEqual({ can5new: 1 });
  });

  it("routes 'old' explicitly to can5old", () => {
    expect(parseCanMentions("2 x 5 kg old cans")).toEqual({ can5old: 2 });
  });

  it("routes 'new' explicitly to can5new", () => {
    expect(parseCanMentions("three 5kg new cans")).toEqual({ can5new: 3 });
  });

  it("sums multiple mentions of the same size/type", () => {
    expect(parseCanMentions("one 15 kg can and another 15 kg can")).toEqual({ can15: 2 });
  });

  it("handles mixed mentions in one sentence", () => {
    expect(parseCanMentions("Ramesh took a 15 kg can and 2 5 kg old cans")).toEqual({
      can15: 1,
      can5old: 2,
    });
  });

  it("returns nothing for text with no can mention", () => {
    expect(parseCanMentions("Ramesh Patil, 120kg seed, shop keeps cake")).toEqual({});
  });

  it("does not misfire on an unrelated kg figure", () => {
    expect(parseCanMentions("seed 15 kg")).toEqual({});
  });
});

describe("applyCanFallback", () => {
  it("only applies to the jobwork desk", () => {
    expect(applyCanFallback("closing", "15 kg can", { notes: "x" })).toEqual({ notes: "x" });
  });

  it("merges detected cans over the AI's fields without touching other keys", () => {
    const aiFields = { customer: "Ramesh", notes: "oil can 15 kg can" };
    expect(applyCanFallback("jobwork", "Ramesh, a 15 kg can", aiFields)).toEqual({
      customer: "Ramesh",
      notes: "oil can 15 kg can",
      can15: 1,
    });
  });

  it("overrides an AI-guessed can value with the regex-detected count", () => {
    const aiFields = { can15: 99 };
    expect(applyCanFallback("jobwork", "one 15 kg can", aiFields)).toEqual({ can15: 1 });
  });

  it("leaves fields untouched when no can mention is present", () => {
    const aiFields = { customer: "Ramesh", seedKg: 120 };
    expect(applyCanFallback("jobwork", "Ramesh, 120kg seed", aiFields)).toEqual(aiFields);
  });
});
