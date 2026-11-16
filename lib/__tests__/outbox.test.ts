import { describe, expect, it } from "vitest";
import { enqueue, newClientId, OUT_MAX, verdict, withClientId, type OutItem } from "@/lib/outbox";

describe("verdict", () => {
  it("saved answers leave the queue as sent", () => {
    expect([200, 201, 204].map(verdict)).toEqual(["sent", "sent", "sent"]);
  });
  it("an entry the server says is wrong is refused, not retried for ever", () => {
    expect([400, 403, 404, 409, 410, 422].map(verdict)).toEqual(Array(6).fill("refused"));
  });
  it("no network, server trouble, busy, or signed out all wait: nothing is lost", () => {
    expect((["network", 500, 502, 503, 504, 429, 401, 408] as const).map(verdict)).toEqual(Array(8).fill("wait"));
  });
});

describe("client ids", () => {
  it("are accepted by the server's pattern and differ", () => {
    const a = newClientId(1_700_000_000_000, 0.123);
    const b = newClientId(1_700_000_000_000, 0.999999);
    const c = newClientId(1_700_000_000_000, 0);
    for (const id of [a, b, c]) expect(id).toMatch(/^c[a-z0-9]{6,30}$/);
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it("are added to the body once and kept on a retry", () => {
    const first = withClientId({ customer: "Ramesh", seedKg: 120 }, "cabc12345");
    expect(JSON.parse(first.body)).toEqual({ customer: "Ramesh", seedKg: 120, clientId: "cabc12345" });
    const again = withClientId(JSON.parse(first.body), "cother999");
    expect(again.id).toBe("cabc12345");
    expect(withClientId({ clientId: "not valid!" }, "cgood1234").id).toBe("cgood1234");
  });
});

describe("enqueue", () => {
  const item = (id: string): OutItem => ({ id, desk: "jobwork", label: "x", url: "/api/job-work", method: "POST", body: "{}", at: 1 });
  it("keeps order and never holds the same entry twice", () => {
    let q: OutItem[] = [];
    q = enqueue(q, item("c1aaaaaa")).queue;
    q = enqueue(q, item("c2aaaaaa")).queue;
    q = enqueue(q, item("c1aaaaaa")).queue;
    expect(q.map((x) => x.id)).toEqual(["c1aaaaaa", "c2aaaaaa"]);
  });
  it("says so when it is full instead of dropping an old entry", () => {
    const full = Array.from({ length: OUT_MAX }, (_, i) => item(`c${String(i).padStart(7, "0")}`));
    const r = enqueue(full, item("cnewentry1"));
    expect(r.full).toBe(true);
    expect(r.queue).toHaveLength(OUT_MAX);
    expect(r.queue[0].id).toBe("c0000000");
  });
});
