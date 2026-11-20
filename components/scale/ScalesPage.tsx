"use client";

import Link from "next/link";
import ScaleDashboard from "@/components/ScaleDashboard";
import { safeBack } from "@/lib/scaleSetup";

export default function ScalesPage({ back }: { back: string }) {
  const to = safeBack(back);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 p-3">
      <div className="flex items-center gap-3">
        <Link href={to} className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25">← {to === "/" ? "Home" : "Back"}</Link>
        <h1 className="text-lg font-semibold">Live scales · scale set-up</h1>
      </div>
      <ScaleDashboard />
    </main>
  );
}
