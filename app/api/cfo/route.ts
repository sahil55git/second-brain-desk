// 🧑‍💼 AI CFO monthly report (owner). POST → { report, pack }.
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { cfoReport } from "@/lib/cfoServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const r = await cfoReport();
    return NextResponse.json({ data: { report: r.text, pack: r.pack }, error: r.text ? undefined : r.error || "AI is not set up (add GEMINI_API_KEY in Vercel)." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the report." }, { status: 503 });
  }
}
