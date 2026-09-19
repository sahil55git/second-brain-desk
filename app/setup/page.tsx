"use client";

// First-run bootstrap page (erp-architecture-plan.md, Phase 1) — only
// works while the User table is empty; app/api/setup/route.ts enforces
// that server-side. Middleware excludes /setup from the auth redirect so
// this page is reachable before anyone can log in.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [alreadySetUp, setAlreadySetUp] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((json) => {
        if (!json.needsSetup) setAlreadySetUp(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Setup failed.");
        return;
      }
      router.push("/login?setup=done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm opacity-60">Checking setup status…</p>
      </main>
    );
  }

  if (alreadySetUp) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold">Setup already complete</h1>
          <p className="text-sm opacity-70">
            An account already exists for this business. Sign in instead.
          </p>
          <a
            href="/login"
            className="inline-block rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium"
          >
            Go to login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 p-6 space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold">Create the Owner account</h1>
          <p className="text-xs opacity-60 mt-1">
            First run — this creates the one Owner account for this business. You can
            add Staff logins later from Settings.
          </p>
        </div>

        <label className="block text-sm space-y-1">
          <span className="opacity-70">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block text-sm space-y-1">
          <span className="opacity-70">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            autoComplete="username"
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
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        <label className="block text-sm space-y-1">
          <span className="opacity-70">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
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
          {submitting ? "Creating…" : "Create Owner account"}
        </button>
      </form>
    </main>
  );
}
