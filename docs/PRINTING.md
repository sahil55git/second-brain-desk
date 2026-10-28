# Printing labels and slips

Every label and slip page (barrel labels, barrel slips, receiving labels, receiving slips) has a **How to print** panel with six ways to print. Pick one; the app remembers the choice on that device.

| Way | Use it on | What it does | Needs |
|---|---|---|---|
| **Print window** | any PC, phone, tablet | Chrome's usual print window | the printer installed on that device |
| **Bluetooth / USB** | Android tablet / phone, Windows / Mac PC (Chrome or Edge) | Prints **straight to the printer** from this device. Nothing else needs to be on. | the printer's Bluetooth (BLE) or a USB cable |
| **Shop printer** | any phone, tablet or PC | Sends the label to the shop PC, which prints it on its USB printer | `print_helper.py --queue-url` running on the shop PC |
| **Share to app** | phones and tablets | Makes a picture at the exact label size and shares it to the printer's own app | the printer's Android app |
| **One-click** | shop PC | Prints with no window, to the printer last used | a special Chrome shortcut (downloaded from the panel) |
| **This PC's helper** | shop PC | Prints to a named printer at the exact paper size, no window | `py tools/print_helper.py` running |

The paper size is chosen above the panel (4 × 6 in, 50 × 75 mm, 50 × 30 mm, 80 mm roll, or any size typed in mm). On a phone the size list starts folded: tap "Paper size" to change it.

## 1. Print window

Pick the printer, paper = the size shown, **Margins: None**, **Scale: 100%**, **Headers and footers: off**. A blank second page no longer comes out: a narrow page used to pick up the phone layout's bottom space.

## 2. Bluetooth / USB: print from the tablet, phone or PC by itself

On a phone or tablet this mode is chosen the first time (if the browser allows it).

The browser opens the printer itself (Web Bluetooth / WebUSB) and sends the printer's own commands. No app, no driver, no shop PC. It works in **Chrome or Edge** on Android, Windows, Mac and Linux, on the https address of the app. It does **not** work in iPhone / iPad browsers or in Firefox: use Share to app or Shop printer there.

### First time

1. Switch the printer on. Close the printer's own app (WePrint) and switch Bluetooth off on any other phone or PC it was used with: a printer talks to one device at a time.
2. In the app choose **Bluetooth / USB**, tap **Connect Bluetooth**, pick the printer in Chrome's list, tap **Pair**. **Do not pair it in Android Settings first**; Chrome scans for it itself (printers that use Bluetooth Low Energy often do not appear in Android's own list at all).
3. Tap **Test label**. A frame, a **solid** square in the top-left corner, two diagonals and bars should come out.
   - Solid square and frame: all good.
   - Hollow square, or the label all black: tick / untick **Invert (TSPL)**.
   - Nothing printed, or rubbish text: change **Printer language** (TSPL for most label printers, ESC/POS for receipt printers, ZPL for Zebra-style) and test again.
   - Too light / too dark: **Darkness**.
   - Label feeds the wrong length: set **Gap between labels** (0 for a continuous roll).
4. Print a real label. The settings are remembered on that device, separately for labels and for slips.

### If the tablet cannot find the printer

- Android needs **Bluetooth** and **Location** on, and Chrome allowed under Settings → Apps → Chrome → Permissions → **Nearby devices**.
- The printer must not be connected to anything else, and may only be visible while its Bluetooth light is blinking (hold the power button a few seconds).
- Open **What the app found on the printer** in the panel: it lists the services and write channels it saw. If it says it found no print channel, the printer uses a service id the app does not know yet: type it under **Advanced → Printer service id**, or send the text (Copy button) to the developer.
- If the printer is classic-Bluetooth only (no BLE) the browser cannot reach it. Use the **USB cable** instead: a USB-C OTG cable from the tablet to the printer, switch it on, tap **Connect USB**. The next time, **Use the USB printer from before** connects without the chooser.
- On a Windows PC the normal printer driver holds the USB port, so USB direct usually does not work there: use Bluetooth, the Print window, or the helper.

### If the label prints in pieces, stops half way or comes out garbled

Over Bluetooth the data goes in small pieces. Under **Advanced** lower **Bluetooth piece size** (try 60, then 20) and raise **Pause** (try 40 ms). The app already halves the piece size by itself when the printer refuses a write.

## 3. Shop printer (the shop PC prints for every device)

For when the tablet / phone cannot reach the printer at all. The app keeps a queue of jobs; the shop PC picks them up and prints them on its USB printer.

