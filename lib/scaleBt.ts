// Live weight from a Bluetooth scale (iScale and other "serial port" scales that send ASCII
// lines). Two ways to reach the scale, one driver on top:
//
//   • Android app  → the MahadevScale plugin (classic Bluetooth serial; a browser cannot do this)
//   • Chrome / Edge on a computer → Web Serial: the scale is paired in Windows and shows up as a
//     serial port (Chrome can also open a paired Bluetooth serial device directly)
//
// The driver never gives up: it follows lib/scaleLink.ts (retry 1 s → 15 s for ever, reopen a
// link that has gone quiet) and only stops when a person presses Disconnect.
import { bytesToAscii, LineFramer, parseWeightLine, SettleDetector, StabilityTracker, type ParsedWeight } from "./scaleAscii";
import { LINK_OFF, linkIsDead, linkReduce, linkRetryDue, type LinkEvent, type LinkState } from "./scaleLink";
import { MahadevScale, hasNativeScale } from "./native";

export const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb";
export type BtSupport = "native" | "serial" | "none";

export interface BtConfig {
  kind: "native" | "serial";
  /** Android: the scale's Bluetooth address. Computer: not used (the browser remembers the port). */
  id: string;
  name: string;
  baud: number;
}

export interface BtReading {
  weightKg: number;
  /** Steady (the scale's own flag, or the same value held long enough). */
  stable: boolean;
  parsed: ParsedWeight;
}

export interface BtHandlers {
  onState(s: LinkState): void;
  onReading(r: BtReading): void;
  /** Every line as it arrived, with whether it was understood (for the check screen). */
  onLine(raw: string, ok: boolean): void;
  /** A load came to rest: record this weight once. */
  onSettled(weightKg: number): void;
}

export function btSupport(): BtSupport {
  if (typeof window === "undefined") return "none";
  if (hasNativeScale()) return "native";
  return "serial" in navigator ? "serial" : "none";
}

/** A transport opens the byte stream once; the driver above it decides when to try again. */
export interface Transport {
  open(onText: (t: string) => void, onClosed: (error: string, fatal?: boolean) => void): Promise<void>;
  close(): Promise<void>;
}

/** Thrown by a transport when trying again cannot help until a person does something. */
export class Fatal extends Error {}

// ---------------------------------------------------------------- Android app
class NativeTransport implements Transport {
  private subs: { remove: () => void }[] = [];
  constructor(private cfg: BtConfig) {}
  async open(onText: (t: string) => void, onClosed: (error: string, fatal?: boolean) => void) {
    await this.unlisten();
    this.subs.push(
      await MahadevScale.addListener("scaleBytes", (e) => {
        const bin = atob(e.base64 || "");
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        onText(bytesToAscii(u));
      })
    );
    this.subs.push(await MahadevScale.addListener("scaleClosed", (e) => onClosed(e.error || "The scale disconnected.")));
    try {
      await MahadevScale.open({ id: this.cfg.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.unlisten();
      if (/permission|nearby devices/i.test(msg)) throw new Fatal(msg);
      throw new Error(msg);
    }
  }
  async close() {
    await this.unlisten();
    try {
      await MahadevScale.close();
    } catch {
      /* already closed */
    }
  }
  private async unlisten() {
    const subs = this.subs;
    this.subs = [];
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        /* gone */
      }
    }
  }
}

// ---------------------------------------------------------------- Chrome / Edge (Web Serial)
/* eslint-disable @typescript-eslint/no-explicit-any */
type SerialPortLike = any;
const serial = (): any => (navigator as any).serial;
const PORT_KEY = "btScalePortInfo";

/** Ask the person to pick the scale's port (must be called from a tap / click). */
export async function chooseSerialPort(): Promise<{ name: string }> {
  let port: SerialPortLike;
  try {
    port = await serial().requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
  } catch (e) {
    // older Chrome does not know the Bluetooth option
    if (e instanceof TypeError) port = await serial().requestPort();
    else throw e;
  }
  const info = port.getInfo?.() ?? {};
  window.localStorage.setItem(PORT_KEY, JSON.stringify(info));
  return { name: info.bluetoothServiceClassId ? "Bluetooth scale" : info.usbVendorId ? "USB serial scale" : "Scale on a COM port" };
}

/** The port chosen earlier (the browser remembers the permission), or null. */
async function rememberedPort(): Promise<SerialPortLike | null> {
  const ports: SerialPortLike[] = await serial().getPorts();
  if (!ports.length) return null;
  let want: Record<string, unknown> = {};
  try {
    want = JSON.parse(window.localStorage.getItem(PORT_KEY) || "{}");
  } catch {
    /* use the first */
  }
  const same = (p: SerialPortLike) => {
    const i = p.getInfo?.() ?? {};
    return i.usbVendorId === want.usbVendorId && i.usbProductId === want.usbProductId && i.bluetoothServiceClassId === want.bluetoothServiceClassId;
  };
  return ports.find(same) ?? ports[0];
}

