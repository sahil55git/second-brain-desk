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
import { LOGIN_WINDOW_MS, lockedOut } from "@/lib/loginGuard";

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

        // Too many wrong passwords for this username: refuse without checking, until the
        // tries age out. If the table is not there yet the check is skipped, so a database
        // hiccup can never lock everyone out.
        const now = Date.now();
        const recent = await safeDbCall(() =>
          prisma.loginAttempt.findMany({ where: { username, at: { gte: new Date(now - LOGIN_WINDOW_MS) } }, select: { at: true } })
        );
        if (recent.ok && lockedOut(recent.data.map((r: { at: Date }) => r.at.getTime()), now)) return null;
        const failed = async () => {
          await safeDbCall(() => prisma.loginAttempt.create({ data: { username: username.slice(0, 80) } }));
          await safeDbCall(() => prisma.loginAttempt.deleteMany({ where: { at: { lt: new Date(now - 86400000) } } }));
          return null;
        };

        const result = await safeDbCall(() =>
          prisma.user.findUnique({ where: { username } })
        );
        if (!result.ok) return null;
        if (!result.data || !result.data.active) return failed();

        const valid = await bcrypt.compare(password, result.data.passwordHash);
        if (!valid) return failed();

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
