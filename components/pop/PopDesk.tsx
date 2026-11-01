"use client";

// The pop-up window that a home-screen widget opens (Android: a small window over the home screen,
// /pop?w=<widget>&say=<command>). The widget's figures as a chat answer you can act on, one-tap
// entry buttons (the form opens right here), and the chat box with voice — without opening the app.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChatBox } from "@/components/bot/ChatDesk";
import "@/components/bot/chat.css";
import "./pop.css";

const FIRST: Record<string, string> = {
  dashboard: "today", summary: "today", cash: "cash", udhaar: "udhaar", jobwork: "jobwork", stock: "stock",
  alerts: "alerts", tips: "alerts", tasks: "tasks", barrels: "barrels",
};
const ACTIONS: { icon: string; label: string; href: string; owner?: boolean }[] = [
  { icon: "💰", label: "Sale", href: "/register?open=sale" },
  { icon: "🧾", label: "Expense", href: "/register?open=expense" },
  { icon: "🙌", label: "Udhaar in", href: "/register?open=udhaar" },
  { icon: "🛒", label: "Purchase", href: "/register?open=purchase" },
  { icon: "🤝", label: "Payment", href: "/register?open=payment" },
  { icon: "⚖️", label: "Weigh full", href: "/barrels?weigh=full" },
  { icon: "💵", label: "Count cash", href: "/register?open=cash" },
  { icon: "✏️", label: "Edit last", href: "/register?edit=last" },
  { icon: "🕘", label: "Attendance", href: "/attendance" },
  { icon: "📈", label: "Insights", href: "/insights", owner: true },
];

export default function PopDesk() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [w, setW] = useState<string | null>(null);
  const [say, setSay] = useState<string | undefined>(undefined);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const kind = sp.get("w") || "chat";
    setW(kind);
    setSay(sp.get("say") || FIRST[kind] || undefined);
  }, []);
  if (!w) return <div className="pop" />;
  return (
    <div className="hub pop">
      <div className="pop-acts" role="toolbar" aria-label="Quick entries">
        {ACTIONS.filter((a) => isOwner || !a.owner).map((a) => (
          <a key={a.href} href={a.href} className="pop-act"><span>{a.icon}</span>{a.label}</a>
        ))}
      </div>
      <ChatBox isOwner={isOwner} fresh say={say} compact />
    </div>
  );
}
