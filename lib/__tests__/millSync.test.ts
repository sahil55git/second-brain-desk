// The Mill Desk must never make a second copy of anything in the main app. These tests run the real sync
// functions against an in-memory stand-in for the database and save every kind of thing twice (and three
// times, and out of order): the main tables must hold exactly one row for each.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, t, fake, resetIds } = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const tables: Record<string, Row[]> = {};
  const t = (n: string) => (tables[n] ||= []);
  const dup = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  let cuid = 0;
  function matches(r: Row, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "contains" in (v as object)) return String(r[k] ?? "").includes((v as { contains: string }).contains);
      if (v && typeof v === "object" && "lte" in (v as object)) return (r[k] as number) <= (v as { lte: number }).lte;
      if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(r[k]);
      return r[k] === v;
    });
  }
  const model = (name: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => t(name).find((r) => matches(r, where)) ?? null,
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => t(name).find((r) => matches(r, where)) ?? null,
    count: async ({ where }: { where?: Record<string, unknown> } = {}) => t(name).filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) || `c${++cuid}`;
      if (t(name).some((r) => r.id === id)) throw dup();
      const row = { updatedAt: new Date(), createdAt: new Date(), ...data, id } as Row;
      t(name).push(row);
      return row;
    },
    update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = t(name).find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data, { updatedAt: new Date(Date.now() + 1) });
      return row;
    },
  });
  const fake: Record<string, unknown> = {
    jobWorkIntake: model("jobWorkIntake"),
    opsRecord: model("opsRecord"),
    mfgBatch: model("mfgBatch"),
    fleetBarrel: model("fleetBarrel"),
    fleetEvent: model("fleetEvent"),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(fake),
  };
  return { tables, t, fake, resetIds: () => { cuid = 0; } };
});
type Row = Record<string, unknown> & { id: string };
vi.mock("@/lib/db", () => ({ prisma: fake }));

import { syncBarrel, syncJob, syncOil, syncRun } from "@/lib/mill/millSync";
import { settledByUpi, jobWorkCashEvents, jobWorkUpiEvents, dayTotals } from "@/lib/register";
import { ledgerMoves, stockLedger, ledgerCounts } from "@/lib/stockLedger";
import { khaliStack, transferData, ownOil } from "@/lib/mill/millMap";

const job = (o: Record<string, unknown> = {}) => ({ id: "Jabc1", tok: "JW-0001", customer: "Gundappa", place: "Janawada", seedKg: 500, nb: 10, cake: "SHOP" as const, advC: 0, advA: 0, ...o });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  resetIds();
});

describe("job → one JobWorkIntake", () => {
  it("saving the same job many times makes one intake", async () => {
    for (let i = 0; i < 4; i++) await syncJob(job() as never, "Raju");
    expect(t("jobWorkIntake")).toHaveLength(1);
  });
  it("a job made before fixed ids (found by its mark) is updated, not copied", async () => {
    t("jobWorkIntake").push({ id: "old-cuid", customer: "x", seedKg: 500, settled: false, notes: "Mill Desk · Token 2 · [mill:Jabc1]" } as Row);
    await syncJob(job() as never, "Raju");
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(t("jobWorkIntake")[0].id).toBe("old-cuid");
  });
  it("two phones saving the same new job at once still make one", async () => {
    await Promise.allSettled([syncJob(job() as never, "A"), syncJob(job() as never, "B")]);
    expect(t("jobWorkIntake")).toHaveLength(1);
  });
  it("paying by UPI is stored once, with the mode", async () => {
    await syncJob(job() as never, "Raju");
    await syncJob(job({ settled: true, method: "upi" }) as never, "Raju");
    await syncJob(job({ settled: true, method: "upi" }) as never, "Raju");
    const rows = t("jobWorkIntake");
    expect(rows).toHaveLength(1);
    expect(rows[0].settled).toBe(true);
    expect(rows[0].settlementMode).toBe("UPI");
    expect(rows[0].settlementAmountInr).toBe(500 * 6);
  });
  it("a job paid on the Job-Work desk keeps its money when the mill saves it again", async () => {
    await syncJob(job() as never, "Raju");
    Object.assign(t("jobWorkIntake")[0], { settled: true, settlementAmountInr: 2500, settlementRatePerKg: 5, settledAt: new Date("2026-11-20T08:00:00Z"), settledByName: "Sahil" });
    await syncJob(job({ settled: false }) as never, "Raju");
    await syncJob(job({ settled: true, method: "cash" }) as never, "Raju");
    const r = t("jobWorkIntake")[0];
    expect(t("jobWorkIntake")).toHaveLength(1);
    expect(r.settlementAmountInr).toBe(2500);
    expect(r.settlementRatePerKg).toBe(5);
    expect(r.settledByName).toBe("Sahil");
  });
});