1. In Vercel add an environment variable **PRINT_QUEUE_SECRET** (any long random text; the scale bridge's `SCALE_PUSH_SECRET` also works) and redeploy.
2. On the shop PC (same secret in the environment):
   ```powershell
   set PRINT_QUEUE_SECRET=the-same-text
   py tools/print_helper.py --queue-url https://your-app.vercel.app/api/print-jobs/agent --label-printer "H30C" --slip-printer "POSIFLOW"
   ```
   `--dry-run` saves the pictures instead of printing, for a test.
3. On any device choose **Shop printer**, press the big button. The panel shows whether the shop PC is on, and the last jobs with **Cancel** (while waiting) and **Print again**.

Jobs wait in the queue if the shop PC is off and print when it starts. A job the PC took but never finished shows as failed after 3 minutes; a job nobody printed for 6 hours is cancelled.

## 4. Share to app (phones and tablets with a printer app)

1. Tap **Make pictures**. (The picture is made at 203 dpi at the exact paper size, e.g. 50 × 75 mm = 400 × 600 dots.)
2. Tap **Share to printer app** and choose your Bluetooth printer's app (the one you used to pair it).
3. In that app choose the same label size and print.
4. If the app is not in the share list, tap **Save pictures**; the files go to Downloads and you open them from inside the printer's app.

## 5. One-click (no print window)

Chrome can print without the window when it is opened with `--kiosk-printing`. In the panel choose **One-click** and download the shortcut:

- **Labels shortcut (.bat)** for the label printer, **Slips shortcut (.bat)** for the receipt printer.
- Double-click the file (from Downloads). It opens the app in its own Chrome window. Log in once in that window (it keeps its own login, separate from your usual Chrome).
- First time only: press Print, choose the printer and paper size in the Chrome window, Print. After that every Print button in that window prints by itself, to that printer.
- Each shortcut keeps its own Chrome profile (`%LOCALAPPDATA%\MahadevPrint\labels` and `\slips`), so the label printer and the receipt printer do not disturb each other, and the usual Chrome is not changed.
- **Copies** works here: the page sends the job that many times.

## 6. This PC's helper (exact size, named printer)

A small Python program on the shop PC (the same PC as the scale bridge; no packages to install).

```powershell
py tools/print_helper.py            # normal
py tools/print_helper.py --dry-run  # test: saves the pictures to a print-jobs folder, prints nothing
```

1. Start it. It shows a **pairing code** like `3FA9-0C1B-77DE-92A4` (the same every time; `--show-code` shows it again).
2. In the app open the print page on that PC, choose **This PC's helper**. The dot turns green when it finds the helper (if Chrome asks to allow this site to connect to devices on your network, choose Allow).
3. Paste the pairing code once, choose the printer (labels and slips remember their own printer), set copies, and print.

How it stays safe: it listens only on `127.0.0.1` (this computer), every request except "is it running" needs the pairing code, and only PNG pictures up to 100 per job and 50 copies are accepted. It prints through Windows (PowerShell, System.Drawing) at the page size the app sends, with no margins; roll slips take their length from the picture.

Test it before using paper: run with `--dry-run`, press Print, and look in the `print-jobs` folder: the picture's size should match the label (203 dpi).

## What is tested and what is not

- Tested here (headless Chrome against the running app, with a **simulated** Bluetooth printer that records every byte): every label size prints one page; slips print one page; the Bluetooth / USB mode connects, sends a correct TSPL label (size, gap, darkness, 1-bit bitmap of the right size, copies) and copes with a printer that refuses big writes; the helper mode sends exact-size pictures; share mode makes and saves exact-size pictures; the shop queue routes (login, secret, claim, done, cancel, reprint) and the helper's checks (23 tests, `py -m unittest tools/test_print_helper.py`); the printer languages TSPL, ESC/POS and ZPL byte by byte (`lib/__tests__/printerLang.test.ts`).
- **Not tested** (needs your hardware): the real Helett H30C over Bluetooth or USB. Which language it wants (TSPL, ESC/POS or ZPL), whether its bitmap is "0 = black", and whether its Bluetooth is BLE are not known from here, which is why there is a **Test label** and the language / Invert / piece-size settings. Also not tested: the POSIFLOW printer, the Windows driver path, the Chrome shortcut on your PC, and sharing to your printer's app. Print one test label on each path and scan a real one before a full roll.

## Label text

On tall labels (50 × 75 mm, 4 × 6 in) the tare date, the code (BRL-01) and the QR are larger so they are readable on a 203 dpi thermal print.
