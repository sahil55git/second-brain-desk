// Quick Register settings. Everyone signed in can read. The Owner can change
// everything; Staff may only set the opening-cash override for TODAY (the
// counter count is theirs to correct) — enforced here, server-side.
import { NextRequest, NextResponse } from "next/server";
import { safeDbCall } from "@/lib/db";
import { getUser, isValidDate, loadConfig, saveConfig } from "@/lib/registerServer";
import { businessDate, normalizeConfig, type RegisterConfigData } from "@/lib/register";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const result = await safeDbCall(() => loadConfig());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const result = await safeDbCall(async () => {
    const current = await loadConfig();
    let next: RegisterConfigData;
    if (user.isOwner) {
      next = normalizeConfig({ ...current, ...body });
    } else {
      const today = businessDate(Date.now());
      const value = body?.openings?.[today];
      if (Object.keys(body || {}).some((k) => k !== "openings") || !isValidDate(today) || typeof value !== "number") {
        throw new Error("OWNER_ONLY");
      }
      next = { ...current, openings: { ...current.openings, [today]: value } };
    }
    await saveConfig(next);
    return next;
  });
  if (!result.ok) {
    const forbidden = result.error.includes("OWNER_ONLY");
    return NextResponse.json(
      { error: forbidden ? "Only the owner can change these settings." : result.error },
      { status: forbidden ? 403 : 503 }
    );
  }
  return NextResponse.json({ data: result.data });
}
