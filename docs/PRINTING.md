# Printing labels and slips

Every label and slip page (barrel labels, barrel slips, receiving labels, receiving slips) has a **How to print** panel with four ways to print. Pick one; the app remembers the choice on that device.

| Way | Use it on | What it does | Needs |
|---|---|---|---|
| **Print window** | any PC, phone, tablet | Chrome's usual print window | the printer installed on that device |
| **Phone / tablet** | Redmi Pad, phones, Bluetooth printers | Makes a picture at the exact label size and shares it to the printer's own app | the printer's Android app |
| **One-click** | shop PC | Prints with no window, to the printer last used | a special Chrome shortcut (downloaded from the panel) |
| **Print helper** | shop PC | Prints to a named printer at the exact paper size, no window | `py tools/print_helper.py` running |

The paper size is chosen above the panel (4 × 6 in, 50 × 75 mm, 50 × 30 mm, 80 mm roll, or any size typed in mm). On a phone the size list starts folded: tap "Paper size" to change it.

## 1. Print window (default)

Pick the printer, paper = the size shown, **Margins: None**, **Scale: 100%**, **Headers and footers: off**. A blank second page no longer comes out: a narrow page used to pick up the phone layout's bottom space.

## 2. Phone / tablet (Bluetooth printers)

On a phone or tablet this mode is chosen the first time.

1. Open the label or slip page. Tap **Make pictures**. (The picture is made at 203 dpi at the exact paper size, e.g. 50 × 75 mm = 400 × 600 dots.)
2. Tap **Share to printer app** and choose your Bluetooth printer's own app (the app you used to pair it).
3. In that app choose the same label size and print.
4. If your printer's app is not in the share list, tap **Save pictures**; the files go to Downloads and you open them from inside the printer's app.

The browser cannot talk to a Bluetooth printer by itself, so it hands the picture to the printer's app. The page does not know your printer's model yet; if you tell us the model and its app, a direct Bluetooth route can be added.

## 3. One-click (no print window)

Chrome can print without the window when it is opened with `--kiosk-printing`. In the panel choose **One-click** and download the shortcut:

- **Labels shortcut (.bat)** for the label printer, **Slips shortcut (.bat)** for the receipt printer.
- Double-click the file (from Downloads). It opens the app in its own Chrome window. Log in once in that window (it keeps its own login, separate from your usual Chrome).
- First time only: press Print, choose the printer and paper size in the Chrome window, Print. After that every Print button in that window prints by itself, to that printer.
- Each shortcut keeps its own Chrome profile (`%LOCALAPPDATA%\MahadevPrint\labels` and `\slips`), so the label printer and the receipt printer do not disturb each other, and the usual Chrome is not changed.
- **Copies** works here: the page sends the job that many times.

## 4. Print helper (exact size, named printer)

A small Python program on the shop PC (the same PC as the scale bridge; no packages to install).

```powershell
py tools/print_helper.py            # normal
py tools/print_helper.py --dry-run  # test: saves the pictures to a print-jobs folder, prints nothing
```

1. Start it. It shows a **pairing code** like `3FA9-0C1B-77DE-92A4` (the same every time; `--show-code` shows it again).
2. In the app open the print page on that PC, choose **Print helper**. The dot turns green when it finds the helper (if Chrome asks to allow this site to connect to devices on your network, choose Allow).
3. Paste the pairing code once, choose the printer (labels and slips remember their own printer), set copies, and print.

How it stays safe: it listens only on `127.0.0.1` (this computer), every request except "is it running" needs the pairing code, and only PNG pictures up to 100 per job and 50 copies are accepted. It prints through Windows (PowerShell, System.Drawing) at the page size the app sends, with no margins; roll slips take their length from the picture.

Test it before using paper: run with `--dry-run`, press Print, and look in the `print-jobs` folder: the picture's size should match the label (203 dpi).

## What is tested and what is not

- Tested here (headless Chrome against the running app): every label size prints one page; slips print one page; the helper mode sends exact-size pictures to the helper; phone / tablet mode makes and saves exact-size pictures; the helper's checks, pairing code and printer errors (15 tests, `py -m unittest tools/test_print_helper.py`); the Chrome shortcut text.
- **Not tested** (needs your hardware): the real H30C and POSIFLOW printers through the helper (Windows drivers differ on custom paper sizes: if a label comes out shifted, set the stock to the same size in the printer's driver preferences), the Chrome shortcut on your PC, and sharing to your Bluetooth printer's app. Print one label on each path and scan it before a full roll.

## Label text

On tall labels (50 × 75 mm, 4 × 6 in) the tare date, the code (BRL-01) and the QR are larger so they are readable on a 203 dpi thermal print.
