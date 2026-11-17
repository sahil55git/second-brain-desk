// Next counter bill number: 1, 2, 3 … (one atomic increment in the database, so two tablets never get the same number).
import { prisma } from "@/lib/db";

export async function nextBillNo(): Promise<number> {
  const row = await prisma.counterSeq.upsert({ where: { id: "bill" }, create: { id: "bill", n: 1 }, update: { n: { increment: 1 } } });
  return row.n;
}
