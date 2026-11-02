// 💾 GET → the full backup zip (owner).
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { backupZip } from "@/lib/backupServer";
import { businessDate } from "@/lib/register";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  try {
    const { bytes } = await backupZip();
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="second-brain-backup_${businessDate(Date.now())}.zip"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Backup failed." }, { status: 503 });
  }
}
