// Proofs & scans — list (GET) and save (POST).
// Anyone signed in can save. The Owner sees every record; Staff see only
// today's, so a proof can be checked at the counter but not browsed later.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { LIGHT_SELECT, TABLE_HINT, missingTable, saveAttachment } from "@/lib/attachmentServer";
import { driveConfigured } from "@/lib/driveUpload";
import { MAX_IMAGE_BYTES, isProofKind, isScanKind, normalizeScan, parseDataUrl } from "@/lib/proofs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dbError(err: string) {
  return NextResponse.json({ error: missingTable(err) ? TABLE_HINT : err }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const today = businessDate(Date.now());
  let from = sp.get("from");
  let to = sp.get("to");
  if (!user.isOwner) {
    from = today;
    to = today;
  }
  const kind = sp.get("kind");
  const entryId = sp.get("entry");
  const where: Record<string, unknown> = {};
  if (entryId) where.registerEntryId = entryId;
  else {
    if (!isValidDate(from) || !isValidDate(to)) {
      return NextResponse.json({ error: "from / to = YYYY-MM-DD are required" }, { status: 400 });
    }
    where.date = { gte: from, lte: to };
  }
  if (kind && isProofKind(kind)) where.kind = kind;
  if (kind === "payment") where.kind = { in: ["SIGNATURE", "RECIPIENT_PHOTO", "THUMB_PAPER"] };
  if (kind === "scan") where.kind = { in: ["WEIGHBRIDGE", "WEIGHING", "BILL", "RECEIPT"] };
  if (sp.get("pending") === "1") where.driveFileId = null;

  const result = await safeDbCall(() =>
    prisma.attachment.findMany({ where, select: LIGHT_SELECT, orderBy: { createdAt: "desc" }, take: 500 })
  );
  if (!result.ok) return dbError(result.error);
  // Staff only see today's records, and only the ones linked to entries they could see anyway.
  const data = user.isOwner || !entryId ? result.data : result.data.filter((a) => a.date === today);
  return NextResponse.json({ data, driveConfigured: driveConfigured() });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (!isProofKind(body.kind)) return NextResponse.json({ error: "Unknown proof type" }, { status: 400 });
  if (!isValidDate(body.date)) return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  const img = parseDataUrl(body.dataUrl);
  if (!img) return NextResponse.json({ error: "The picture could not be read. Take it again." }, { status: 400 });
  if (img.bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The picture is too large." }, { status: 413 });
  // Staff can only file proofs for today (no back-dated evidence).
  if (!user.isOwner && body.date !== businessDate(Date.now())) {
    return NextResponse.json({ error: "Only the owner can save proofs for an earlier day." }, { status: 403 });
  }

  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const amount = Number(body.amountInr);
  const geo =
    body.geo && Number.isFinite(Number(body.geo.lat)) && Number.isFinite(Number(body.geo.lng))
      ? { lat: Number(body.geo.lat), lng: Number(body.geo.lng), acc: Number(body.geo.acc) || undefined }
      : null;
  const captured = body.capturedAt ? new Date(body.capturedAt) : null;
  const capturedAt = captured && !Number.isNaN(+captured) && Math.abs(+captured - Date.now()) < 36 * 3600 * 1000 ? captured : new Date();

  const fields = isScanKind(body.kind) && body.fields && typeof body.fields === "object" ? normalizeScan(body.kind, body.fields) : null;
  const aiFields = isScanKind(body.kind) && body.aiFields && typeof body.aiFields === "object" ? normalizeScan(body.kind, body.aiFields) : null;

  const result = await safeDbCall(async () => {
    let entryId: string | null = str(body.registerEntryId, 40);
    if (entryId) {
      const e = await prisma.registerEntry.findUnique({ where: { id: entryId }, select: { id: true, date: true } });
      if (!e) entryId = null;
      else if (!user.isOwner && e.date !== businessDate(Date.now())) throw new Error("OWNER_ONLY");
    }
    return saveAttachment({
      kind: body.kind,
      date: body.date,
      dataUrl: body.dataUrl,
      registerEntryId: entryId,
      partyName: str(body.partyName, 120),
      amountInr: Number.isFinite(amount) && amount > 0 ? amount : null,
      refNo: str(body.refNo, 60),
      fields,
      aiFields,
      notes: str(body.notes, 500),
      capturedAt,
      geo,
      device: str(body.device, 160),
      createdByName: user.name || null,
    });
  });
  if (!result.ok) {
    if (result.error.includes("OWNER_ONLY")) return NextResponse.json({ error: "Only the owner can attach proofs to an earlier day's entry." }, { status: 403 });
    return dbError(result.error);
  }
  return NextResponse.json({ data: result.data.data, drive: result.data.drive }, { status: 201 });
}