describe("cash: UPI never reaches the drawer", () => {
  const base = { cakeOwnership: "SHOP" as const, advanceCustomerInr: 0, advanceAutoInr: 0, settled: true, settlementAmountInr: 1000, settledAt: "2026-11-20T10:00:00Z", createdAt: "2026-11-20T08:00:00Z" };
  it("cash settlement is a cash event, UPI settlement is not", () => {
    expect(jobWorkCashEvents({ ...base, settlementMode: "CASH" })).toHaveLength(1);
    expect(jobWorkCashEvents({ ...base, settlementMode: null })).toHaveLength(1);
    expect(jobWorkCashEvents({ ...base, settlementMode: "UPI" })).toHaveLength(0);
    expect(settledByUpi({ settlementMode: "upi" })).toBe(true);
  });
  it("a UPI settlement is counted once, on the UPI side only", () => {
    const upi = { ...base, settlementMode: "UPI" };
    const cash = jobWorkCashEvents(upi);
    const u = jobWorkUpiEvents(upi);
    expect(cash).toHaveLength(0);
    expect(u).toEqual([{ at: +new Date(base.settledAt), amount: -1000, bucket: "jwOut" }]);
    expect(jobWorkUpiEvents({ ...base, settlementMode: "CASH" })).toHaveLength(0);
    const day = dayTotals([], cash, u);
    expect(day.jwOut).toBe(0);
    expect(day.upiOut).toBe(1000);
  });
  it("advances at intake stay cash either way", () => {
    expect(jobWorkCashEvents({ ...base, settled: false, advanceCustomerInr: 300, settlementMode: "UPI" })).toHaveLength(1);
  });
});

describe("our oil → the stock ledger, once", () => {
  const own = { id: "O1", v: [15.2, "K2"], date: "2026-11-20", by: "Mahesh" };
  it("the same weighing sent again makes one transfer", async () => {
    expect(await syncOil(own)).toBe("created");
    expect(await syncOil(own)).toBe("exists");
    expect(await syncOil(own)).toBe("exists");
    expect(t("opsRecord").filter((r) => r.kind === "mill_transfer")).toHaveLength(1);
  });
  it("floor barrel and small tank oil count as Karadi stock too", async () => {
    await syncOil({ ...own, id: "O2", v: [16.1, "Floor barrel"] });
    await syncOil({ ...own, id: "O3", v: [4, "Small tank"] });
    const moves = ledgerMoves({ register: [], sales: [], purchases: [] } as never, t("opsRecord").map((r) => ({ id: r.id, kind: r.kind as string, date: r.date as string, data: r.data as Record<string, unknown>, createdAt: (r.createdAt as Date).toISOString() })));
    expect(moves.moves.map((m) => [m.product, m.kg, m.dir])).toEqual([["k2", 16.1, "in"], ["k2", 4, "in"]]);
  });
  it("the oil adds to the Karadi stock once and moves it by exactly the oil weighed", async () => {
    await syncOil(own);
    await syncOil(own);
    const ops = t("opsRecord").map((r) => ({ id: r.id, kind: r.kind as string, date: r.date as string, data: r.data as Record<string, unknown>, createdAt: new Date("2026-11-20T09:00:00+05:30").toISOString() }));
    const { moves, notCounted } = ledgerMoves({ register: [], sales: [], purchases: [] } as never, ops);
    const counts = ledgerCounts([{ date: "2026-11-19", session: "NIGHT", stock: { k2: { today: 100 }, karadi1: { today: 400 } } }] as never);
    const row = stockLedger(moves, counts, notCounted, "2026-11-20").rows.find((r) => r.key === "karadi")!;
    expect(row.carriedKg).toBeCloseTo(100 + 400 + 15.2, 6);
    expect(row.bookKg).toBeCloseTo(100 + 400 + 15.2, 6);
  });
  it("rejects a weight that is not a number", async () => {
    expect(await syncOil({ ...own, id: "O9", v: [0, "K2"] })).toBe("skipped");
    expect(await syncOil({ ...own, id: "O9", v: "x" })).toBe("skipped");
    expect(ownOil("a", [Number.NaN, "K2"])).toBeNull();
  });
  it("transfer data passes the existing transfer check", () => {
    const d = transferData(ownOil("a", [10, "K2"])!);
    expect(d.toTank).toBe("k2");
    expect(d.mill).toBe("Mill 1");
    expect(d.oilKg).toBe(10);
  });
});

