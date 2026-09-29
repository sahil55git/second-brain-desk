# Live scale and tank-indicator setup

## Data path

The Vercel application cannot connect directly to a device on the private shop network. A small bridge therefore runs on the same Windows computer as Chrome:

`Karadi SI-850 → direct Ethernet cable → Quantum USB-to-Ethernet adapter → Windows bridge → Chrome`.

The laptop can remain connected to Wi-Fi for internet. The scale connection does not need the Wi-Fi router. **Settings → Scale connections** stores the confirmed connection and other scale profiles in the business database. Saving a profile does not remotely change Windows or the indicator.

Karadi tank readings are sent to the signed-in app database once per minute while the business app is open. Transfer records are saved only when the operator confirms a start and finish weight. Historical measurements from before the register is installed are not recreated.

## Indicator network settings

The confirmed SI-850 Karadi tank is a TCP server at `192.168.50.248:4321` via the laptop's `Ethernet 4` Quantum USB-to-Ethernet adapter, manually configured as `192.168.50.10` / `255.255.255.0`. Leave the **Ethernet** default gateway blank for this isolated cable. The bridge names it `SI850-KARADI`. Its browser bridge address is `ws://127.0.0.1:8765`.

Other indicators may use different network modes and protocols; verify each model before enabling it.

## Windows installation

Open PowerShell in the repository folder:

```powershell
py -m pip install -r tools/scale-requirements.txt
py tools/scale_bridge.py --si850 192.168.50.248:4321 --source SI850-KARADI
```

Close the Essae PC software first if it holds the scale connection. Keep this PowerShell process open. A different indicator operating as a TCP client can later use a separately configured `--scale-port` listener after its data format is verified.

If using the known working downloaded file rather than the updated repository, the confirmed laptop command was:

```powershell
py "$env:USERPROFILE\Downloads\scale_bridge_si850_20260925.py" --si850 192.168.50.248:4321 --source SI850-KARADI
```

The updated repository bridge supports multiple SI-850s over the same browser socket, each with its own source ID and address:

```powershell
py .\tools\scale_bridge.py --si850-device SI850-KARADI@192.168.50.248:4321 --si850-device SECOND-TANK@192.168.50.249:4321
```

Only enable the second scale once its model/protocol and IP have been checked. Do not run two bridges both claiming browser port 8765. Other TCP server devices can be inspected with `--tcp-device SOURCE@HOST:PORT --debug-raw`; scale-as-client devices can connect to `--scale-port PORT --debug-raw`. Their unknown packets are **not** turned into weight readings until a decoder is verified. A serial/USB scale will need a new driver and protocol check.

Open **Live Scales** in the app. The default browser address is `ws://127.0.0.1:8765`. Karadi is named **Karadi Oil Tank (SI-850)** and is monitoring only until its stability flag is verified.

## Connection checks

1. In PowerShell, `Get-NetIPAddress -InterfaceAlias 'Ethernet 4' -AddressFamily IPv4` should show `192.168.50.10` and prefix length `24`.
2. `ping 192.168.50.248` checks reachability. `Test-NetConnection 192.168.50.248 -Port 4321` should show `TcpTestSucceeded : True`.
3. If TCP works but readings are absent, close the official Essae application and start the correct binary SI-850 bridge. Check its console for `[SI-850] SI850-KARADI: ... kg`, then the Live Scales page. A green **Local bridge connected** badge only confirms the browser link.
4. If TCP fails, inspect cable and adapter link, the saved IP and subnet, and whether another device uses the same address. Restart the scale after changing its Ethernet settings.
5. For a wired switch, use unique scale addresses in the laptop's subnet. For a Wi-Fi client bridge, connect it to the shop Wi-Fi and place its Ethernet scales on the router's LAN subnet. Update both the device IP and the saved profile. Each device needs a unique source name and IP.

Settings profiles persist in the application database after the schema is applied; profile edits do not automatically change live equipment or start the local Windows bridge. The business app's Live Scales browser address is stored in that browser separately. Automatic readings require the Windows bridge and the app to be open.

## Try the spare ASUS router with the existing scale address

