"use client";

// Keeps one broken screen from blanking the whole app: shows what went wrong, with Try again,
// instead of Next.js's "Application error: a client-side exception has occurred".
import { Component, type ReactNode } from "react";

export function ErrorNote({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ margin: "16px auto", maxWidth: 640, padding: "14px 16px", borderRadius: 12, border: "1px solid #c8352e", background: "color-mix(in srgb, #c8352e 8%, var(--ui-card, #fff))", color: "var(--foreground, #111)" }}>
      <b>⚠️ This part of the app hit an error.</b>
      <div style={{ fontSize: 13, opacity: 0.8, margin: "6px 0 10px", wordBreak: "break-word" }}>{error.message || String(error)}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onRetry && <button type="button" className="hub-btn primary" onClick={onRetry}>↻ Try again</button>}
        <button type="button" className="hub-btn" onClick={() => window.location.reload()}>Reload the page</button>
        <a className="hub-btn" href="/">🏠 Home</a>
      </div>
    </div>
  );
}

/** Wrap a screen (or a tab) so an error inside it shows a message instead of a blank app. */
export default class ErrorBox extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ErrorBox]", error);
  }
  render() {
    if (this.state.error) return <ErrorNote error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
