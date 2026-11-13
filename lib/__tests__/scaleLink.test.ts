import { describe, expect, it } from "vitest";
import { DEAD_MS, LINK_OFF, linkIsDead, linkLabel, linkReduce, linkRetryDue, retryDelay, RETRY_STEPS_MS, SILENT_MS, type LinkEvent, type LinkState } from "@/lib/scaleLink";

const run = (events: [LinkEvent["type"] | LinkEvent, number][], from: LinkState = LINK_OFF) =>
  events.reduce((s, [e, at]) => linkReduce(s, typeof e === "string" ? ({ type: e } as LinkEvent) : e, at, 0.5), from);

describe("retryDelay", () => {
  it("backs off 1, 2, 4, 8 s and then stays at 15 s for ever", () => {
    expect([1, 2, 3, 4, 5, 6, 50].map((n) => retryDelay(n, 0.5))).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
  it("spreads each wait by at most 15 % either way", () => {
    RETRY_STEPS_MS.forEach((base, i) => {
      expect(retryDelay(i + 1, 0)).toBe(Math.round(base * 0.85));
      expect(retryDelay(i + 1, 1)).toBe(Math.round(base * 1.15));
    });
  });
});

describe("linkReduce", () => {
  it("goes connecting → silent → live, and a weight clears the error and the retry count", () => {
    let s = run([["start", 0]]);
    expect(s.status).toBe("connecting");
    s = run([["opened", 100]], s);
    expect(s).toMatchObject({ status: "silent", openedAt: 100, lastDataAt: null });
    s = run([["data", 300]], s);
    expect(s).toMatchObject({ status: "live", lastDataAt: 300, attempt: 0, error: null });
  });
  it("opening the link alone does not reset the retry count: only a real weight does", () => {
    let s = run([["start", 0], [{ type: "closed", error: "x" }, 10], [{ type: "closed", error: "x" }, 20]]);
    expect(s.attempt).toBe(2);
    s = { ...s, status: "connecting" };
    s = run([["opened", 30]], s);
    expect(s.attempt).toBe(2);
    s = run([["data", 40]], s);
    expect(s.attempt).toBe(0);
  });
  it("a dropped link waits, with the wait growing each time", () => {
    let s = run([["start", 0], ["opened", 0], ["data", 0], [{ type: "closed", error: "gone" }, 1000]]);
    expect(s).toMatchObject({ status: "waiting", attempt: 1, retryAt: 2000, error: "gone" });
    s = run([[{ type: "closed", error: "still gone" }, 2000]], { ...s, status: "connecting" });
    expect(s).toMatchObject({ status: "waiting", attempt: 2, retryAt: 4000 });
    for (let i = 0; i < 20; i++) s = run([[{ type: "closed" }, 0]], { ...s, status: "connecting" });
    expect(s.retryAt).toBe(15000); // never gives up, never waits longer than 15 s
    expect(s.error).toBe("still gone");
  });
  it("shows 'no weight' after 3 s of silence and comes back with the next weight", () => {
    let s = run([["start", 0], ["opened", 0], ["data", 1000]]);
    s = run([["tick", 1000 + SILENT_MS]], s);
    expect(s.status).toBe("live");
    s = run([["tick", 1001 + SILENT_MS]], s);
    expect(s.status).toBe("silent");
    expect(run([["data", 6000]], s).status).toBe("live");
  });
  it("a fatal problem blocks until a person acts", () => {
    const s = run([["start", 0], [{ type: "closed", error: "Allow Nearby devices", fatal: true }, 5]]);
    expect(s).toMatchObject({ status: "blocked", error: "Allow Nearby devices", retryAt: null });
    expect(run([[{ type: "closed", error: "late" }, 9]], s)).toBe(s);
    expect(linkRetryDue(s, 1e9)).toBe(false);
  });
  it("stop wins over everything, and late events after stop change nothing", () => {
    const s = run([["start", 0], ["opened", 0], ["data", 0], ["stop", 5]]);
    expect(s).toEqual(LINK_OFF);
    expect(run([["data", 6], ["opened", 7], [{ type: "closed", error: "late" }, 8], ["tick", 9]], s)).toEqual(LINK_OFF);
  });
  it("ignores a weight or an 'opened' that arrives in the wrong state", () => {
    const waiting = run([["start", 0], [{ type: "closed" }, 0]]);
    expect(run([["data", 1]], waiting)).toBe(waiting);
    expect(run([["opened", 1]], waiting)).toBe(waiting);
  });
});

describe("dead link and retry time", () => {
  it("an open link with no weight for 8 s is dead (from opening, or from the last weight)", () => {
    const opened = run([["start", 0], ["opened", 1000]]);
    expect(linkIsDead(opened, 1000 + DEAD_MS)).toBe(false);
    expect(linkIsDead(opened, 1001 + DEAD_MS)).toBe(true);
    const quiet = run([["data", 5000], ["tick", 5001 + SILENT_MS]], opened);
    expect(quiet.status).toBe("silent");
    expect(linkIsDead(quiet, 5000 + DEAD_MS)).toBe(false);
    expect(linkIsDead(quiet, 5001 + DEAD_MS)).toBe(true);
  });
  it("a live or connecting link is never called dead", () => {
    expect(linkIsDead(run([["start", 0]]), 1e9)).toBe(false);
    expect(linkIsDead(run([["start", 0], ["opened", 0], ["data", 0]]), 1e9)).toBe(false);
  });
  it("retries exactly when the wait is over", () => {
    const s = run([["start", 0], [{ type: "closed" }, 1000]]);
    expect(linkRetryDue(s, 1999)).toBe(false);
    expect(linkRetryDue(s, 2000)).toBe(true);
  });
  it("has a plain label for every state", () => {
    expect(linkLabel(LINK_OFF, 0)).toBe("Not connected");
    expect(linkLabel(run([["start", 0], [{ type: "closed" }, 1000]]), 1400)).toBe("Lost. Trying again in 1s (try 2)");
    expect(linkLabel(run([["start", 0], ["opened", 0]]), 0)).toMatch(/first weight/);
  });
});