class SerialTransport implements Transport {
  private port: SerialPortLike | null = null;
  private reader: any = null;
  private closing = false;
  constructor(private cfg: BtConfig) {}
  async open(onText: (t: string) => void, onClosed: (error: string, fatal?: boolean) => void) {
    this.closing = false;
    const port = await rememberedPort();
    if (!port) throw new Fatal("Choose the scale once on this computer (Choose scale).");
    try {
      await port.open({ baudRate: this.cfg.baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "InvalidStateError") {
        // left open by an earlier page: close it and let the next try open it cleanly
        try {
          await port.close();
        } catch {
          /* busy */
        }
      }
      throw new Error(name === "NetworkError" || name === "InvalidStateError" ? "The scale did not answer. Is it switched on and near this computer?" : (e as Error)?.message || "Could not open the scale's port.");
    }
    this.port = port;
    void this.readLoop(port, onText, onClosed);
  }
  private async readLoop(port: SerialPortLike, onText: (t: string) => void, onClosed: (error: string) => void) {
    let why = "The scale disconnected.";
    try {
      while (port.readable && !this.closing) {
        this.reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value?.length) onText(bytesToAscii(value));
          }
        } finally {
          try {
            this.reader.releaseLock();
          } catch {
            /* released */
          }
          this.reader = null;
        }
        // a framing / buffer error ends one reader but the port may still be readable: loop
        if (this.closing) break;
      }
    } catch (e) {
      why = (e as Error)?.message || why;
    }
    const wasClosing = this.closing;
    await this.shut(port);
    if (!wasClosing) onClosed(why);
  }
  private async shut(port: SerialPortLike) {
    try {
      await port.close();
    } catch {
      /* already closed or gone */
    }
    if (this.port === port) this.port = null;
  }
  async close() {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* nothing to cancel */
    }
    if (this.port) await this.shut(this.port);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------- the driver
export class BtScaleLink {
  private state: LinkState = LINK_OFF;
  private transport: Transport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private framer = new LineFramer();
  private steady = new StabilityTracker();
  private settle = new SettleDetector();
  private opening = false;
  /** Guards against a late answer from a link we already gave up on. */
  private session = 0;
  private junk = 0;

  /** `make` is only passed by the tests (a pretend scale). */
  constructor(private cfg: BtConfig, private h: BtHandlers, private make?: () => Transport) {}

  get current(): LinkState {
    return this.state;
  }

  start() {
    this.stopTimers();
    this.transport = this.make ? this.make() : this.cfg.kind === "native" ? new NativeTransport(this.cfg) : new SerialTransport(this.cfg);
    this.apply({ type: "start" });
    this.timer = setInterval(() => this.tick(), 500);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisible);
    void this.tryOpen();
  }

  /** Disconnect on purpose: no more retries until start() is called again. */
  async stop() {
    this.session++;
    this.stopTimers();
    this.apply({ type: "stop" });
    const t = this.transport;
    this.transport = null;
    await t?.close();
  }

  /** "Try now" button: do not wait for the retry timer. */
  retryNow() {
    if (this.state.status === "waiting" || this.state.status === "blocked") {
      if (this.state.status === "blocked") this.apply({ type: "start" });
      void this.tryOpen();
    }
  }

  private onVisible = () => {
    // a phone that was asleep: timers were paused, so check the link the moment it wakes
    if (document.visibilityState === "visible") this.tick();
  };

  private stopTimers() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisible);
  }

  private apply(e: LinkEvent) {
    const next = linkReduce(this.state, e, Date.now(), Math.random());
    if (next !== this.state) {
      this.state = next;
      this.h.onState(next);
    }
  }

  private tick() {
    const now = Date.now();
    this.apply({ type: "tick" });
    if (linkIsDead(this.state, now)) {
      const why = this.junk > 3 ? "Data is coming but it is not a weight. Check the speed (9600 or 2400)." : "No weight is coming from the scale.";
      void this.drop(why);
    } else if (linkRetryDue(this.state, now)) {
      void this.tryOpen();
    }
  }

  private async drop(error: string) {
    this.session++;
    this.apply({ type: "closed", error });
    await this.transport?.close();
  }

  private async tryOpen() {
    if (this.opening || !this.transport) return;
    this.opening = true;
    const my = ++this.session;
    if (this.state.status !== "connecting") this.state = { ...this.state, status: "connecting", retryAt: null };
    this.h.onState(this.state);
    this.framer.reset();
    this.steady.reset();
    this.junk = 0;
    const t = this.transport;
    try {
      await t.open(
        (text) => my === this.session && this.onText(text),
        (error, fatal) => {
          if (my !== this.session) return;
          this.session++;
          this.apply({ type: "closed", error, fatal });
        }
      );
      if (my === this.session) this.apply({ type: "opened" });
      // we gave up (Disconnect, or the wait ran out) while it was still connecting:
      // do not leave the scale held by a link nobody is listening to
      else await t.close();
    } catch (e) {
      if (my === this.session) this.apply({ type: "closed", error: e instanceof Error ? e.message : String(e), fatal: e instanceof Fatal });
    } finally {
      this.opening = false;
    }
  }

  private onText(text: string) {
    for (const line of this.framer.push(text)) {
      const p = parseWeightLine(line);
      this.h.onLine(line.trim().slice(0, 48), !!p);
      if (!p) {
        this.junk++;
        continue;
      }
      this.junk = 0;
      this.apply({ type: "data" });
      const stable = this.steady.push(p, Date.now());
      this.h.onReading({ weightKg: p.weightKg, stable, parsed: p });
      const rec = this.settle.push(p.weightKg, stable);
      if (rec !== null) this.h.onSettled(rec);
    }
  }
}
