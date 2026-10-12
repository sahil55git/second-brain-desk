"use client";

// Hover / focus pop-up: move the cursor (or tab to) a trigger to see a small
// card with quick details and actions. On touch screens a tap toggles it.
// Escape closes it. The card is plain DOM, so its buttons work with the
// keyboard as well as the mouse.
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function HoverCard({
  trigger,
  children,
  align = "left",
  className = "",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short delay lets the cursor travel from the trigger into the card.
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <span
      ref={ref}
      className={`relative inline-block ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") setOpen((o) => !o);
      }}
    >
      {trigger}
      {open && (
        <span
          role="dialog"
          aria-label="Quick details"
          className={`absolute top-full mt-2 z-40 w-72 max-w-[85vw] rounded-2xl border border-black/10 dark:border-white/15 bg-[var(--background)] p-3 text-sm shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {children}
        </span>
      )}
    </span>
  );
}
