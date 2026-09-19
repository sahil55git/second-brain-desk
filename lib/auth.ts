// NextAuth config (erp-architecture-plan.md, Phase 1) — Credentials
// provider + JWT sessions (no separate Account/Session DB tables needed).
// Two roles: OWNER (everything, including Settings) and STAFF (everything
// except Settings/financial reports — enforced both in middleware.ts for
// page routes and again inside each Owner-only API route, since a client
// redirect alone is never a real access boundary).

import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, safeDbCall } from "@/lib/db";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim().toLowerCase();
        const password = credentials?.password;
        if (!username || !password) return null;

        const result = await safeDbCall(() =>
          prisma.user.findUnique({ where: { username } })
        );
        if (!result.ok || !result.data || !result.data.active) return null;

        const valid = await bcrypt.compare(password, result.data.passwordHash);
        if (!valid) return null;

        return {
          id: result.data.id,
          name: result.data.name,
          username: result.data.username,
          role: result.data.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).username = token.username;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
};
