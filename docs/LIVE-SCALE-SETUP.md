# Live scale and tank-indicator setup

## Data path

The Vercel application cannot connect directly to a device on the private shop network. A small bridge therefore runs on the same Windows computer as Chrome:

`Indicator → Airtel LAN → Windows scale_bridge.py → Chrome → business form`

No scale reading is sent to Vercel until the operator saves a normal sale or manufacturing transaction.

## Indicator network settings

Give every indicator a DHCP reservation/static IP. The app currently gives friendly names to:

- `192.168.1.61` — Essae Primary Counter
- `192.168.1.62` — Tank / Bulk Station

Configure each indicator in TCP-client/continuous-output mode. Its destination IP must be the Windows PC's LAN IPv4 address; its destination port must match `--scale-port` below. Do not use `127.0.0.1` in an indicator—on the indicator that means the indicator itself.

## Windows installation

Open PowerShell in the repository folder:

```powershell
py -m pip install -r tools/scale-requirements.txt
py tools/scale_bridge.py --scale-port 9000
```

Replace `9000` with the TCP port configured in the SI-810. Allow inbound TCP for that port in Windows Firewall, limited to the Private network profile.

Open **Live Scales** in the app. The default browser address is `ws://127.0.0.1:8765`. Select the card that should fill the active form.

## How automatic filling works

- Sales: select or focus an invoice line. Its quantity follows the selected live scale.
- Manufacturing: focus a seed or Step 1–4 weight input. That field follows the selected scale.
- Inventory: live tank values appear separately from accounting stock. They do not rewrite the item master.
- Disable **Auto-fill** before typing a manual correction.

Only non-negative numeric packets marked stable are accepted by the app. Saved transactions remain the authoritative audit record.

