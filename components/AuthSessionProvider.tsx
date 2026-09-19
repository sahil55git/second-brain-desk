"use client";

// Thin client wrapper so app/layout.tsx (a server component) can still
// provide NextAuth's SessionProvider to the whole tree — useSession()
// (SignOutButton, role-gated UI) requires this ancestor.
import { SessionProvider } from "next-auth/react";

export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
