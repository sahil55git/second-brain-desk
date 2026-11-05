"use client";

// The supplier's page /po/<token>: the order as a sheet with Print / Save as PDF. No sign-in.
import { useEffect, useState } from "react";
import PoDocument, { printPo } from "./PoDocument";
import type { PoDoc, ShopInfo } from "@/lib/po";

export default function PublicPo({ token }: { token: string }) {
  const [state, setState] = useState<{ po: PoDoc; shop: ShopInfo } | "loading" | string>("loading");
  useEffect(() => {
    fetch(`/api/po-public/${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); setState(r.ok ? j : j.error || "This link is not active any more."); })
      .catch(() => setState("Could not load the order. Check your internet and try again."));
  }, [token]);
  if (state === "loading") return <div className="po-pub"><p className="po-err">Loading the order…</p></div>;
  if (typeof state === "string") return <div className="po-pub"><p className="po-err">{state}</p></div>;
  return (
    <div className="po-pub">
      <div className="po-bar">
        <button type="button" className="po-btn" onClick={printPo}>🖨️ Print / Save as PDF</button>
      </div>
      <PoDocument po={state.po} shop={state.shop} />
    </div>
  );
}
