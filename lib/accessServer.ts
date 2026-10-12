// Server side of users & profiles: loads profiles (built-ins + saved edits +
// custom ones) and works out what one signed-in user may do. Used by the
// middleware check route, the API routes and the page guards.
import { prisma, safeDbCall } from "./db";
import {
  BUILTIN_PROFILES, LEGACY_STAFF_PROFILE, effectivePerms, normalizePerms,
  type Perms, type ProfileDef,
} from "./access";

type Row = { id: string; name: string; who: string; perms: unknown };

/** Built-in profiles with any saved edits, then the custom ones. Falls back to the built-ins when the database is unreachable. */
export async function loadProfiles(): Promise<ProfileDef[]> {
  const r = await safeDbCall(() => prisma.accessProfile.findMany({ orderBy: { createdAt: "asc" } }));
  const rows: Row[] = r.ok ? (r.data as Row[]) : [];
  const byId = new Map(rows.map((x) => [x.id, x]));
  const out: ProfileDef[] = BUILTIN_PROFILES.map((b) => {
    const row = byId.get(b.id);
    if (!row || b.id === "owner") return b;
    return { id: b.id, name: row.name || b.name, who: row.who || b.who, perms: normalizePerms(row.perms, b.perms) };
  });
  for (const row of rows) {
    if (BUILTIN_PROFILES.some((b) => b.id === row.id)) continue;
    out.push({ id: row.id, name: row.name, who: row.who, perms: normalizePerms(row.perms, BUILTIN_PROFILES.find((b) => b.id === "counter")!.perms) });
  }
  return out;
}

export interface UserAccess {
  username: string;
  name: string;
  role: string;
  isOwner: boolean;
  active: boolean;
  profileKey: string;
  profileName: string;
  perms: Perms;
}

/** What a signed-in user (by login name) may do. `active: false` also when the user no longer exists. */
export async function accessFor(username: string): Promise<UserAccess | null> {
  const u = await safeDbCall(() => prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } }));
  if (!u.ok) return null; // database down: the caller decides (never open by default)
  if (!u.data) return { username, name: username, role: "STAFF", isOwner: false, active: false, profileKey: "", profileName: "", perms: effectivePerms(false, BUILTIN_PROFILES[2].perms) };
  const user = u.data as { username: string; name: string; role: string; active: boolean; profileKey: string | null };
  const isOwner = user.role === "OWNER";
  const key = isOwner ? "owner" : user.profileKey || LEGACY_STAFF_PROFILE;
  const profiles = await loadProfiles();
  const prof = profiles.find((p) => p.id === key) || profiles.find((p) => p.id === LEGACY_STAFF_PROFILE)!;
  return {
    username: user.username, name: user.name, role: user.role, isOwner, active: user.active,
    profileKey: prof.id, profileName: prof.name, perms: effectivePerms(isOwner, prof.perms),
  };
}
