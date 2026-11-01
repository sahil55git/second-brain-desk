// How the bot shows an entry before and after saving. Pure.
import { CATALOG, KIND_SIDE, type RegisterKind } from "@/lib/register";
import type { EntryCmd } from "@/lib/bot/parse";
import { dmy, rs } from "@/lib/bot/format";

export const KIND_NAME: Record<RegisterKind, string> = { SALE: "Sale", FRESH_CRUSH: "Fresh crush", UDHAAR_IN: "Udhaar received", PURCHASE: "Purchase", EXPENSE: "Expense", PAYMENT: "Payment", PIGMEE: "Pigmee", OWNER_DRAW: "Owner draw" };
const MODE_NAME: Record<string, string> = { CASH: "Cash", UPI: "UPI / bank", BANK: "Bank", CREDIT: "Udhaar (credit)", OTHER: "Other" };

function itemName(e: EntryCmd): string {
  if (e.itemLabel) return e.itemLabel;
  if (!e.item) return "";
  return (CATALOG[e.kind] || []).find((c) => c.key === e.item)?.en ?? e.item;
}

export function describeEntry(e: EntryCmd, date: string): string {
  const what = [itemName(e), e.qty ? `${e.qty} ${e.unit || ""}`.trim() : "", e.rate ? `@ ${rs(e.rate)}` : ""].filter(Boolean).join(" ");
  return [
    `**${KIND_NAME[e.kind]} ${rs(e.amount)}**`,
    what ? `Item: ${what}` : "",
    `Paid by: ${MODE_NAME[e.mode] ?? e.mode}`,
    e.party ? `${KIND_SIDE[e.kind] === "out" ? "To" : "From"}: ${e.party}` : "",
    `Date: ${dmy(date)}`,
  ].filter(Boolean).join("\n");
}

