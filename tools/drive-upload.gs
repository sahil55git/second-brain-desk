/**
 * Mahadev Traders — Second Brain Desk → Google Drive uploader.
 *
 * Saves signatures, payment photos and scanned slips / bills from the app
 * into Google Drive, each in its own folder:
 *
 *   My_Oil_Business_Second_Brain/
 *     06_Scans_&_Proofs/
 *       Payment_Signatures/2026-10/2026-10-10_14-32-05_Signature_Ramesh_Rs5000.png
 *       Payment_Recipient_Photos/2026-10/…
 *       Payment_Thumb_&_Vouchers/2026-10/…
 *       Weighbridge_Slips/2026-10/…
 *       Weighing_Slips/2026-10/…
 *       Bills_&_Invoices/2026-10/…
 *       Receipts/2026-10/…
 *       scans_and_proofs_log   ← Google Sheet, one row per file
 *
 * ONE-TIME SETUP (about 5 minutes, on a computer, signed in as the Google
 * account that owns My_Oil_Business_Second_Brain):
 *   1. Open https://script.google.com → New project. Name it
 *      "Second Brain Desk uploader".
 *   2. Delete the sample code and paste this whole file.
 *   3. Change SECRET below to a long random phrase only you know
 *      (e.g. 30+ letters and numbers). Keep ROOT_FOLDER_ID as is.
 *   4. Click Deploy → New deployment → gear icon → Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *      → Deploy → allow the permissions it asks for (Drive + Sheets) →
 *      copy the Web app URL (ends in /exec).
 *   5. Vercel → project mahadev-second-brain → Settings → Environment
 *      Variables → add
 *        DRIVE_UPLOAD_URL    = the Web app URL from step 4
 *        DRIVE_UPLOAD_SECRET = the same SECRET as step 3
 *      → Redeploy.
 *   6. In the app: Settings → Proofs & scans → "Send test file".
 *
 * "Anyone" access is needed so the app's server can reach the script; the
 * SECRET is what stops anybody else from using it. If you ever change the
 * code, use Deploy → Manage deployments → Edit → New version, so the URL
 * stays the same.
 */

var SECRET = 'CHANGE-ME-to-a-long-random-phrase';
var ROOT_FOLDER_ID = '1KkWnhY1GOzH0aRIqY4zOngG8Pp6QcVH-'; // My_Oil_Business_Second_Brain
var LOG_SHEET_NAME = 'scans_and_proofs_log';
var LOG_COLUMNS = ['Saved at', 'Business date', 'Type', 'Party', 'Amount ₹', 'Ref no.', 'Register entry', 'Saved by', 'File', 'Link', 'Folder', 'Details'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET.indexOf('CHANGE-ME') === 0) return reply({ ok: false, error: 'Set SECRET in the script first.' });
    if (body.secret !== SECRET) return reply({ ok: false, error: 'Wrong secret.' });
    if (!body.base64 || !body.fileName || !body.folderPath || !body.folderPath.length) {
      return reply({ ok: false, error: 'Missing file.' });
    }

    var folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    for (var i = 0; i < body.folderPath.length; i++) folder = childFolder(folder, String(body.folderPath[i]));

    var bytes = Utilities.base64Decode(body.base64);
    var blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', String(body.fileName));
    var file = folder.createFile(blob);
    file.setDescription('Saved by Second Brain Desk');

    if (body.log) {
      try {
        logRow(body.log, file, body.folderPath.join('/'));
      } catch (logErr) {
        // The file is saved; a log hiccup must not lose it.
      }
    }
    return reply({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// Opening the URL in a browser shows this, which is a quick "is it alive" check.
function doGet() {
  return reply({ ok: true, service: 'Second Brain Desk uploader' });
}

function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function logRow(log, file, folderPath) {
  var root = childFolder(DriveApp.getFolderById(ROOT_FOLDER_ID), folderPath.split('/')[0]);
  var it = root.getFilesByName(LOG_SHEET_NAME);
  var ss;
  if (it.hasNext()) {
    ss = SpreadsheetApp.open(it.next());
  } else {
    ss = SpreadsheetApp.create(LOG_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ss.getSheets()[0].appendRow(LOG_COLUMNS);
    ss.getSheets()[0].setFrozenRows(1);
  }
  var sh = ss.getSheets()[0];
  sh.appendRow([
    new Date(),
    log.date || '',
    log.type || '',
    log.party || '',
    log.amount === null || log.amount === undefined ? '' : log.amount,
    log.ref || '',
    log.entry || '',
    log.by || '',
    file.getName(),
    file.getUrl(),
    folderPath,
    log.details || '',
  ]);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
