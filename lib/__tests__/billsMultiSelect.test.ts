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

describe("Bills reports tab and printer list colours", () => {
  it("Bills page has a Reports tab with the report list", () => {
    const app = readFileSync(join(process.cwd(), "components/counter/CounterApp.tsx"), "utf8");
    const rep = readFileSync(join(process.cwd(), "components/counter/BillReports.tsx"), "utf8");
    expect(app).toContain("<BillReports");
    for (const w of ["Sales by day", "Item-wise", "Payments", "Pending payment", "Oil held", "Discounts", "Cancelled", "Customers", "Staff", "Busy hours", "Custom"]) expect(rep).toContain(w);
  });
  it("printer list follows the counter theme, so names are readable in the dark theme", () => {
    const css = readFileSync(join(process.cwd(), "components/print/slipPrinter.css"), "utf8");
    expect(css).toMatch(/\.sp-dev \{[^}]*color: var\(--c-ink/);
    expect(css).toMatch(/\.sp-dev \{[^}]*background: var\(--c-bg/);
  });
});

describe("Cashier desk is easy to find", () => {
  it("Weigh & Bill top bar links to it; the cashier desk links back; Android has a tile and own icons", () => {
    const app = readFileSync(join(process.cwd(), "components/counter/CounterApp.tsx"), "utf8");
    const cd = readFileSync(join(process.cwd(), "components/counter/CashierDesk.tsx"), "utf8");
    const man = readFileSync(join(process.cwd(), "mobile/android/app/src/main/AndroidManifest.xml"), "utf8");
    expect(app).toContain('href="/register/cashier"');
    expect(cd).toContain('href="/register/counter"');
    expect(man).toContain(".CashierWidget");
    expect(man).toContain(".CashierLauncher");
    expect(man).toContain(".MillLauncher");
  });
});
