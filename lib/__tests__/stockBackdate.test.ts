import { describe, expect, it } from "vitest";
import { buildTally, sessionStamp } from "../stockTally";

describe("sessionStamp / back-dated stock", () => {
  it("orders closing after midday on the same day and before next morning", () => {
    expect(sessionStamp("2026-10-05", "AFTERNOON").getTime()).toBeLessThan(sessionStamp("2026-10-05", "NIGHT").getTime());
    expect(sessionStamp("2026-10-05", "NIGHT").getTime()).toBeLessThan(sessionStamp("2026-10-06", "AFTERNOON").getTime());
  });
  it("yesterday closing typed late still becomes today's yesterday", () => {
    const rows = [{ createdAt: sessionStamp("2026-10-05", "NIGHT"), stock: { sf: { today: 120 } } as never }];
    const t = buildTally(rows, { sf: { today: 100 } } as never, sessionStamp("2026-10-06", "AFTERNOON"));
    const r = t.rows.find((x) => x.key === "sf");
    expect(r?.computed.yesterday).toBe(120);
  });
});