For a **wired, isolated** test, connect Karadi SI-850 to an ASUS **LAN** port and the laptop's Quantum adapter to another **LAN** port. Leave the ASUS WAN port empty. Keep scale `192.168.50.248/24`, laptop Ethernet `192.168.50.10/24`, bridge `--si850-device SI850-KARADI@192.168.50.248:4321`. The ASUS LAN switch passes traffic between those two addresses even if its own management address is in another subnet. For easier management, set the ASUS LAN IP to an unused `192.168.50.1` if the model allows it, and reserve `.10` and `.248` outside its DHCP pool. Keep the Ethernet gateway empty and use the laptop's existing Wi-Fi for internet. Never reuse an occupied IP.

If you connect the ASUS to the **existing home Wi-Fi/router** as an access point or client bridge, first check which network it actually places the scale on. If it bridges into the GPON `192.168.1.x/24` LAN, the scale usually needs a unique `192.168.1.x` address and the profile must be updated. If it runs NAT/client router mode, the laptop on the home LAN may not be able to reach the scale; verify from the laptop with `Test-NetConnection SCALE_IP -Port 4321` before changing software. ASUS's AP setup depends on the specific router model: https://www.asus.com/support/faq/1015009/ . Do not change the known working direct-cable profile until the new cabling passes ping, TCP test and a live 5-second SI-850 poll.

## Supported connection paths

| Physical path | Bridge method | Current data handling |
| --- | --- | --- |
| Ethernet direct, switch, ASUS LAN, native Wi-Fi or transparent Wi-Fi client bridge for verified SI-850 | `--si850-device SOURCE@HOST:PORT` | Validated binary weight, stability unknown: monitoring only |
| Ethernet/Wi-Fi indicator acting as TCP server with unknown format | `--tcp-device SOURCE@HOST:PORT --debug-raw` | Raw capture pending model-specific decoder |
| Ethernet/Wi-Fi indicator acting as TCP client | `--scale-port PORT --source SOURCE --debug-raw` | One listener, raw capture pending decoder |
| RS-232 via USB-to-serial adapter or USB serial (COM port) | `--serial-device SOURCE@COM3:9600:8:N:1 --debug-raw` | Raw capture pending serial settings and decoder |
| Proprietary USB/HID scale | Model-specific driver and decoder | Not yet supported |

For serial connections, install `tools/scale-requirements.txt`, run `py tools/scale_bridge.py --list-serial` to find a COM port, then match baud/data bits/parity/stop bits to the indicator settings. The bridge reconnects after link failures and reports individual device states to Settings. A connected state is not proof of a correct weight: only a fresh, validated reading qualifies for display. When a method is raw only, capture data while the displayed weight changes and verify its format before implementing a decoder.

After deploying code and applying `npx prisma db push` to the app database, **Settings → Scale connections** saves profiles for different devices and wiring paths. The generated command runs multiple supported sources through one browser bridge (`ws://127.0.0.1:8765`); restart it after changing settings. A separate bridge on another browser port requires selecting that port in Live Scales. Wi-Fi passwords and router admin credentials are not saved in the business app.

## Karadi tank register

After deploying the new app code, apply the additive Prisma schema change to the same Postgres database used by the deployment (`npx prisma db push` with its `DATABASE_URL`). Keep the signed-in business app and local bridge running for automatic one-minute timestamped weight snapshots. In **Inventory → Karadi tank register**, click **Start transfer** before filling or dispensing, and **Finish and record** afterwards. The sign of the weight change determines IN or OUT. Filter dates to see totals and download the report as CSV. Timestamps display in IST. If the browser or bridge is closed, automatic samples pause; there is no backfill. Samples are measurements, not accounting transactions. Confirm transfers against the physical tank and source paperwork.

## How automatic filling works

- Sales: select or focus an invoice line. Its quantity follows the selected live scale.
- Manufacturing: focus a seed or Step 1–4 weight input. That field follows the selected scale.
- Inventory: live tank values appear separately from accounting stock. They do not rewrite the item master.
- Disable **Auto-fill** before typing a manual correction.

Only non-negative numeric packets marked stable are accepted by the app. Saved transactions remain the authoritative audit record.
