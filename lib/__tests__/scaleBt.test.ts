// The driver against a pretend scale: it must reconnect by itself for ever, reopen a link
// that went quiet, ignore late answers from a link it gave up on, and stop when told.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BtScaleLink, Fatal, type BtConfig, type Transport } from "@/lib/scaleBt";
import type { LinkState } from "@/lib/scaleLink";

class FakeScale implements Transport {
  opens = 0;
  closes = 0;
  /** what the next open() does */
  plan: ("ok" | "fail" | "fatal" | "hang")[] = [];
  text: ((t: string) => void) | null = null;
  closed: ((e: string, fatal?: boolean) => void) | null = null;
  release: (() => void) | null = null;
  async open(onText: (t: string) => void, onClosed: (e: string, fatal?: boolean) => void) {
    this.opens++;
    const what = this.plan.shift() ?? "ok";
    if (what === "fail") throw new Error("The scale did not answer.");
    if (what === "fatal") throw new Fatal("Allow Nearby devices.");
    if (what === "hang") await new Promise<void>((r) => (this.release = r));
    this.text = onText;
    this.closed = onClosed;
  }
  async close() {
    this.closes++;
  }
  say(kg: string, times = 1) {
    for (let i = 0; i < times; i++) this.text?.(`+ ${kg} kg\r\n`);
  }
}

const cfg: BtConfig = { kind: "native", id: "00:11:22:33:44:55", name: "iScale i-20", baud: 9600 };

function setup() {
  const scale = new FakeScale();
  const states: LinkState[] = [];
  const readings: { weightKg: number; stable: boolean }[] = [];
  const settled: number[] = [];
  const lines: [string, boolean][] = [];
  const link = new BtScaleLink(
    cfg,
    { onState: (s) => states.push(s), onReading: (r) => readings.push({ weightKg: r.weightKg, stable: r.stable }), onLine: (t, ok) => lines.push([t, ok]), onSettled: (kg) => settled.push(kg) },
    () => scale
  );
  return { scale, states, readings, settled, lines, link, status: () => link.current.status };
}
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("BtScaleLink", () => {
  it("connects, reads weights, and calls a held weight steady", async () => {
    const t = setup();
    t.link.start();
    await wait(0);
    expect(t.status()).toBe("silent");
    t.scale.say("012.340");
    expect(t.status()).toBe("live");
    expect(t.readings).toEqual([{ weightKg: 12.34, stable: false }]);
    for (let i = 0; i < 4; i++) {
      await wait(250);
      t.scale.say("012.340");
    }
    expect(t.readings.at(-1)).toEqual({ weightKg: 12.34, stable: true });
    expect(t.settled).toEqual([12.34]); // saved once, not once per line
    await t.link.stop();
  });

  it("keeps trying when the scale is off: 1 s, 2 s, 4 s … and connects when it comes on", async () => {
    const t = setup();
    t.scale.plan = ["fail", "fail", "fail", "ok"];
    t.link.start();
    await wait(0);
    expect(t.scale.opens).toBe(1);
    expect(t.status()).toBe("waiting");
    expect(t.link.current.error).toBe("The scale did not answer.");
    await wait(1500);
    expect(t.scale.opens).toBe(2);
    await wait(2500);
    expect(t.scale.opens).toBe(3);
    await wait(5000);
    expect(t.scale.opens).toBe(4);
    expect(t.status()).toBe("silent");
    t.scale.say("001.000");
    expect(t.link.current).toMatchObject({ status: "live", attempt: 0, error: null });
    await t.link.stop();
  });

  it("never gives up: still retrying after an hour, every 15 s or so", async () => {
    const t = setup();
    t.scale.plan = Array(1000).fill("fail");
    t.link.start();
    await wait(3600_000);
    const afterHour = t.scale.opens;
    expect(afterHour).toBeGreaterThan(190);
    await wait(60_000);
    const perMinute = t.scale.opens - afterHour;
    expect(perMinute).toBeGreaterThanOrEqual(3);
    expect(perMinute).toBeLessThanOrEqual(5);
    await t.link.stop();
  });

  it("reconnects when the link drops in the middle of weighing", async () => {
    const t = setup();
    t.link.start();
    await wait(0);
    t.scale.say("050.000");
    t.scale.closed!("The scale disconnected.");
    expect(t.status()).toBe("waiting");
    await wait(1500);
    expect(t.scale.opens).toBe(2);
    t.scale.say("050.000");
    expect(t.status()).toBe("live");
    await t.link.stop();
  });

  it("closes and reopens a link that is open but silent (scale switched off without saying so)", async () => {
    const t = setup();
    t.link.start();
    await wait(0);
    t.scale.say("050.000");
    await wait(3600);
    expect(t.status()).toBe("silent");
    await wait(5000);
    expect(t.scale.closes).toBe(1);
    expect(t.link.current.error).toBe("No weight is coming from the scale.");
    await wait(1500);
    expect(t.scale.opens).toBe(2);
    await t.link.stop();
  });

  it("says so when data comes but is not a weight (wrong speed)", async () => {
    const t = setup();
    t.link.start();
    await wait(0);
    for (let i = 0; i < 20; i++) {
      t.scale.text!("%&#@!\r\n");
      await wait(500);
    }
    expect(t.link.current.error).toMatch(/not a weight/);
    expect(t.readings).toEqual([]);
    expect(t.lines[0]).toEqual(["%&#@!", false]);
    await t.link.stop();
  });

  it("ignores a late line and a late 'closed' from a link it already gave up on", async () => {
    const t = setup();
    t.link.start();
    await wait(0);
    const oldText = t.scale.text!;
    const oldClosed = t.scale.closed!;
    oldClosed("dropped");
    await wait(1500); // reopened: new callbacks
    t.scale.say("010.000");
    const before = t.readings.length;
    oldText("+ 999.000 kg\r\n");
    oldClosed("late news");
    expect(t.readings.length).toBe(before);
    expect(t.status()).toBe("live");
    await t.link.stop();
  });

  it("stops for good on Disconnect, even while a connection attempt is still running", async () => {
    const t = setup();
    t.scale.plan = ["hang"];
    t.link.start();
    await wait(0);
    expect(t.status()).toBe("connecting");
    await t.link.stop();
    const closesBefore = t.scale.closes;
    t.scale.release!(); // the slow attempt finishes after we stopped
    await wait(60_000);
    expect(t.scale.closes).toBe(closesBefore + 1); // the late link is closed, not left holding the scale
    expect(t.status()).toBe("off");
    expect(t.scale.opens).toBe(1);
    t.scale.say("010.000");
    expect(t.readings).toEqual([]);
  });

  it("waits for a person when permission is refused, and Try now starts again", async () => {
    const t = setup();
    t.scale.plan = ["fatal", "ok"];
    t.link.start();
    await wait(0);
    expect(t.link.current).toMatchObject({ status: "blocked", error: "Allow Nearby devices." });
    await wait(120_000);
    expect(t.scale.opens).toBe(1); // no silent retries against a refusal
    t.link.retryNow();
    await wait(0);
    expect(t.status()).toBe("silent");
    await t.link.stop();
  });

  it("does not start two connection attempts at once", async () => {
    const t = setup();
    t.scale.plan = ["fail", "hang"];
    t.link.start();
    await wait(1500); // second attempt hangs
    t.link.retryNow();
    t.link.retryNow();
    await wait(30_000);
    expect(t.scale.opens).toBe(2);
    await t.link.stop();
  });
});
