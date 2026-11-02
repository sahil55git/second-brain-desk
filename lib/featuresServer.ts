// Feature switches on the server (chat bot, scheduled jobs).
import { prisma } from "@/lib/db";
import { isOn, type FeatureState } from "@/lib/features";

let cache: { at: number; s: FeatureState | null } | null = null;
export async function loadFeatures(): Promise<FeatureState | null> {
  if (cache && Date.now() - cache.at < 20000) return cache.s;
  const r = await prisma.appSetting.findUnique({ where: { key: "features" } }).catch(() => null);
  const s = (r?.data as FeatureState | null) ?? null;
  cache = { at: Date.now(), s };
  return s;
}
export async function featureOn(key: string): Promise<boolean> {
  return isOn(await loadFeatures(), key);
}
