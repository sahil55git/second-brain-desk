// Reports hub data — Owner only (financial totals), checked server-side.
// Returns the raw rows the pure functions in lib/bizReports.ts aggregate,
// so the browser can switch tabs / ranges / CSVs without new round trips.
// History needed for "as of" figures (stock, udhaar, job-work dues) is
// loaded in full; date-only lists are limited to the requested span.
import { NextRequest, NextResponse } from "next/server";
import { safeDbCall } from "@/lib/db";
import { loadHubData } from "@/lib/hubData";
import { getUser, isValidDate } from "@/lib/registerServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: "from/to=YYYY-MM-DD are required" }, { status: 400 });
  }

  const result = await safeDbCall(() => loadHubData(from, to));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, loadedAt: new Date().toISOString() });
}
