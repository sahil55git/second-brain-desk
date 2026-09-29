import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma, safeDbCall } from "@/lib/db";

async function owner(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (token.role !== "OWNER") return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await owner(req);
  if (denied) return denied;
  const result = await safeDbCall(async () => {
    await prisma.scaleConnectionProfile.upsert({
      where: { source: "SI850-KARADI" },
      update: {},
      create: {
        source: "SI850-KARADI", name: "Karadi oil tank", model: "Essae SI-850",
        mode: "SI850_POLL", topology: "DIRECT", scaleHost: "192.168.50.248",
        scalePort: 4321, pcIp: "192.168.50.10", subnetMask: "255.255.255.0",
        adapter: "Ethernet 4 (Quantum USB-to-Ethernet)", browserPort: 8765,
        verified: true,
        notes: "Confirmed live at the laptop through a direct cable. Keep the Essae PC application closed while the bridge owns port 4321. Wi-Fi on the laptop can remain connected for internet.",
      },
    });
    return prisma.scaleConnectionProfile.findMany({ orderBy: { createdAt: "asc" } });
  });
  return result.ok ? NextResponse.json({ data: result.data }) : NextResponse.json({ error: result.error }, { status: 503 });
}

export async function PUT(req: NextRequest) {
  const denied = await owner(req);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const str = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
  const opt = (key: string) => str(key) || null;
  const source = str("source").toUpperCase();
  const mode = str("mode");
  const topology = str("topology");
  const serial = mode === "SERIAL_RAW";
  const scalePort = body.scalePort === "" || body.scalePort == null ? null : Number(body.scalePort);
  const browserPort = Number(body.browserPort);
  const baudRate = serial ? Number(body.baudRate) : null;
  const dataBits = serial ? Number(body.dataBits) : null;
  const stopBits = serial ? Number(body.stopBits) : null;
  if (!/^[A-Z0-9_-]{2,64}$/.test(source) || !str("name") || !str("model") ||
      !["SI850_POLL", "TCP_SERVER_RAW", "TCP_LISTENER_RAW", "SERIAL_RAW"].includes(mode) ||
      !["DIRECT", "SWITCH", "ROUTER_LAN", "WIFI_BRIDGE", "WIFI_NATIVE", "USB_SERIAL", "RS232"].includes(topology) ||
      !Number.isInteger(browserPort) || browserPort < 1 || browserPort > 65535 ||
      (!serial && (!Number.isInteger(scalePort) || !scalePort || scalePort < 1 || scalePort > 65535)) ||
      (!serial && !str("scaleHost") && mode !== "TCP_LISTENER_RAW") ||
      (!serial && !!str("scaleHost") && !/^[A-Za-z0-9.-]{1,253}$/.test(str("scaleHost"))) ||
      (serial && (!/^(COM\d{1,3}|\/dev\/[A-Za-z0-9._/-]+)$/i.test(str("serialPort")) ||
        !Number.isInteger(baudRate) || !baudRate || baudRate < 300 || baudRate > 115200 ||
        ![7, 8].includes(dataBits ?? 0) || ![1, 2].includes(stopBits ?? 0) ||
        !["N", "E", "O"].includes(str("parity").toUpperCase()))) ||
      str("notes").length > 2000) {
    return NextResponse.json({ error: "Check source, name, connection mode, IP/TCP port or serial COM settings." }, { status: 400 });
  }
  const data = {
    source, name: str("name"), model: str("model"), mode, topology,
    scaleHost: opt("scaleHost"), scalePort, pcIp: opt("pcIp"),
    subnetMask: opt("subnetMask"), gateway: opt("gateway"), adapter: opt("adapter"),
    routerIp: opt("routerIp"), serialPort: serial ? str("serialPort").toUpperCase() : null,
    baudRate, dataBits, parity: serial ? str("parity").toUpperCase() : null, stopBits,
    browserPort, enabled: body.enabled === true, notes: opt("notes"),
  };
  const id = str("id");
  const result = await safeDbCall(async () => {
    if (!id) return prisma.scaleConnectionProfile.create({ data: { ...data, verified: false } });
    const old = await prisma.scaleConnectionProfile.findUnique({ where: { id } });
    if (!old) return null;
    // Changing a verified device's identity or wire protocol requires a new check.
    const verified = old.verified && old.source === source && old.mode === mode &&
      old.scaleHost === data.scaleHost && old.scalePort === scalePort && old.model === data.model &&
      old.serialPort === data.serialPort && old.baudRate === baudRate && old.dataBits === dataBits &&
      old.parity === data.parity && old.stopBits === stopBits;
    return prisma.scaleConnectionProfile.update({ where: { id }, data: { ...data, verified } });
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  return NextResponse.json({ data: result.data });
}
