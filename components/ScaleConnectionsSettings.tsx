"use client";

import { useEffect, useState } from "react";
import { useScale } from "@/components/ScaleProvider";

type Profile = {
  id?: string; source: string; name: string; model: string;
  mode: "SI850_POLL" | "TCP_SERVER_RAW" | "TCP_LISTENER_RAW" | "SERIAL_RAW";
  topology: "DIRECT" | "SWITCH" | "ROUTER_LAN" | "WIFI_BRIDGE" | "WIFI_NATIVE" | "USB_SERIAL" | "RS232";
  scaleHost: string; scalePort: number | string; pcIp: string; subnetMask: string;
  gateway: string; adapter: string; browserPort: number | string;
  routerIp: string; serialPort: string; baudRate: number | string;
  dataBits: number | string; parity: string; stopBits: number | string;
  enabled: boolean; verified: boolean; notes: string;
};

const empty: Profile = {
  source: "", name: "", model: "", mode: "SI850_POLL", topology: "DIRECT",
  scaleHost: "", scalePort: 4321, pcIp: "", subnetMask: "255.255.255.0",
  gateway: "", adapter: "", browserPort: 8765, routerIp: "",
  serialPort: "COM3", baudRate: 9600, dataBits: 8, parity: "N", stopBits: 1,
  enabled: true, verified: false, notes: "",
};

function normalize(value: Profile): Profile {
  return { ...Object.fromEntries(Object.entries(empty).map(([key, defaultValue]) =>
    [key, (value as unknown as Record<string, unknown>)[key] ?? (typeof defaultValue === "string" ? "" : defaultValue)]
  )), id: value.id } as Profile;
}

function command(profile: Profile) {
  const prefix = "py .\\tools\\scale_bridge.py ";
  const port = Number(profile.browserPort) === 8765 ? "" : ` --browser-port ${profile.browserPort}`;
  if (profile.mode === "SERIAL_RAW") return `${prefix}--serial-device ${profile.source}@${profile.serialPort}:${profile.baudRate}:${profile.dataBits}:${profile.parity}:${profile.stopBits} --debug-raw${port}`;
  if (profile.mode === "TCP_LISTENER_RAW") return `${prefix}--scale-port ${profile.scalePort} --source ${profile.source} --debug-raw${port}`;
  if (profile.mode === "TCP_SERVER_RAW") return `${prefix}--tcp-device ${profile.source}@${profile.scaleHost}:${profile.scalePort} --debug-raw${port}`;
  return `${prefix}--si850-device ${profile.source}@${profile.scaleHost}:${profile.scalePort}${port}`;
}

function sameSubnet(left: string, right: string, mask: string): boolean | null {
  const asBytes = (text: string) => {
    const items = text.split(".").map(Number);
    return items.length === 4 && items.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? items : null;
  };
  const a = asBytes(left), b = asBytes(right), m = asBytes(mask);
  if (!a || !b || !m) return null;
  return a.every((number, index) => (number & m[index]) === (b[index] & m[index]));
}

const fieldClass = "w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2";

