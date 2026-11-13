# Bluetooth weighing scale (iScale and similar)

Live weight from a Bluetooth scale straight into the app, on the Android app and on a computer,
with no bridge program. Built for **iScale** Bluetooth scales, which send the weight as plain
text lines all the time over the Bluetooth serial port (9600 or 2400 baud, 8N1), for example
`+ 012.345 kg`. Any scale that sends the same kind of line works.

Open **Live Scales** → **Bluetooth scale**.

## Set-up, once per device

**Android app (Mahadev Desk 1.3 or newer)**
1. Switch the scale on. Pair it in Android **Settings → Bluetooth** (PIN is usually `1234` or `0000`).
2. In the app: Live Scales → **Choose scale** → tap the scale. Allow "Nearby devices" if asked.

**Computer (Chrome or Edge)**
1. Switch the scale on. Pair it in Windows **Settings → Bluetooth & devices**.
2. In the app: Live Scales → **Choose scale** → pick the scale (or its COM port) from the browser's list.
3. If nothing readable arrives, change **Speed** to 2400.

A phone's normal browser cannot open this kind of Bluetooth; use the app.

## Check it before trusting it

Put a known weight on the scale and compare the big number on the screen with the scale's own
display. When they match, tick **"I compared this with the scale's own display and it is
correct"**. Until then the scale is watch-only: no weight is filled into a form and nothing is
saved. The tick is remembered per device and per scale.

"Show what the scale is sending" lists the last lines received; ✓ = understood, ✗ = dropped.

## What it does once connected

- **Fills weights in forms**: the Bluetooth scale appears in the same list as the other scales.
  Sales lines, manufacturing steps, barrel weighing and smart entry use "the selected scale"
  exactly as before. Only a **steady** weight is used.
- **Weighing log**: each time a load comes to rest (0.5 kg or more) the weight is saved once,
  with the time and the scale's name. Putting the same barrel on again saves again; a barrel
  left sitting does not. The log is on the same page, per day, with CSV. These are
  measurements, not stock or money entries. The barrel desks pick them up as "ready to capture".
- **No internet**: saved weights are kept on the device (up to 300) and sent when the internet
  returns, each exactly once.

## Staying connected

The app reconnects by itself and never stops trying until **Disconnect** is pressed:

| What happens | What the app does |
|---|---|
| Scale switched off, out of range, or Bluetooth off | Tries again after 1 s, 2 s, 4 s, 8 s, then every 15 s |
| Link looks open but no weight for 3 s | Shows "no weight coming"; the old weight is no longer steady |
| No weight for 8 s | Closes the link and connects again |
| Data arrives but is not a weight | Says so (usually the wrong speed) and reconnects |
| Phone was asleep | Checks the link the moment the screen comes back |
| Permission refused / scale never chosen on this device | Waits for a person (**Try now**) |
| Page reloaded in the Android app | Keeps the same link, no reconnect |

One scale talks to one device at a time. If the phone holds the scale, the computer cannot
connect until the phone disconnects.

## What is read and what is refused

Accepted: one number with `kg` or `g` at the end of the line, an optional sign, and an optional
status word in front (`ST,GS,+0014.55kg`). When the scale sends `ST` / `US` that decides steady;
otherwise steady means the same value four times in a row over at least 0.6 s.

Refused, never guessed: other units (lb, oz, pcs), a number with no unit, two numbers on one
line, error words (`OL`, `ERR`), anything above 1000 kg.

## Code

`lib/scaleAscii.ts` (reading lines, steady, one-save-per-load), `lib/scaleLink.ts` (connection
rules), `lib/scaleBt.ts` (driver; Web Serial on a computer, the `MahadevScale` plugin in the
app), `components/scale/useBtScale.ts`, `components/scale/BluetoothScalePanel.tsx`,
`app/api/scale-ticks/record` and `/log`, `MahadevScalePlugin.java`. Tests:
`lib/__tests__/scaleAscii.test.ts`, `scaleLink.test.ts`, `scaleBt.test.ts`.

Not tested against a real iScale yet: the line format is taken from iScale's published
description. The check step above is what confirms it on your scale.
