// Server-only: save a proof / scan, then file it in Google Drive.
//
// Order matters: the row (with the image in `dataUrl`) is written FIRST, so a
// signature is never lost if Drive is slow or not set up. Only after Drive
// confirms the file is the image cleared from the database.

import { prisma } from "@/lib/db";
import { driveConfigured, uploadToDrive } from "@/lib/driveUpload";
import { PROOF_META, fileNameFor, folderPath, parseDataUrl, type ProofKind } from "@/lib/proofs";

export interface SaveInput {
  kind: ProofKind;
  date: string;
  dataUrl: string;
  registerEntryId?: string | null;
  partyName?: string | null;
  amountInr?: number | null;
  refNo?: string | null;
  fields?: Record<string, unknown> | null;
  aiFields?: Record<string, unknown> | null;
  notes?: string | null;
  capturedAt?: Date | null;
  geo?: { lat: number; lng: number; acc?: number } | null;
  device?: string | null;
  createdByName?: string | null;
}

// Fields every list / API answer sends (never the heavy dataUrl).
export const LIGHT_SELECT = {
  id: true,
  kind: true,
  date: true,
  registerEntryId: true,
  fileName: true,
  folder: true,
  mime: true,
  sizeBytes: true,
  driveFileId: true,
  driveUrl: true,
  driveError: true,
  partyName: true,
  amountInr: true,
  refNo: true,
  fields: true,
  aiFields: true,
  notes: true,
  capturedAt: true,
  geo: true,
  device: true,
  createdByName: true,
  createdAt: true,
  registerEntry: { select: { id: true, kind: true, amountInr: true, partyName: true, paymentMode: true, date: true } },
} as const;

function detailsLine(fields: unknown): string {
  if (!fields || typeof fields !== "object") return "";
  return Object.entries(fields as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ")
    .slice(0, 900);
}

/** Upload one saved row's image to Drive and record the outcome. */
export async function pushToDrive(id: string) {
  const row = await prisma.attachment.findUnique({
    where: { id },
    include: { registerEntry: { select: { kind: true, amountInr: true } } },
  });
  if (!row) return { ok: false, error: "Not found" };
  if (row.driveFileId) return { ok: true, id: row.driveFileId, url: row.driveUrl || undefined };
  const parsed = parseDataUrl(row.dataUrl);
  if (!parsed) return { ok: false, error: "No image kept for this record." };

  const r = await uploadToDrive({
    folderPath: row.folder.split("/"),
    fileName: row.fileName,
    mime: parsed.mime,
    base64: parsed.base64,
    log: {
      date: row.date,
      type: PROOF_META[row.kind as ProofKind]?.en || row.kind,
      party: row.partyName,
      amount: row.amountInr,
      ref: row.refNo,
      entry: row.registerEntry ? `${row.registerEntry.kind} ₹${Math.round(row.registerEntry.amountInr)} (${row.registerEntryId})` : "",
      by: row.createdByName,
      details: detailsLine(row.fields),
    },
  });
  if (r.ok) {
    await prisma.attachment.update({
      where: { id },
      data: { driveFileId: r.id, driveUrl: r.url, driveError: null, dataUrl: null },
    });
  } else {
    await prisma.attachment.update({ where: { id }, data: { driveError: (r.error || "failed").slice(0, 300) } });
  }
  return r;
}

export async function saveAttachment(input: SaveInput) {
  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) throw new Error("BAD_IMAGE");
  const at = input.capturedAt || new Date();
  const fileName = fileNameFor({
    kind: input.kind,
    date: input.date,
    at,
    mime: parsed.mime,
    party: input.partyName,
    amountInr: input.amountInr,
    ref: input.refNo,
  });
  const row = await prisma.attachment.create({
    data: {
      kind: input.kind,
      date: input.date,
      registerEntryId: input.registerEntryId || null,
      fileName,
      folder: folderPath(input.kind, input.date).join("/"),
      mime: parsed.mime,
      sizeBytes: parsed.bytes,
      dataUrl: input.dataUrl,
      driveError: driveConfigured() ? null : "Google Drive upload is not set up yet.",
      partyName: input.partyName || null,
      amountInr: input.amountInr ?? null,
      refNo: input.refNo || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fields: (input.fields as any) ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aiFields: (input.aiFields as any) ?? undefined,
      notes: input.notes || null,
      capturedAt: at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geo: (input.geo as any) ?? undefined,
      device: input.device || null,
      createdByName: input.createdByName || null,
    },
    select: { id: true },
  });
  const drive = driveConfigured() ? await pushToDrive(row.id) : { ok: false, error: "Google Drive upload is not set up yet." };
  const saved = await prisma.attachment.findUnique({ where: { id: row.id }, select: LIGHT_SELECT });
  return { data: saved, drive };
}

/** True when the Attachment table exists (i.e. `prisma db push` has been run). */
export function missingTable(err: string): boolean {
  return /P2021|(table|relation)[^.]*Attachment[^.]*does not exist/i.test(err);
}
export const TABLE_HINT =
  "The proofs table isn't in the database yet. On the PC run: npx prisma db push (once), then try again.";
