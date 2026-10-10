// Slip / bill scanner: read a photo into fields for the person to check.
// Nothing is saved here — the person reviews the fields, then the scanner
// saves through POST /api/attachments.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { readImageWithGemini } from "@/lib/aiProvider";
import { MAX_IMAGE_BYTES, buildScanPrompt, isScanKind, normalizeScan, parseDataUrl, scanWarnings } from "@/lib/proofs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isScanKind(body.kind)) return NextResponse.json({ error: "Unknown slip type" }, { status: 400 });
  const img = parseDataUrl(body.dataUrl);
  if (!img) return NextResponse.json({ error: "The picture could not be read. Take it again." }, { status: 400 });
  if (img.bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The picture is too large." }, { status: 413 });

  const r = await readImageWithGemini(buildScanPrompt(body.kind), img.base64, img.mime);
  if (!r.ok) {
    // No AI (or AI down): the person can still type the fields and save the photo.
    return NextResponse.json({ fields: normalizeScan(body.kind, {}), warnings: [], aiError: r.error, notConfigured: !!r.notConfigured });
  }
  const raw = extractJson(r.text || "");
  if (!raw) {
    return NextResponse.json({ fields: normalizeScan(body.kind, {}), warnings: [], aiError: "Could not read a clean answer from the photo — type the details." });
  }
  const fields = normalizeScan(body.kind, raw);
  const confidence = raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low" ? raw.confidence : null;
  return NextResponse.json({ fields, warnings: scanWarnings(body.kind, fields), confidence, provider: r.provider });
}
