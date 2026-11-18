"use client";

// The shop's UPI set-up for any screen: the saved accounts, the payee name and a helper that makes the pay link
// (see lib/shopPay.ts). One fetch is shared by every component on the page; Settings calls refreshShopPay() after saving.
import { useCallback, useEffect, useState } from "react";
import { parseShopPay, payLink, pickAccount, type ShopPay, type UpiAccount } from "@/lib/shopPay";

const EMPTY: ShopPay = { payee: "", upi: "", accounts: [] };
let cache: ShopPay | null = null;
let inflight: Promise<ShopPay> | null = null;
const listeners = new Set<(p: ShopPay) => void>();

function fetchPay(): Promise<ShopPay> {
  return (inflight ||= fetch("/api/settings/app?key=shop", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (cache = parseShopPay(j?.data)))
    .catch(() => cache ?? EMPTY)
    .finally(() => { inflight = null; }));
}

/** Tell every open screen the UPI set-up changed (after saving it). */
export function refreshShopPay(next?: ShopPay) {
  if (next) cache = next;
  else cache = null;
  void (next ? Promise.resolve(next) : fetchPay()).then((p) => listeners.forEach((l) => l(p)));
}

export interface ShopPayApi {
  pay: ShopPay;
  ready: boolean;
  /** the UPI ID bills use (the chosen account, else the default); "" when none is set */
  vpaOf: (accountId?: string | null) => string;
  accountOf: (accountId?: string | null) => UpiAccount | null;
  /** the QR text for an amount; undefined when no UPI ID is set. `fallbackName` is used when no payee name was saved. */
  linkFor: (amount: number, note: string, fallbackName: string, accountId?: string | null) => string | undefined;
}

export function useShopPay(): ShopPayApi {
  const [pay, setPay] = useState<ShopPay>(cache ?? EMPTY);
  const [ready, setReady] = useState(!!cache);
  useEffect(() => {
    let live = true;
    const on = (p: ShopPay) => live && (setPay(p), setReady(true));
    listeners.add(on);
    if (cache) on(cache);
    else void fetchPay().then(on);
    return () => { live = false; listeners.delete(on); };
  }, []);
  const accountOf = useCallback((id?: string | null) => pickAccount(pay, id), [pay]);
  const vpaOf = useCallback((id?: string | null) => pickAccount(pay, id)?.vpa ?? "", [pay]);
  const linkFor = useCallback(
    (amount: number, note: string, fallbackName: string, id?: string | null) => {
      const a = pickAccount(pay, id);
      return a ? payLink({ vpa: a.vpa, payee: pay.payee || fallbackName, amount, note }) : undefined;
    },
    [pay]
  );
  return { pay, ready, vpaOf, accountOf, linkFor };
}
