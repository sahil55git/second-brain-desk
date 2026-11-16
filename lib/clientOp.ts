// "Never save the same entry twice". A device that saved an entry while offline sends it later
// with its clientId (lib/outbox.ts). If the first try did reach the server but the answer was
// lost, the device tries again; the claim below fails the second time, and the route answers
// "already saved" instead of saving a second intake, batch or weighing.
//
// The id is the table's primary key, so two tries arriving together cannot both win.
import { prisma } from "@/lib/db";

export type Claim = "new" | "duplicate" | "none";
const ID = /^c[a-z0-9]{6,30}$/;

/** "none" = no usable clientId, or the table is not there yet: carry on without the guard. */
export async function claimOp(clientId: unknown, kind: string): Promise<Claim> {
  if (typeof clientId !== "string" || !ID.test(clientId)) return "none";
  try {
    await prisma.clientOp.create({ data: { id: clientId, kind: kind.slice(0, 40) } });
    return "new";
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return "duplicate";
    return "none";
  }
}

/** The entry was not saved after all (refused or failed): free the id so a corrected retry can go through. */
export async function releaseOp(clientId: unknown): Promise<void> {
  if (typeof clientId !== "string" || !ID.test(clientId)) return;
  try {
    await prisma.clientOp.delete({ where: { id: clientId } });
  } catch {
    /* nothing to free */
  }
}
