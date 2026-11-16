"use client";

// The Bluetooth scale on THIS phone / computer: remembers the chosen scale, keeps the link up
// (lib/scaleBt.ts), gives the live weight to ScaleProvider and saves each settled weight to the
// weighing log, holding it on the device while the internet is down.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btSourceName } from "@/lib/scaleAscii";
import { BtScaleLink, btSupport, chooseSerialPort, type BtConfig, type BtSupport } from "@/lib/scaleBt";
import { LINK_OFF, type LinkState } from "@/lib/scaleLink";
import { MahadevScale, type NativeScaleDevice } from "@/lib/native";

const K_CONFIG = "btScaleConfig";
const K_WANTED = "btScaleWanted";
const K_RECORD = "btScaleAutoRecord";
const K_QUEUE = "btScaleQueue";
const K_TARE = "btScaleTare";
const K_BEEP = "btScaleBeep";
const K_CHECKED = "btScaleChecked:";
const QUEUE_MAX = 300;
const SHOW_EVERY_MS = 250;

export interface BtLive {
  /** net weight: what the scale shows minus the tare set in the app */
  weightKg: number;
  /** what the scale itself sends */
  grossKg: number;
  /** steady according to the scale / the steady rule (before the "checked" gate) */
  steady: boolean;
  at: number;
}
interface Queued {
  nonce: string;
  source: string;
  weightKg: number;
  at: number;
}
export interface BtLine {
  text: string;
  ok: boolean;
}

export interface BtScaleApi {
  support: BtSupport;
  config: BtConfig | null;
  /** name saved with each weight, e.g. BT-ISCALE-I-20 */
  source: string | null;
  state: LinkState;
  live: BtLive | null;
  lines: BtLine[];
  /** the owner compared the screen with the scale's own display and ticked "correct" */
  checked: boolean;
  autoRecord: boolean;
  /** weights waiting for the internet */
  queued: number;
  lastSaved: { weightKg: number; at: number } | null;
  /** container weight taken off every reading (0 = none) */
  tareKg: number;
  beep: boolean;
  /** why the last "Save weight" press did nothing, or null */
  saveBlock: string | null;
  chooseSerial(): Promise<void>;
  listNative(): Promise<{ devices: NativeScaleDevice[]; bluetoothOn: boolean }>;
  pickNative(d: NativeScaleDevice): void;
  setBaud(baud: number): void;
  connect(): void;
  disconnect(): void;
  retryNow(): void;
  forget(): void;
  setChecked(v: boolean): void;
  setAutoRecord(v: boolean): void;
  /** take the weight on the scale now as the container weight (tare); 0 clears it */
  setTare(kg: number): void;
  setBeep(v: boolean): void;
  /** save the weight on the scale now to the weighing log (the big button) */
  saveNow(): boolean;
}

