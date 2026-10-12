"use client";

// Phone bottom tab bar (Home · Register · Stock · Parties · Reports) and the
// floating "New sale" button. Shown on phone widths only (CSS), never on the
// login / setup screens. Staff see Job-work instead of Reports (Owner-only).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon, type IconName } from "@/components/ui/Icons";

type Tab = { key: string; label: string; kn: string; href: string; icon: IconName };

export default function PhoneNav() {
  const path = usePathname() || "/";
  const { data: session, status } = useSession();
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
  ];
  const active =
    path.startsWith("/register") ? "register" : path.startsWith("/stock") ? "stock" : path.startsWith("/reports") ? "reports" : path === "/" ? (desk === "parties" ? "parties" : desk === "jobwork" ? "jobwork" : "home") : "";
  const showFab = !path.startsWith("/register");

  return (
    <>
      {showFab && (
        <a className="pnav-fab" href="/register?open=sale" aria-label="New sale">
          <Icon name="plus" size={20} strokeWidth={2.4} />
          <span>New sale</span>
        </a>
      )}
      <nav className="pnav" aria-label="Main">
        {tabs.map((t) => (
          <a key={t.key} href={t.href} className={active === t.key ? "on" : ""} aria-current={active === t.key ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
