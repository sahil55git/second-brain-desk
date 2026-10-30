"use client";

// Any page that throws while drawing shows this instead of a blank "Application error" screen.
import { ErrorNote } from "@/components/ui/ErrorBox";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorNote error={error} onRetry={reset} />;
}