/** A short beep (no sound file needed). */
function playBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1200;
    g.gain.value = 0.2;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
    o.onended = () => void ctx.close();
  } catch {
    /* no sound on this device */
  }
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the scale still works for this visit */
  }
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const newNonce = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `bt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function useBtScale(): BtScaleApi {
  const [support, setSupport] = useState<BtSupport>("none");
  const [config, setConfig] = useState<BtConfig | null>(null);
  const [wanted, setWanted] = useState(false);
  const [state, setState] = useState<LinkState>(LINK_OFF);
  const [live, setLive] = useState<BtLive | null>(null);
  const [lines, setLines] = useState<BtLine[]>([]);
  const [checked, setCheckedState] = useState(false);
  const [autoRecord, setAutoRecordState] = useState(true);
  const [queued, setQueued] = useState(0);
  const [lastSaved, setLastSaved] = useState<{ weightKg: number; at: number } | null>(null);
  const [tareKg, setTareState] = useState(0);
  const [beep, setBeepState] = useState(true);
  const [saveBlock, setSaveBlock] = useState<string | null>(null);
  const tareRef = useRef(0);
  const beepRef = useRef(true);

  const link = useRef<BtScaleLink | null>(null);
  const latest = useRef<BtLive | null>(null);
  const shownAt = useRef(0);
  const linesBuf = useRef<BtLine[]>([]);
  const gate = useRef({ checked: false, autoRecord: true, source: "" });
  const flushing = useRef(false);

  const source = useMemo(() => (config ? btSourceName(config.name) : null), [config]);

  // ---- what this device remembers
  useEffect(() => {
    const s = btSupport();
    setSupport(s);
    const cfg = read<BtConfig | null>(K_CONFIG, null);
    if (cfg && cfg.kind === s) {
      setConfig(cfg);
      setWanted(read<boolean>(K_WANTED, false));
    }
    setAutoRecordState(read<boolean>(K_RECORD, true));
    setQueued(read<Queued[]>(K_QUEUE, []).length);
    const t = Number(read<number>(K_TARE, 0)) || 0;
    tareRef.current = t;
    setTareState(t);
    const b = read<boolean>(K_BEEP, true);
    beepRef.current = b;
    setBeepState(b);
  }, []);
  useEffect(() => {
    const c = source ? read<boolean>(K_CHECKED + source, false) : false;
    setCheckedState(c);
  }, [source]);
  useEffect(() => {
    gate.current = { checked, autoRecord, source: source || "" };
  }, [checked, autoRecord, source]);

  // ---- saving settled weights (kept on the device until the server has them)
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (;;) {
        const q = read<Queued[]>(K_QUEUE, []);
        const item = q[0];
        if (!item) break;
        let drop = false;
        try {
          const res = await fetch("/api/scale-ticks/record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: item.source, nonce: item.nonce, weightKg: item.weightKg, ageSec: Math.max(0, Math.round((Date.now() - item.at) / 1000)) }),
          });
          // saved, already saved, or refused as a bad weight: either way it leaves the queue
          drop = res.ok || res.status === 400;
          if (res.ok) setLastSaved({ weightKg: item.weightKg, at: item.at });
        } catch {
          drop = false; // no internet: keep it and try later
        }
        if (!drop) break;
        const now = read<Queued[]>(K_QUEUE, []).filter((x) => x.nonce !== item.nonce);
        write(K_QUEUE, now);
        setQueued(now.length);
      }
    } finally {
      flushing.current = false;
    }
  }, []);
  useEffect(() => {
    const t = setInterval(() => void flush(), 15000);
    const on = () => void flush();
    window.addEventListener("online", on);
    void flush();
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
    };
  }, [flush]);

  const enqueue = useCallback(
    (src: string, weightKg: number) => {
      const q = read<Queued[]>(K_QUEUE, []);
      q.push({ nonce: newNonce(), source: src, weightKg, at: Date.now() });
      const kept = q.slice(-QUEUE_MAX);
      write(K_QUEUE, kept);
      setQueued(kept.length);
      if (beepRef.current) playBeep();
      void flush();
    },
    [flush]
  );

  // ---- the link itself
  useEffect(() => {
    if (!config || !wanted || support !== config.kind) return;
    const l = new BtScaleLink(config, {
      onState: (s) => {
        setState(s);
        if (s.status !== "live" && latest.current?.steady) {
          // a weight from a link that is no longer live must not look usable
          latest.current = { ...latest.current, steady: false };
          setLive(latest.current);
        }
      },
      onReading: (r) => {
        const now = Date.now();
        const prev = latest.current;
        latest.current = { weightKg: round3(r.weightKg - tareRef.current), grossKg: r.weightKg, steady: r.stable, at: now };
        // show at most four times a second, but never delay "steady" turning on or off
        if (now - shownAt.current >= SHOW_EVERY_MS || !prev || prev.steady !== r.stable) {
          shownAt.current = now;
          setLive(latest.current);
          setLines(linesBuf.current.slice());
        }
      },
      onLine: (text, ok) => {
        linesBuf.current = [...linesBuf.current.slice(-7), { text, ok }];
        if (!ok) setLines(linesBuf.current.slice());
      },
      onSettled: (grossKg) => {
        const g = gate.current;
        if (!g.checked || !g.autoRecord || !g.source) return;
        const net = round3(grossKg - tareRef.current);
        if (net <= 0) return;
        enqueue(g.source, net);
      },
    });
    link.current = l;
    l.start();
    return () => {
      link.current = null;
      void l.stop();
      setState(LINK_OFF);
    };
  }, [config, wanted, support, enqueue]);

  const saveConfig = useCallback((cfg: BtConfig | null, want: boolean) => {
    write(K_CONFIG, cfg);
    write(K_WANTED, want);
    latest.current = null;
    linesBuf.current = [];
    setLive(null);
    setLines([]);
    setConfig(cfg);
    setWanted(want);
  }, []);

  const chooseSerial = useCallback(async () => {
    const picked = await chooseSerialPort();
    saveConfig({ kind: "serial", id: "", name: config?.kind === "serial" && config.name !== "" ? config.name : picked.name, baud: config?.baud ?? 9600 }, true);
  }, [config, saveConfig]);
  const listNative = useCallback(() => MahadevScale.list(), []);
  const pickNative = useCallback((d: NativeScaleDevice) => saveConfig({ kind: "native", id: d.id, name: d.name, baud: 9600 }, true), [saveConfig]);
  const setBaud = useCallback((baud: number) => { if (config) saveConfig({ ...config, baud }, wanted); }, [config, wanted, saveConfig]);
  const connect = useCallback(() => { write(K_WANTED, true); setWanted(true); }, []);
  const disconnect = useCallback(() => { write(K_WANTED, false); setWanted(false); }, []);
  const retryNow = useCallback(() => link.current?.retryNow(), []);
  const forget = useCallback(() => saveConfig(null, false), [saveConfig]);
  const setChecked = useCallback((v: boolean) => { if (source) write(K_CHECKED + source, v); setCheckedState(v); }, [source]);
  const setAutoRecord = useCallback((v: boolean) => { write(K_RECORD, v); setAutoRecordState(v); }, []);
  const setTare = useCallback((kg: number) => {
    const t = Number.isFinite(kg) && kg > 0 ? round3(kg) : 0;
    tareRef.current = t;
    write(K_TARE, t);
    setTareState(t);
    const cur = latest.current;
    if (cur) {
      latest.current = { ...cur, weightKg: round3(cur.grossKg - t) };
      setLive(latest.current);
    }
  }, []);
  const setBeep = useCallback((v: boolean) => { beepRef.current = v; write(K_BEEP, v); setBeepState(v); }, []);
  const saveNow = useCallback((): boolean => {
    const g = gate.current;
    const cur = latest.current;
    const why = !g.source ? "No scale chosen."
      : !g.checked ? "Tick 'compared and correct' first."
      : state.status !== "live" || !cur || Date.now() - cur.at > 3000 ? "No live weight from the scale."
      : !cur.steady ? "Weight is still moving. Wait for STEADY."
      : cur.weightKg <= 0 ? "Nothing on the scale."
      : null;
    setSaveBlock(why);
    if (why || !cur) return false;
    enqueue(g.source, cur.weightKg);
    return true;
  }, [state.status, enqueue]);

  return useMemo(
    () => ({ support, config, source, state, live, lines, checked, autoRecord, queued, lastSaved, tareKg, beep, saveBlock, chooseSerial, listNative, pickNative, setBaud, connect, disconnect, retryNow, forget, setChecked, setAutoRecord, setTare, setBeep, saveNow }),
    [support, config, source, state, live, lines, checked, autoRecord, queued, lastSaved, tareKg, beep, saveBlock, chooseSerial, listNative, pickNative, setBaud, connect, disconnect, retryNow, forget, setChecked, setAutoRecord, setTare, setBeep, saveNow]
  );
}
