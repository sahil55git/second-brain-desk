"use client";

// The signed-in user's profile on the screen: which pages, Quick Register
// functions and windows they get, and which data is hidden. The server
// enforces pages, functions, other-users' entries and rates; hiding totals,
// profit and udhaar is on-screen only (see lib/access.ts).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { BUILTIN_PROFILES, MASK, OWNER_PERMS, effectivePerms, type FnKey, type HideKey, type PageKey, type Perms, type WinKey } from "@/lib/access";

interface AccessCtx {
  ready: boolean;
  isOwner: boolean;
  profileName: string;
  perms: Perms;
  page: (k: PageKey) => boolean;
  fn: (k: FnKey) => boolean;
  win: (k: WinKey) => boolean;
  hidden: (k: HideKey) => boolean;
  /** Shows `value`, or •••• when the profile hides this kind of data. */
  mask: (k: HideKey, value: string) => string;
}

const KEY = "acc-perms-v1";
const STRICT = effectivePerms(false, BUILTIN_PROFILES.find((p) => p.id === "counter")!.perms);

function build(ready: boolean, isOwner: boolean, profileName: string, perms: Perms): AccessCtx {
  return {
    ready, isOwner, profileName, perms,
    page: (k) => !!perms.pg[k],
    fn: (k) => !!perms.fn[k],
    win: (k) => !!perms.win[k],
    hidden: (k) => !!perms.hide[k],
    mask: (k, v) => (perms.hide[k] ? MASK : v),
  };
}

const Ctx = createContext<AccessCtx>(build(false, true, "Owner", OWNER_PERMS));
export const useAccess = () => useContext(Ctx);

export default function AccessProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionOwner = (session?.user as any)?.role === "OWNER";
  const [live, setLive] = useState<{ isOwner: boolean; profileName: string; perms: Perms } | null>(null);
  const [cached, setCached] = useState<Perms | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setCached(JSON.parse(raw) as Perms);
    } catch { /* storage can be blocked: fall back to the strict defaults */ }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let off = false;
    fetch("/api/access/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (off || !j?.data) return;
        setLive({ isOwner: !!j.data.isOwner, profileName: j.data.profileName || "Owner", perms: j.data.perms });
        try { localStorage.setItem(KEY, JSON.stringify(j.data.perms)); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { off = true; };
  }, [status]);

  const value = useMemo(() => {
    if (live) return build(true, live.isOwner, live.profileName, live.perms);
    if (sessionOwner) return build(false, true, "Owner", OWNER_PERMS);
    // Staff before the answer arrives: last known profile on this device, else the strictest defaults.
    return build(false, false, "", cached ? effectivePerms(false, cached) : STRICT);
  }, [live, sessionOwner, cached]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
