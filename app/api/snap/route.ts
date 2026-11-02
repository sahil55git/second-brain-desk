// 📸 Photo reading (any signed-in user): count bags / tins, read an electricity meter, a tank gauge or
// a scale display from a photo. Returns the reading for the person to check; nothing is saved here.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { readImageWithGemini } from "@/lib/aiProvider";
import { MAX_IMAGE_BYTES, parseDataUrl } from "@/lib/proofs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROMPTS: Record<string, string> = {
  bags: `Count the sacks / bags in this photo of a seed godown or truck. Count visible bags; if stacked in a regular block, estimate the full stack (rows × columns × layers) and say how. Return JSON {"value": number, "unit": "bags", "how": string, "confidence": "high"|"medium"|"low"}.`,
  tins: `Count the oil tins / cans / bottles in this photo. Return JSON {"value": number, "unit": "pcs", "how": string, "confidence": "high"|"medium"|"low"}.`,
  meter: `Read the electricity meter in this photo: the kWh reading (main register, all digits, ignore decimals in red). Return JSON {"value": number, "unit": "kWh", "how": string, "confidence": "high"|"medium"|"low"}.`,
  gauge: `Read the level on the tank gauge / dipstick / sight glass in this photo. Return JSON {"value": number, "unit": "cm" or "%" or "kg" (whatever the scale shows), "how": string, "confidence": "high"|"medium"|"low"}.`,
  scale: `Read the number on the weighing-scale display in this photo. Return JSON {"value": number, "unit": "kg", "how": string, "confidence": "high"|"medium"|"low"}.`,
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const prompt = PROMPTS[String(b.kind || "")];
  if (!prompt) return NextResponse.json({ error: "What should I read?" }, { status: 400 });
  const img = parseDataUrl(b.dataUrl);
  if (!img || img.bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The photo could not be read. Take it again." }, { status: 400 });
  const r = await readImageWithGemini("You read photos for an edible-oil mill in Bidar. Reply with ONLY the JSON asked for.", img.base64, img.mime, prompt);
  if (!r.ok || !r.text) return NextResponse.json({ error: r.error || "Could not read the photo." }, { status: 503 });
  const t = r.text.trim().replace(/^```(json)?/i, "").replace(/```$/, "");
  try {
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const value = Number(j.value);
    return NextResponse.json({ data: { value: Number.isFinite(value) ? value : null, unit: String(j.unit || ""), how: String(j.how || "").slice(0, 300), confidence: String(j.confidence || "low") } });
  } catch {
    return NextResponse.json({ error: "The reading was not clear. Try a closer, straight photo." }, { status: 422 });
  }
}
