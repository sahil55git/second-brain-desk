import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Bills page: compact search, select many, hold money", () => {
  const app = read("components/counter/CounterApp.tsx");
  const rp = read("components/counter/ReceivePayment.tsx");
  const css = read("components/counter/counter.css");
  it("search bar no longer stretches in the column sheet", () => {
    expect(css).toMatch(/\.ctr-search \{ flex: 0 0 auto; height: 40px/);
  });
  it("can select several bills and finish them together", () => {
    expect(app).toContain("runBulk");
    expect(app).toContain("All pending paid");
    expect(app).toContain("Pending only");
    expect(app).toContain("Oil held only");
    expect(app).toContain('"handover", { value: "GIVEN" }');
  });
  it("pay dialog has Hold and a labelled green button", () => {
    expect(rp).toContain("onHold");
    expect(rp).toContain("Money received");
    expect(rp).toContain("Give oil");
    expect(app).toContain("counterRecvHold");
  });
});

describe("printer status pill", () => {
  it("Weigh & Bill top bar has a printer pill that opens the printer set-up", () => {
    const app = readFileSync(join(process.cwd(), "components/counter/CounterApp.tsx"), "utf8");
    const chip = readFileSync(join(process.cwd(), "components/print/PrinterChip.tsx"), "utf8");
    expect(app).toContain("<PrinterChip");
    expect(chip).toContain("SlipPrinterSetup");
    expect(chip).toContain("Bluetooth off");
  });
});
