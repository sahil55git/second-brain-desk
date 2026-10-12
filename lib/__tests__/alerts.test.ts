import { describe, expect, it } from "vitest";
import { deskAlerts } from "../alerts";
import type { ItemDTO } from "../types";

const item = (over: Partial<ItemDTO>): ItemDTO => ({
  id: "i1", name: "Rice Bran 1 L", sku: null, unit: "pouch", hsnCode: null, gstRatePct: null, barcode: null,
  openingStockQty: 0, reorderLevelQty: 50, notes: null, active: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "", ...over,
});

const empty = { sales: [], purchases: [], expenses: [], jobWork: [], mfg: [], closings: [], items: [] };

describe("main desk alerts", () => {
  it("low stock becomes a caution that opens the inventory desk", () => {
    const alerts = deskAlerts({ ...empty, items: [item({ openingStockQty: 20 })] }, "2026-10-12");
    const low = alerts.find((a) => a.area === "Stock");
    expect(low?.severity).toBe("caution");
    expect(low?.desk).toBe("inventory");
    expect(low?.action).toBe("Open stock");
  });
  it("healthy stock raises no alert", () => {
    const alerts = deskAlerts({ ...empty, items: [item({ openingStockQty: 500 })] }, "2026-10-12");
    expect(alerts.some((a) => a.area === "Stock")).toBe(false);
  });
  it("critical alerts sort before cautions", () => {
    const alerts = deskAlerts(
      {
        ...empty,
        items: [item({ openingStockQty: 0 })],
        closings: [{ id: "c1", date: "2026-10-12", session: "AFTERNOON", cashMismatch: true, cashDiffInr: -500 } as never],
      },
      "2026-10-12"
    );
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].desk).toBe("closing");
  });
});
