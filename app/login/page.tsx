"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  const justSetUp = params.get("setup") === "done";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // No users yet (fresh install) → send straight to the bootstrap page
  // instead of showing a login form nobody can pass.
  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((json) => {
        if (json.needsSetup) router.replace("/setup");
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError("Invalid username or password.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 p-6 space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold">Second Brain Desk</h1>
          <p className="text-xs opacity-60 mt-1">Sign in to continue.</p>
        </div>

        {justSetUp && (
          <div className="rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
            Owner account created. Sign in below.
          </div>
        )}

        <label className="block text-sm space-y-1">
          <span className="opacity-70">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block text-sm space-y-1">
          <span className="opacity-70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
