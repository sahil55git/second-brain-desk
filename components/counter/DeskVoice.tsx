"use client";

import { useEffect, useRef, useState } from "react";
import { isNative, MahadevNative } from "@/lib/native";
import { deskCommand, spokenBillNumber, type DeskCommand } from "@/lib/deskVoice";

type Props = {
  k: (en: string, kn: string) => string;
  onCommand: (cmd: DeskCommand) => Promise<string | void>;
};

export default function DeskVoice({ k, onCommand }: Props) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Extract<DeskCommand, { no: string }> | null>(null);
  const [number, setNumber] = useState("");
  const mounted = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setAvailable(isNative());
    return () => { mounted.current = false; };
  }, []);
  if (!available) return null;

  async function run(typed?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const text = typed ?? (await MahadevNative.listen({ lang: k("en-IN", "kn-IN") })).text;
      if (!mounted.current || !text?.trim()) return;
      const digits = pending ? spokenBillNumber(text) : null;
      const cmd = pending && digits ? { ...pending, no: digits } : deskCommand(text);
      if (!cmd) {
        setMessage(k("Try “cash received for bill number 12” or “received all pending bills”.", "“ಬಿಲ್ ಸಂಖ್ಯೆ 12 ನಗದು ಬಂದಿದೆ” ಅಥವಾ “ಎಲ್ಲಾ ಬಾಕಿ ಬಿಲ್ ಹಣ ಬಂದಿದೆ” ಎಂದು ಹೇಳಿ."));
        return;
      }
      if ("no" in cmd && !cmd.no) {
        setPending(cmd);
        setNumber("");
        return;
      }
      setPending(null);
      const result = await onCommand(cmd);
      if (mounted.current && result) setMessage(result);
    } catch {
      if (mounted.current) setMessage(k("Could not complete the command. Please try again.", "ಆದೇಶ ಪೂರ್ಣವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy} onClick={() => void run()} aria-label={k("Speak a command", "ಆದೇಶ ಹೇಳಿ")}>🎙️ {k("Speak", "ಹೇಳಿ")}</button>
    {pending && <form onSubmit={e => { e.preventDefault(); void run(number); }}>
      <label>{k("Bill number", "ಬಿಲ್ ಸಂಖ್ಯೆ")} <input autoFocus inputMode="numeric" size={6} value={number} onChange={e => setNumber(e.target.value)} /></label>
      <button disabled={busy || !number.trim()} aria-label={k("Open bill action", "ಬಿಲ್ ತೆರೆಯಿರಿ")}>✓</button>
      <button type="button" disabled={busy} onClick={() => { setPending(null); setMessage(""); }} aria-label={k("Close", "ಮುಚ್ಚಿ")}>✕</button>
    </form>}
    {message && <span role="status">{message}</span>}
  </>;
}

