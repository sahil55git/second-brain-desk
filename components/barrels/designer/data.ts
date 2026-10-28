// Fills a layout's {tokens} from a real barrel or weighing.
import { ACTION_LABEL, LOCATION_LABEL, PURPOSE_LABEL, fleetLink, type FleetAction, type Location, type Purpose } from "@/lib/barrelFleet";
import type { TokenData } from "@/lib/labelTemplate";
import { kg, kg1, whenFull } from "@/components/barrels/shared";
import type { FBarrel, FEvent } from "@/components/barrels/fleet/types";

export const COMPANY = "MAHADEV TRADERS";
const place = (l: string | null) => (l ? LOCATION_LABEL[l as Location]?.en ?? l : "");
const stamp = (t: string | null) => (t ? new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }) : "");

export function labelData(b: FBarrel, origin: string): TokenData {
  return {
    company: COMPANY,
    code: b.code,
    mark: b.mark ?? "",
    capacity: kg(b.capacityKg),
    tare: b.tareKg != null ? kg(b.tareKg) : "",
    tareDate: b.tareAt ? stamp(b.tareAt) : "",
    link: fleetLink(origin, b.code),
    today: stamp(new Date().toISOString()),
  };
}

export function slipData(e: FEvent, b: FBarrel | null, origin: string, printedAt: string): TokenData {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const isMove = e.action === "MOVE";
  const full = e.action === "GROSS" || (isMove && e.netKg != null);
  const title =
    e.action === "GROSS" ? "Full barrel weight" : e.action === "EMPTY" ? (d.setsTare ? "Empty weight (tare set)" : "Empty barrel weight") : isMove ? `${place(e.fromLoc)} → ${place(e.toLoc)}` : ACTION_LABEL[e.action as FleetAction] ?? e.action;
  const grossShown = e.action === "GROSS" ? e.kg : isMove ? (b?.grossKg ?? (e.netKg != null && e.tareKg != null ? e.netKg + e.tareKg : null)) : null;
  const tare = e.action === "EMPTY" ? e.kg : e.tareKg;
  const net = full ? e.netKg : e.action === "EMPTY" && !d.setsTare ? e.netKg : null;
  const has = (n: number | null | undefined): n is number => n != null;
  return {
    company: COMPANY,
    title,
    code: e.barrelCode,
    link: fleetLink(origin, e.barrelCode),
    date: whenFull(e.at),
    mark: b?.mark ?? "",
    product: e.product ?? "",
    route: isMove ? `${place(e.fromLoc)} → ${place(e.toLoc)}` : "",
    party: e.party ?? "",
    vehicle: e.vehicleNo ?? "",
    purpose: e.purpose ? PURPOSE_LABEL[e.purpose as Purpose] ?? e.purpose : "",
    ref: e.ref ?? "",
    gross: has(grossShown) ? kg1(grossShown) : "",
    tare: has(tare) ? kg1(tare) : "",
    net: has(net) ? kg1(net) : "",
    equation: full && has(e.tareKg) && has(grossShown) && has(e.netKg) ? `${kg1(grossShown)} − ${kg1(e.tareKg)} = ${kg1(e.netKg)} kg` : "",
    scale: e.source === "MANUAL" ? "Weight typed by hand" : e.scale ? `Scale: ${e.scale}` : e.kg != null ? "Scale weight" : "",
    by: e.by ?? "",
    note: e.note ?? "",
    printedAt,
  };
}
