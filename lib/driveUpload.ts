// Server-only: send an image to Google Drive through the owner's own Google
// Apps Script web app (tools/drive-upload.gs). The script runs as the owner,
// so files land in the owner's Drive under My_Oil_Business_Second_Brain and
// count against the owner's normal storage — no Google Cloud project, no
// service account, no OAuth screen.
//
// Vercel → Settings → Environment Variables:
//   DRIVE_UPLOAD_URL     the web-app URL (…/macros/s/…/exec)
//   DRIVE_UPLOAD_SECRET  the same secret typed at the top of the script
// Neither value is ever sent to a phone.

export function driveConfigured(): boolean {
  return !!(process.env.DRIVE_UPLOAD_URL && process.env.DRIVE_UPLOAD_SECRET);
}

export interface DriveResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}

const TIMEOUT_MS = 45000;

export async function uploadToDrive(opts: {
  folderPath: string[];
  fileName: string;
  mime: string;
  base64: string;
  // One row per file is also added to the "scans_and_proofs_log" Sheet in
  // the 06_Scans_&_Proofs folder, so Drive stays the system of record.
  log?: Record<string, string | number | null>;
}): Promise<DriveResult> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) return { ok: false, error: "Google Drive upload is not set up yet (DRIVE_UPLOAD_URL / DRIVE_UPLOAD_SECRET)." };
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    return { ok: false, error: "DRIVE_UPLOAD_URL must be a script.google.com web-app URL." };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Apps Script answers a POST with a redirect to the result; fetch follows
    // it (as a GET), which is how Apps Script web apps are meant to be read.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, folderPath: opts.folderPath, fileName: opts.fileName, mimeType: opts.mime, base64: opts.base64, log: opts.log || null }),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: { ok?: boolean; id?: string; url?: string; error?: string } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok || !json) {
      const hint = /<html/i.test(text) ? " (got a web page — check the script is deployed with access 'Anyone')" : "";
      return { ok: false, error: `Drive upload failed: HTTP ${res.status}${hint}` };
    }
    if (!json.ok || !json.id) return { ok: false, error: `Drive: ${json.error || "upload refused"}` };
    return { ok: true, id: json.id, url: json.url || `https://drive.google.com/file/d/${json.id}/view` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "Drive upload timed out." : `Drive upload failed: ${err instanceof Error ? err.message : "network error"}` };
  } finally {
    clearTimeout(timer);
  }
}
