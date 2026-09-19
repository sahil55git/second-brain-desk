"use client";

import { signOut, useSession } from "next-auth/react";

export default function SignOutButton() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = (session.user as any).username || session.user.name || "signed in";

  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
      title={`Signed in as ${name} — click to sign out`}
    >
      {name} · Sign out
    </button>
  );
}