export default function ScaleConnectionsSettings() {
  const { readings, statuses, connected, socketUrl } = useScale();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    fetch("/api/scale-profiles")
      .then(async r => { const json = await r.json(); if (!r.ok) throw Error(json.error); return json; })
      .then(json => setProfiles((json.data as Profile[]).map(normalize)))
      .catch(err => setMessage(err instanceof Error ? err.message : "Cannot load profiles."))
      .finally(() => setLoading(false));
  }, []);

  function edit(key: keyof Profile, value: string | boolean) {
    setForm(current => current ? { ...current, [key]: value } : null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/scale-profiles", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not save profile.");
      const saved = normalize(result.data);
      setProfiles(current => [...current.filter(p => p.id !== saved.id), saved]);
      setForm(saved);
      setMessage("Profile saved. Start or restart the Windows bridge using the command below; saving does not change the scale or Windows network settings.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save profile."); }
    finally { setSaving(false); }
  }

  const field = (label: string, key: keyof Profile, placeholder = "") => (
    <label className="text-sm space-y-1" key={key}>
      <span className="opacity-75">{label}</span>
      <input className={fieldClass} value={String(form?.[key] ?? "")} placeholder={placeholder}
        onChange={e => edit(key, e.target.value)} />
    </label>
  );
  const selected = form;
  const enabled = profiles.filter(p => p.enabled && Number(p.browserPort) === 8765);
  const listeners = enabled.filter(p => p.mode === "TCP_LISTENER_RAW");
  const combined = enabled.map(p => p.mode === "SI850_POLL"
    ? `--si850-device ${p.source}@${p.scaleHost}:${p.scalePort}`
    : p.mode === "TCP_SERVER_RAW" ? `--tcp-device ${p.source}@${p.scaleHost}:${p.scalePort}`
    : p.mode === "SERIAL_RAW" ? `--serial-device ${p.source}@${p.serialPort}:${p.baudRate}:${p.dataBits}:${p.parity}:${p.stopBits}`
    : `--scale-port ${p.scalePort} --source ${p.source}`).join(" ");
  const subnet = selected?.mode !== "SERIAL_RAW" && selected?.pcIp && selected?.scaleHost
    ? sameSubnet(selected.pcIp, selected.scaleHost, selected.subnetMask) : null;
  const multiCommand = `py .\\tools\\scale_bridge.py ${combined}${enabled.some(p => p.mode !== "SI850_POLL") ? " --debug-raw" : ""}`;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Command copied."); }
    catch { setMessage("Clipboard unavailable. Select and copy the command below."); }
  }

  return <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
    <header className="flex items-center justify-between gap-2 flex-wrap">
      <div><h2 className="font-semibold">Scale connections</h2><p className="text-xs opacity-70">Saved device profiles and a local connection manual. Owner access only.</p></div>
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => { setForm({ ...empty }); setMessage(""); }}>Add scale</button>
    </header>
    <p className="text-sm">Browser bridge: <strong>{connected ? "Connected" : "Disconnected"}</strong> at <code>{socketUrl}</code>. This only confirms the browser can reach the local bridge.</p>
    {loading ? <p>Loading saved scale profiles…</p> : <div className="grid sm:grid-cols-2 gap-2">
      {profiles.map(p => {
        const latest = readings[p.source];
        const live = !!latest && connected && now - latest.receivedAt < 15000;
        return <button type="button" key={p.id} onClick={() => { setForm({ ...p }); setMessage(""); }}
          className="text-left rounded-lg border border-black/15 dark:border-white/15 p-3 hover:border-orange-400">
          <strong>{p.name}</strong> <span className="text-xs opacity-70">{p.enabled ? "Enabled" : "Paused"} · {p.verified ? "Verified protocol" : "Needs verification"}</span>
          <div className="text-xs opacity-70">{p.source} · {p.model} · {p.topology.replaceAll("_", " ")}</div>
          <div className="text-sm mt-1">{live ? `${latest.weight.toFixed(1)} ${latest.unit || "kg"} · live` : "No recent reading"}</div>
          {connected && statuses[p.source] && <div className="text-xs mt-1 opacity-75">{statuses[p.source].state}: {statuses[p.source].detail}</div>}
        </button>;
      })}
    </div>}
    {selected && <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-black/10 dark:border-white/10 p-3">
      <h3 className="font-medium sm:col-span-2">{selected.id ? `Edit ${selected.name}` : "New scale profile"}</h3>
      {field("Source ID (must match bridge)", "source", "SI850-TANK-2")}
      {field("Display name", "name", "Tank 2")}
      {field("Indicator model", "model", "Essae SI-850")}
      <label className="text-sm space-y-1"><span>Data method</span><select className={fieldClass} value={selected.mode} onChange={e => edit("mode", e.target.value)}>
        <option value="SI850_POLL">Essae SI-850 binary polling (supported)</option>
        <option value="TCP_SERVER_RAW">Other TCP server (raw capture)</option>
        <option value="TCP_LISTENER_RAW">Scale connects to laptop (raw capture)</option>
        <option value="SERIAL_RAW">USB serial / RS-232 COM port (raw capture)</option>
      </select></label>
      <label className="text-sm space-y-1"><span>Cabling</span><select className={fieldClass} value={selected.topology} onChange={e => edit("topology", e.target.value)}>
        <option value="DIRECT">Direct scale to USB/Ethernet laptop</option>
        <option value="SWITCH">Ethernet switch</option>
        <option value="ROUTER_LAN">ASUS router LAN ports (wired)</option>
        <option value="WIFI_BRIDGE">Wi-Fi client bridge to Ethernet scale</option>
        <option value="WIFI_NATIVE">Scale with its own Wi-Fi</option>
        <option value="USB_SERIAL">USB serial / USB-to-RS-232</option>
        <option value="RS232">RS-232 serial cable</option>
      </select></label>
      {selected.mode === "SERIAL_RAW" ? <>
        {field("Windows COM port", "serialPort", "COM3")}{field("Baud rate", "baudRate", "9600")}
        {field("Data bits", "dataBits", "8")}{field("Parity (N / E / O)", "parity", "N")}
        {field("Stop bits", "stopBits", "1")}
        <p className="text-sm sm:col-span-2">Find the COM port in Windows Device Manager or run <code>py .\tools\scale_bridge.py --list-serial</code>. Match baud, bits, parity and stop bits to the indicator manual.</p>
      </> : <>
        {field(selected.mode === "TCP_LISTENER_RAW" ? "Optional scale IP" : "Scale IP / hostname", "scaleHost", "192.168.50.248")}
        {field(selected.mode === "TCP_LISTENER_RAW" ? "Laptop listening TCP port" : "Scale TCP port", "scalePort", "4321")}
        {field("Laptop Ethernet / Wi-Fi IP", "pcIp", "192.168.50.10")}
        {field("Subnet mask", "subnetMask", "255.255.255.0")}
        {field("Laptop network adapter", "adapter", "Ethernet 4 (Quantum USB-to-Ethernet)")}
        {field("Router LAN IP (if used)", "routerIp", "192.168.50.1")}
        {field("Gateway (blank for isolated wired LAN)", "gateway")}
        {subnet === false && <p className="sm:col-span-2 text-sm text-amber-700 dark:text-amber-300">Scale and laptop addresses are on different subnets under this mask. For a simple LAN connection, change one address or put both on the same network.</p>}
        {selected.pcIp === selected.scaleHost && selected.pcIp && <p className="sm:col-span-2 text-sm text-red-700">Scale and laptop cannot use the same IP address.</p>}
        {selected.topology === "ROUTER_LAN" && <p className="sm:col-span-2 text-sm rounded border p-2">ASUS wired test: plug the scale and laptop into two LAN ports; keep their existing 192.168.50.248 and 192.168.50.10 addresses. Leave the ASUS WAN port unused. The router&apos;s own LAN IP can be different if it only switches these LAN ports, but set it to an unused 192.168.50.x address for easier management. Avoid a DHCP pool that assigns your reserved addresses.</p>}
        {selected.topology === "WIFI_BRIDGE" && <p className="sm:col-span-2 text-sm rounded border p-2">Client bridge must join the intended Wi-Fi and pass local LAN traffic. If it joins your existing 192.168.1.x home LAN, change the scale to a unique 192.168.1.x address and save the new profile. A routed/NAT client mode may isolate the scale.</p>}
      </>}
      {field("Browser bridge port", "browserPort", "8765")}
      <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={selected.enabled} onChange={e => edit("enabled", e.target.checked)} /> Include in generated multi-scale command (restart bridge to apply)</label>
      <label className="text-sm space-y-1 sm:col-span-2"><span>Hardware and troubleshooting notes</span><textarea rows={3} className={fieldClass} value={selected.notes} onChange={e => edit("notes", e.target.value)} /></label>
      <div className="sm:col-span-2 flex gap-2"><button className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm disabled:opacity-50" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setForm(null)}>Close</button></div>
      <div className="sm:col-span-2 text-sm space-y-1"><p className="font-medium">Windows command (from project folder)</p><code className="block rounded bg-black/10 dark:bg-white/10 p-2 break-all select-all">{command(selected)}</code><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void copy(command(selected))}>Copy command</button>
        {selected.mode !== "SI850_POLL" && <p className="text-amber-700 dark:text-amber-300">Raw capture only: verify this indicator&apos;s packet format before using its weight in forms.</p>}
      </div>
    </form>}
    {message && <p role="status" className="text-sm rounded border p-2">{message}</p>}
    {combined && <div className="text-sm space-y-1"><strong>All enabled scales on one bridge</strong>{listeners.length <= 1 && <><code className="block rounded bg-black/10 dark:bg-white/10 p-2 break-all select-all">{multiCommand}</code><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void copy(multiCommand)}>Copy command</button></>}<p className="text-xs opacity-70">Use the updated script on the laptop. One bridge owns browser port 8765. Each source ID must be unique. Non SI-850 methods capture raw data until verified.</p>
      {listeners.length > 1 && <p className="text-amber-700 dark:text-amber-300">This bridge supports one incoming TCP listener at a time. Disable extra listeners or use separate processes with distinct browser ports.</p>}
      {profiles.some(p => p.enabled && Number(p.browserPort) !== 8765) && <p className="text-amber-700 dark:text-amber-300">Some enabled profiles use another browser port; those are excluded here. Use 8765 to combine them.</p>}
    </div>}
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Connection guide and troubleshooting</summary><ol className="list-decimal ml-5 mt-2 space-y-2">
      <li>Connect the scale and laptop using the cabling in its profile. For direct Ethernet, set the USB adapter to the saved laptop IP and subnet; leave its gateway blank. Keep laptop Wi-Fi for internet.</li>
      <li>Check the indicator&apos;s Ethernet IP and TCP port, and close the Essae Windows application if it is already connected to the same scale.</li>
      <li>In PowerShell run <code>ping SCALE_IP</code> and <code>Test-NetConnection SCALE_IP -Port SCALE_PORT</code>, replacing the address and port with those in the profile. Ping alone does not prove the TCP service is ready.</li>
      <li>Install once with <code>py -m pip install -r tools/scale-requirements.txt</code>. From the project folder run the saved command, keeping PowerShell open. Check Live Scales for a recent weight; green browser bridge alone is insufficient.</li>
      <li>If the TCP connection works but no reading appears, verify the method: the SI-850 needs binary polling; an unknown model needs a protocol capture and validation. Check Windows adapter/IP, duplicate addresses, cables, port ownership and firewall if the connection fails.</li>
      <li>Direct cable needs no router. For a switch, put laptop and scales on the same subnet. For a Wi-Fi client bridge, join it to the shop network and place each Ethernet scale on that network with a unique address. Save changes to both the device and this profile.</li>
    </ol><p className="mt-2 text-xs opacity-70">USB/RS-232 are captured via Windows COM ports; raw bytes need a validated device decoder before showing weights. USB HID devices may need a separate driver. The browser cannot configure the indicator or start a Windows program remotely.</p></details>
  </section>;
}