describe("run → one Manufacturing batch", () => {
  const run = { id: "R1", time: "20 Nov 08:30 AM", seedKg: 287.4, nb: 6, state: "oil", oil: [[15.2, "K2"], [16.1, "K2"]] as [number, string][] };
  it("no batch until oil is weighed", async () => {
    expect(await syncRun({ ...run, oil: [] }, "2026-11-20", 1)).toBe("waiting");
    expect(t("mfgBatch")).toHaveLength(0);
  });
  it("saving the run again and again keeps one batch and updates the oil", async () => {
    await syncRun(run, "2026-11-20", 1);
    await syncRun(run, "2026-11-20", 1);
    await syncRun({ ...run, oil: [...run.oil, [17, "K2"]] }, "2026-11-20", 1);
    const b = t("mfgBatch");
    expect(b).toHaveLength(1);
    expect(b[0].step1Kg).toBeCloseTo(48.3, 6);
    expect((b[0].suppliers as { seedKg: number }[])[0].seedKg).toBe(287.4);
    expect(b[0].mill).toBe("Mill 1");
  });
  it("steps 2–4 typed on the Manufacturing screen survive a later mill save", async () => {
    await syncRun(run, "2026-11-20", 1);
    Object.assign(t("mfgBatch")[0], { step2Kg: 20, step3Kg: 25, barrel: "A1" });
    await syncRun({ ...run, oil: [...run.oil, [17, "K2"]] }, "2026-11-20", 1);
    const b = t("mfgBatch")[0];
    expect(b.step2Kg).toBe(20);
    expect(b.step3Kg).toBe(25);
    expect(b.barrel).toBe("A1");
  });
  it("a batch found by its mark (older) is reused", async () => {
    t("mfgBatch").push({ id: "old1", notes: "Mill Desk · Run 1 · [mill-run:R1]", suppliers: [], step1Kg: 1, barrel: "Run 1" } as Row);
    await syncRun(run, "2026-11-20", 1);
    expect(t("mfgBatch")).toHaveLength(1);
  });
});

describe("barrel → one fleet record per weighing", () => {
  const reg = (o: Record<string, unknown> = {}) =>
    t("fleetBarrel").push({ id: "b3", code: "BRL-03", status: "EMPTY", tareKg: 18, grossKg: null, netKg: null, lastEmptyKg: 18, capacityKg: 190, active: true, condition: "OK", location: "SHOP", updatedAt: new Date(), ...o } as Row);
  it("a full weight is recorded once, however often it is saved", async () => {
    reg();
    expect(await syncBarrel({ id: "BRL-03", full: 180.1 }, "Raju")).toBe("recorded");
    expect(await syncBarrel({ id: "BRL-03", full: 180.1 }, "Raju")).toBe("already recorded");
    expect(await syncBarrel({ id: "BRL-03", full: 180.1 }, "Raju")).toBe("already recorded");
    expect(t("fleetEvent")).toHaveLength(1);
    expect(t("fleetBarrel")[0]).toMatchObject({ status: "FULL", grossKg: 180.1, netKg: 162.1 });
  });
  it("emptied: recorded once, with the oil poured", async () => {
    reg({ status: "FULL", grossKg: 180.1, netKg: 162.1 });
    expect(await syncBarrel({ id: "BRL-03", full: 180.1, empty: 18.2 }, "Raju")).toBe("recorded");
    expect(await syncBarrel({ id: "BRL-03", full: 180.1, empty: 18.2 }, "Raju")).toBe("already recorded");
    expect(t("fleetEvent")).toHaveLength(1);
    expect((t("fleetEvent")[0].netKg as number)).toBeCloseTo(161.9, 6);
    expect(t("fleetBarrel")[0]).toMatchObject({ status: "EMPTY", lastEmptyKg: 18.2 });
  });
  it("a barrel with no tare is not weighed full; its first empty weight becomes the tare", async () => {
    reg({ status: "NEW", tareKg: null, lastEmptyKg: null });
    expect(await syncBarrel({ id: "BRL-03", full: 180 }, "Raju")).toMatch(/no tare/);
    expect(t("fleetEvent")).toHaveLength(0);
    expect(await syncBarrel({ id: "BRL-03", empty: 18.4 }, "Raju")).toBe("recorded");
    expect(t("fleetBarrel")[0].tareKg).toBe(18.4);
  });
  it("an unregistered barrel and a sent-out barrel record nothing", async () => {
    expect(await syncBarrel({ id: "BRL-77", full: 180 }, "Raju")).toMatch(/not registered/);
    reg();
    expect(await syncBarrel({ id: "BRL-03", out: true }, "Raju")).toMatch(/sent out/);
    expect(t("fleetEvent")).toHaveLength(0);
  });
});

describe("khali stack", () => {
  it("bags in minus khali sold since the first bag", () => {
    const s = khaliStack(
      [{ date: "2026-11-20", kg: 44.1 }, { date: "2026-11-20", kg: 43.6 }, { date: "2026-11-21", kg: 45.2 }],
      [{ date: "2026-11-10", kg: 500 }, { date: "2026-11-21", kg: 60 }]
    );
    expect(s.inKg).toBe(132.9);
    expect(s.soldKg).toBe(60);
    expect(s.stackKg).toBe(72.9);
    expect(s.bags).toBe(3);
    expect(khaliStack([], [{ date: "2026-11-21", kg: 5 }])).toMatchObject({ stackKg: 0, soldKg: 0, since: null });
  });
});
