"use client";

// Loads the saved layouts and remembers which one this device prints with.
import { useCallback, useEffect, useMemo, useState } from "react";
import { sanitizeDoc, type TemplateKind, type TemplateRow } from "@/lib/labelTemplate";
import { api } from "@/components/barrels/shared";

interface Raw {
  id: string;
  name: string;
  kind: string;
  widthMm: number;
  heightMm: number | null;
  doc: unknown;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Layouts from the API with every document re-checked (a broken one is left out, never drawn). */
export function parseRows(list: Raw[], kind: TemplateKind): TemplateRow[] {
  const out: TemplateRow[] = [];
  for (const r of list) {
    if (r.kind !== kind) continue;
    const c = sanitizeDoc(r.doc, kind);
    if (!c.ok) continue;
    out.push({ id: r.id, name: r.name, kind, widthMm: c.doc.widthMm, heightMm: c.doc.kind === "label" ? c.doc.heightMm : null, doc: c.doc, isDefault: r.isDefault, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
  }
  return out;
}

export function useTemplates(kind: TemplateKind) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const j = await api<{ data: Raw[] }>(`/api/label-templates?kind=${kind}`);
      setRows(parseRows(j.data, kind));
      setError(null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load the layouts.");
    }
  }, [kind]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { rows, error, reload };
}

const KEY = "bd-layout-v1";
export const STANDARD = "std";

function readChoice(kind: TemplateKind): string | null {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "{}");
    return typeof j[kind] === "string" ? j[kind] : null;
  } catch {
    return null;
  }
}
function writeChoice(kind: TemplateKind, id: string) {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "{}");
    j[kind] = id;
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {}
}

/**
 * Which layout this device prints with: the one chosen on this device, else the shop's default,
 * else the built-in standard. `override` (a link's ?layout=) wins for that visit.
 */
export function useLayoutChoice(kind: TemplateKind, rows: TemplateRow[] | null, override?: string | null) {
  const [mine, setMine] = useState<string | null>(() => (typeof window === "undefined" ? null : readChoice(kind)));
  useEffect(() => setMine(readChoice(kind)), [kind]);
  const choose = (id: string) => {
    setMine(id);
    writeChoice(kind, id);
  };
  const picked = useMemo(() => {
    if (!rows) return null;
    const want = override ?? mine;
    if (want === STANDARD) return null;
    return rows.find((r) => r.id === want) ?? rows.find((r) => r.isDefault) ?? null;
  }, [rows, mine, override]);
  return { template: picked, choiceId: picked ? picked.id : STANDARD, choose };
}
