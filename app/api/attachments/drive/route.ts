// Google Drive link for proofs & scans (Owner only):
//   GET  → is the uploader set up, how many records are still waiting
//   POST { action: "test" }  → upload a tiny test file to 06_Scans_&_Proofs/_Test
//   POST { action: "retry" } → upload every record still kept in the app
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable, pushToDrive } from "@/lib/attachmentServer";
import { driveConfigured, uploadToDrive } from "@/lib/driveUpload";
import { ROOT_FOLDER } from "@/lib/proofs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 1×1 white PNG
const TEST_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const r = await safeDbCall(() => prisma.attachment.count({ where: { driveFileId: null } }));
  return NextResponse.json({
    data: {
      configured: driveConfigured(),
      pending: r.ok ? r.data : null,
      tableMissing: !r.ok && missingTable(r.error),
      dbError: r.ok ? null : missingTable(r.error) ? TABLE_HINT : r.error,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (body.action === "test") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const r = await uploadToDrive({ folderPath: [ROOT_FOLDER, "_Test"], fileName: `test_${stamp}.png`, mime: "image/png", base64: TEST_PNG });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ data: r });
  }

  if (body.action === "retry") {
    if (!driveConfigured()) return NextResponse.json({ error: "Set DRIVE_UPLOAD_URL and DRIVE_UPLOAD_SECRET in Vercel first." }, { status: 400 });
    const list = await safeDbCall(() =>
      prisma.attachment.findMany({ where: { driveFileId: null, dataUrl: { not: null } }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 15 })
    );
    if (!list.ok) return NextResponse.json({ error: missingTable(list.error) ? TABLE_HINT : list.error }, { status: 503 });
    let done = 0;
    const errors: string[] = [];
    // A few at a time keeps each call well inside Vercel's time limit; tap again for more.
    for (const { id } of list.data) {
      const r = await safeDbCall(() => pushToDrive(id));
      if (r.ok && r.data.ok) done++;
      else errors.push(r.ok ? r.data.error || "failed" : r.error);
    }
    const left = await safeDbCall(() => prisma.attachment.count({ where: { driveFileId: null } }));
    return NextResponse.json({ data: { uploaded: done, failed: errors.length, firstError: errors[0] || null, pending: left.ok ? left.data : null } });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
