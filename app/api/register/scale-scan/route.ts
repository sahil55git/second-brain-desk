// Read a photo of the weighing scale's "PLU - Daily Report" into numbers for
// the person to check. Nothing is saved here (the Cash tally saves after the
// person confirms). One photo per call; the screen merges photos of a long report.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { readImageWithGemini } from "@/lib/aiProvider";
import { MAX_IMAGE_BYTES, parseDataUrl } from "@/lib/proofs";
import { buildScaleReportPrompt, normalizeScaleReport, scaleWarnings } from "@/lib/scaleReport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try {
    return JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const img = parseDataUrl(body.dataUrl);
  if (!img) return NextResponse.json({ error: "The picture could not be read. Take it again." }, { status: 400 });
  if (img.bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The picture is too large." }, { status: 413 });
  const r = await readImageWithGemini(buildScaleReportPrompt(), img.base64, img.mime);
  const empty = normalizeScaleReport({});
  if (!r.ok) return NextResponse.json({ report: empty, warnings: [], aiError: r.error, notConfigured: !!r.notConfigured });
  const raw = extractJson(r.text || "");
  if (!raw) return NextResponse.json({ report: empty, warnings: [], aiError: "Could not read a clean answer from the photo. Take it again." });
  const report = normalizeScaleReport(raw);
  return NextResponse.json({ report, warnings: scaleWarnings(report), confidence: raw.confidence ?? null, provider: r.provider });
}
