import { describe, expect, it } from "vitest";
import { needsEnglish, toEnglish } from "../lang";
import { parseVoice } from "../voice";
import { parseCommand } from "../bot/parse";

describe("toEnglish", () => {
  it("Hindi sentence", () => {
    expect(toEnglish("दो सौ रुपये का सरसों तेल बेचा रमेश को")).toBe("200 rs mustard oil sold रमेश to");
    expect(toEnglish("पांच किलो मूंगफली तेल नकद")).toBe("5 kg groundnut oil cash");
  });
  it("Hinglish and Kannada", () => {
    expect(toEnglish("10 kilo sarson tel becha 180 rate udhar")).toContain("mustard oil sold 180 rate udhaar");
    expect(toEnglish("ಎರಡು ಡಬ್ಬಿ ಸಾಸಿವೆ ಎಣ್ಣೆ ಮಾರಿದೆ")).toBe("ಎರಡು tin mustard oil sold");
    expect(toEnglish("ರಮೇಶ್‌ಗೆ ೫ ಕಿಲೋ")).toContain("5 kg");
  });
  it("knows when to translate", () => {
    expect(needsEnglish("today")).toBe(false);
    expect(needsEnglish("aaj kitna galla")).toBe(true);
    expect(needsEnglish("आज")).toBe(true);
  });
});

describe("voice + chat understand Hindi", () => {
  it("voice entry", () => {
    const a = parseVoice("पांच किलो मूंगफली तेल बेचा 190 rate नकद");
    expect(a).toMatchObject({ type: "entry", kind: "SALE", item: "groundnut", qty: 5, rate: 190, mode: "CASH" });
  });
  it("Hindi purchase and udhaar back", () => {
    expect(parseVoice("उधार वापस आया 500 रुपये")).toMatchObject({ kind: "UDHAAR_IN", amount: 500 });
    expect(parseVoice("दो बोरी बीज खरीदा")).toMatchObject({ kind: "PURCHASE", item: "seed", qty: 2 });
  });
  it("chat commands", () => {
    expect(parseCommand("आज का हिसाब").t).toBe("summary");
    expect(parseCommand("स्टॉक").t).toBe("stock");
  });
});
