"use client";

// Phone bottom tab bar (Home · Register · Stock · Parties · Reports) and the
// floating "New sale" button. Shown on phone widths only (CSS), never on the
// login / setup screens. Staff see Job-work instead of Reports (Owner-only).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { PageKey } from "@/lib/access";
import { Icon, type IconName } from "@/components/ui/Icons";
import { useAccess } from "@/components/AccessProvider";
import Peekable from "@/components/launcher/Peekable";

type Tab = { key: string; label: string; kn: string; href: string; icon: IconName };

// Which form each bottom tab can add to from its long-touch / right-click menu.
const ADD_FN: Record<string, [string, string]> = {
  home: ["New sale", "sale"],
  register: ["New sale", "sale"],
  stock: ["Stock count", "stock"],
  parties: ["Udhaar received", "udhaar"],
  jobwork: ["Job-work entry", "jobwork"],
};

export default function PhoneNav() {
  const path = usePathname() || "/";
  const { data: session, status } = useSession();
  const acc = useAccess();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [desk, setDesk] = useState<string | null>(null);
  useEffect(() => {
    setDesk(new URLSearchParams(window.location.search).get("desk"));
  }, [path]);

  const hidden = status !== "authenticated" || path.startsWith("/login") || path.startsWith("/setup");
  useEffect(() => {
    document.documentElement.classList.toggle("has-pnav", !hidden);
    return () => document.documentElement.classList.remove("has-pnav");
  }, [hidden]);
  if (hidden) return null;

  const tabs: Tab[] = [
    { key: "home", label: "Home", kn: "ಮನೆ", href: "/", icon: "home" },
    { key: "register", label: "Register", kn: "ದಾಖಲೆ", href: "/register", icon: "book" },
    { key: "stock", label: "Stock", kn: "ಸ್ಟಾಕ್", href: "/stock", icon: "box" },
    { key: "parties", label: "Parties", kn: "ಗ್ರಾಹಕರು", href: "/?desk=parties", icon: "user" },
    isOwner
      ? { key: "reports", label: "Reports", kn: "ವರದಿ", href: "/reports", icon: "chart" }
      : { key: "jobwork", label: "Job-work", kn: "ಗಾಣ", href: "/?desk=jobwork", icon: "sprout" },
  ].filter((t) => t.key === "home" || acc.page(t.key as PageKey));
  const active =
    path.startsWith("/register") ? "register" : path.startsWith("/stock") ? "stock" : path.startsWith("/reports") ? "reports" : path === "/" ? (desk === "parties" ? "parties" : desk === "jobwork" ? "jobwork" : "home") : "";
  const showFab = !path.startsWith("/register") && acc.page("register") && acc.fn("sale");

  return (
    <>
      {showFab && (
        <a className="pnav-fab" href="/register?open=sale" aria-label="New sale">
          <Icon name="plus" size={20} strokeWidth={2.4} />
          <span>New sale</span>
        </a>
      )}
      <nav className="pnav" aria-label="Main">
        {tabs.map((t) => {
          const addFn = ADD_FN[t.key];
          return (
            <Peekable
              key={t.key}
              className="pk-tab"
              title={t.label}
              href={t.href}
              pop={{ title: t.label, url: `${t.href}${t.href.includes("?") ? "&" : "?"}embed=1`, kind: "App" }}
              add={addFn ? { label: addFn[0], pop: { title: addFn[0], url: `/register?open=${addFn[1]}&embed=1`, kind: "Function" } } : undefined}
              tripleClick={false}
            >
              <a href={t.href} className={active === t.key ? "on" : ""} aria-current={active === t.key ? "page" : undefined}>
                <Icon name={t.icon} size={21} />
                <span>{t.label}</span>
              </a>
            </Peekable>
          );
        })}
      </nav>
    </>
  );
}
