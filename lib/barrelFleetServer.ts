// Server-only helpers for the barrel fleet API routes.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { daysAway, fleetFlags, type FleetBarrelLike } from "@/lib/barrelFleet";

export type FleetBarrelRow = Prisma.FleetBarrelGetPayload<object>;

/** The barrel with its live flags and days away, ready for the screen. */
export function shapeFleetBarrel(b: FleetBarrelRow, nowMs = Date.now()) {
  const like = b as unknown as FleetBarrelLike;
  return { ...b, flags: fleetFlags(like, nowMs), awayDays: daysAway(like, nowMs) };
}

export interface FleetEventInput {
  at?: Date;
  source?: string | null;
  scale?: string | null;
  tickId?: string | null;
  kg?: number | null;
  tareKg?: number | null;
  netKg?: number | null;
  product?: string | null;
  fromLoc?: string | null;
  toLoc?: string | null;
  party?: string | null;
  vehicleNo?: string | null;
  purpose?: string | null;
  ref?: string | null;
  note?: string | null;
  detail?: Record<string, unknown> | null;
}

/** Append one row to the ledger. Never updated or deleted afterwards. */
export async function logFleetEvent(
  tx: Prisma.TransactionClient | typeof prisma,
  barrel: { id: string; code: string },
  action: string,
  by: string,
  f: FleetEventInput = {}
) {
  const { detail, ...rest } = f;
  return tx.fleetEvent.create({
    data: {
      barrelId: barrel.id,
      barrelCode: barrel.code,
      action,
      by,
      at: rest.at ?? new Date(),
      source: rest.source ?? null,
      scale: rest.scale ?? null,
      tickId: rest.tickId ?? null,
      kg: rest.kg ?? null,
      tareKg: rest.tareKg ?? null,
      netKg: rest.netKg ?? null,
      product: rest.product ?? null,
      fromLoc: rest.fromLoc ?? null,
      toLoc: rest.toLoc ?? null,
      party: rest.party ?? null,
      vehicleNo: rest.vehicleNo ?? null,
      purpose: rest.purpose ?? null,
      ref: rest.ref ?? null,
      note: rest.note ?? null,
      detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export const MAX_FLEET_REGISTER = 100;
