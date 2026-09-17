"use client";

import React, { useMemo, useState } from "react";
import type { JobWorkIntakeDTO, DailyClosingDTO, MfgBatchDTO } from "@/lib/types";
import {
  buildReportCsv,
  summaryText,
  RANGE_LABELS,
  type DateRange,
  type ReportData,
} from "@/lib/reports";

const ADVISOR_BUTTONS: { key: string; label: string }[] = [
  { key: "audit", label: "Audit for compliance risks" },
  { key: "checklist", label: "Today's process checklist" },
  { key: "improvement", label: "Suggest one improvement" },
  { key: "selfdiag", label: "What isn't tracked yet?" },
];

export default function ReportsDesk({
  jobWork,
  closing,
  mfg,
}: {
  jobWork: JobWorkIntakeDTO[];
  closing: DailyClosingDTO[];
  mfg: MfgBatchDTO[];
}) {
  const data: ReportData = useMemo(() => ({ jobWork, closing, mfg }), [jobWork, closing, mfg]);
  const [range, setRange] = useState<DateRange>("week");

  const summary = useMemo(() => summaryText(data, range), [data, range]);

  function downloadCsv() {
    const csv = buildReportCsv(data, range);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `second-brain-desk-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- AI: ask-anything ---
  const [question, setQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askNote, setAskNote] = useState<string | null>(null);

  const suggestions = [
    "How much is still owed to me in job-work?",
    "Any manufacturing batches flagged this week?",
    "How much oil did we produce recently?",
    "Any cash mismatches in the closing counts?",
  ];

  async function ask(q: string) {
    const query = q.trim();
    if (!query) return;
    setAskLoading(true);
    setAskAnswer(null);
    setAskNote(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ask", question: query }),
      });
      const json = await res.json();
      if (json.notConfigured) setAskNote(json.error);
      else if (!res.ok) setAskNote(json.error || "AI request failed.");
      else setAskAnswer(json.answer);
    } catch (err) {
      setAskNote(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAskLoading(false);
    }
  }

  // --- AI: advisor ---
  const [advAnswer, setAdvAnswer] = useState<string | null>(null);
  const [advLoading, setAdvLoading] = useState<string | null>(null);
  const [advNote, setAdvNote] = useState<string | null>(null);

  async function advisor(action: string) {
    setAdvLoading(action);
    setAdvAnswer(null);
    setAdvNote(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "advisor", action }),
      });
      const json = await res.json();
      if (json.notConfigured) setAdvNote(json.error);
      else if (!res.ok) setAdvNote(json.error || "AI request failed.");
      else setAdvAnswer(json.answer);
    } catch (err) {
      setAdvNote(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAdvLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Range + export */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm opacity-70">Range:</span>
          {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded text-sm ${
                range === r ? "bg-amber-600 text-white" : "bg-black/5 dark:bg-white/5"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={downloadCsv} className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium">
            Download CSV
          </button>
          <button onClick={() => window.print()} className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium">
            Print / Save PDF
          </button>
        </div>
        <pre className="mt-4 whitespace-pre-wrap text-sm bg-black/5 dark:bg-white/5 rounded p-3 font-sans">
          {summary}
        </pre>
      </div>

      {/* AI: ask anything */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-semibold mb-1">Ask about your business</h2>
        <p className="text-xs opacity-60 mb-3">
          Plain-language questions over Job-Work, Manufacturing, and Daily Closing data.
        </p>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="e.g. who still owes me money?"
            className="flex-1 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2 text-sm"
          />
          <button
            onClick={() => ask(question)}
            disabled={askLoading}
            className="rounded bg-amber-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {askLoading ? "Thinking…" : "Ask"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); ask(s); }}
              className="text-xs rounded-full border border-black/15 dark:border-white/15 px-2.5 py-1 opacity-80 hover:opacity-100"
            >
              {s}
            </button>
          ))}
        </div>
        {askNote && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {askNote}
          </div>
        )}
        {askAnswer && (
          <pre className="mt-3 whitespace-pre-wrap text-sm bg-black/5 dark:bg-white/5 rounded p-3 font-sans">
            {askAnswer}
          </pre>
        )}
      </div>

      {/* AI: advisor */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-semibold mb-1">AI Business Advisor</h2>
        <p className="text-xs opacity-60 mb-3">
          Deeper passes — compliance audit, a process checklist, one improvement idea, or a self-diagnostic.
        </p>
        <div className="flex flex-wrap gap-2">
          {ADVISOR_BUTTONS.map((b) => (
            <button
              key={b.key}
              onClick={() => advisor(b.key)}
              disabled={advLoading !== null}
              className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {advLoading === b.key ? "Thinking…" : b.label}
            </button>
          ))}
        </div>
        {advNote && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {advNote}
          </div>
        )}
        {advAnswer && (
          <pre className="mt-3 whitespace-pre-wrap text-sm bg-black/5 dark:bg-white/5 rounded p-3 font-sans">
            {advAnswer}
          </pre>
        )}
      </div>
    </div>
  );
}
