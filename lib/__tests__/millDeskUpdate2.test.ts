import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "public/mill/desk.html"), "utf8");

describe("Mill Desk update 2 (source checks on the built page)", () => {
  it("settlement direction follows the sign, with returned advance", () => {
    expect(html).toContain("dir:due>=0?'out':'in'");
    expect(html).toContain("(j.advC||0)-(j.advR||0)");
    expect(html).toContain("Customer owes shop");
  });
  it("saving a job does not print; print and done are separate", () => {
    expect(html).toContain("Save job ·");
    expect(html).toContain("millPrintGo(S.cfg.autoTok,{kind:'token'");
    expect(html).toContain("window.millPrepare=");
    expect(html).not.toContain("Bag stickers ${sp.stick");
  });
  it("an advance opens one sheet to edit it or give part back (no extra field)", () => {
    expect(html).toContain("function sheetAdv(ctx,f)");
    expect(html).toContain("Return advance");
    expect(html).not.toContain("'Advance returned',j.advR");
  });
  it("name field, fixed mode, hide scope and language", () => {
    expect(html).toContain("who:'Name'");
    expect(html).toContain("setMode(S.mode==='worker'?'counter':'worker')");
    expect(html).not.toContain("S.view='slip';S.mode='counter'");
    expect(html).toContain("hideScope");
    expect(html).toContain("setLang(S.lang==='en'?'kn':'en')");
  });
});

describe("Waiting list carries the customer name", () => {
  it("name button on customer cards, kept on the weighings, and passed to New job", () => {
    expect(html).toContain("function wName(gi)");
    expect(html).toContain("x.cust=c.slice(0,3)");
    expect(html).toContain("if(gc&&!S.slip.cust)S.slip.cust=gc;");
  });
});

describe("New job from Worker mode, and sorting", () => {
  it("the job form shows in Worker mode when a job is being made", () => {
    expect(html).toContain("S.mode==='worker'&&S.view!=='slip'?workerHTML()");
  });
  it("every list has a sort bar and jobs/queue/parked carry a time stamp", () => {
    for (const k of ["'W',1", "'J'", "'H'", "'P'"]) expect(html).toContain("sortBar(" + k + ")");
    expect(html).toContain("time:clock(),at:Date.now()");
    expect(html).toContain("milldesk.sort");
  });
});
