"use client";

// Counter-only mode (set in Weigh & Bill → settings on this device): any other page sends the
// device back to the counter. The pages the owner ticked stay open.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { COUNTER_PATH, kioskAllows, readKiosk } from "@/lib/counterKiosk";

export default function KioskGuard() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      const s = readKiosk();
      if (!kioskAllows(s, window.location.pathname, window.location.search)) router.replace(COUNTER_PATH);
      document.documentElement.classList.toggle("counter-kiosk", !!s?.on);
    };
    check();
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, [pathname, router]);
  return null;
}
