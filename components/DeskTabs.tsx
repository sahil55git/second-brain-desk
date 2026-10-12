"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  DailyClosingDTO,
  JobWorkIntakeDTO,
  MfgBatchDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
  SalesInvoiceDTO,
  PurchaseBillDTO,
  ExpenseDTO,
  VyaparSnapshotDTO,
} from "@/lib/types";
import JobWorkDesk from "./JobWorkDesk";
import DailyClosingDesk from "./DailyClosingDesk";
import ManufacturingDesk from "./ManufacturingDesk";
import ReportsDesk from "./ReportsDesk";
import PartiesDesk from "./PartiesDesk";
import InventoryDesk from "./InventoryDesk";
import SettingsDesk from "./SettingsDesk";
import SalesDesk from "./SalesDesk";
import PurchaseDesk from "./PurchaseDesk";
import ExpensesDesk from "./ExpensesDesk";
import VyaparDesk from "./VyaparDesk";
import ScaleDashboard from "./ScaleDashboard";
import LedgerDesk from "./LedgerDesk";
import HomeDesk from "./home/HomeDesk";
import GlobalSearch from "./GlobalSearch";
import Peekable from "./launcher/Peekable";
import AlertsStrip from "./AlertsStrip";
import { businessDate } from "@/lib/register";

// What the hover window / right-click menu on each desk tab offers: a one-line
// description and the Quick Register form that adds to that desk.
const DESK_PEEK: Partial<Record<string, { lines: { k: string; v: string }[]; add?: { label: string; fn: string } }>> = {
  home: { lines: [{ k: "Shows", v: "Today / week / month at a glance" }], add: { label: "New sale", fn: "sale" } },
  jobwork: { lines: [{ k: "Shows", v: "Customer oil in, crushed, billed" }], add: { label: "Job-work entry", fn: "jobwork" } },
  manufacturing: { lines: [{ k: "Shows", v: "Crushing batches and yield" }], add: { label: "Self crushing", fn: "crush" } },
  closing: { lines: [{ k: "Shows", v: "Daily cash and stock closing" }], add: { label: "Count cash", fn: "cash" } },
  sales: { lines: [{ k: "Shows", v: "Bills, udhaar and refunds" }], add: { label: "New sale", fn: "sale" } },
  purchase: { lines: [{ k: "Shows", v: "Seed and oil purchases" }], add: { label: "Add purchase", fn: "purchase" } },
  expenses: { lines: [{ k: "Shows", v: "Daily expenses" }], add: { label: "Add expense", fn: "expense" } },
  parties: { lines: [{ k: "Shows", v: "Customers, suppliers, balances" }], add: { label: "Udhaar received", fn: "udhaar" } },
  inventory: { lines: [{ k: "Shows", v: "Items and stock levels" }], add: { label: "Stock count", fn: "stock" } },
};

type Desk =
  | "home"
  | "jobwork"
  | "manufacturing"
  | "closing"
  | "sales"
  | "purchase"
  | "expenses"
  | "reports"
  | "parties"
  | "inventory"
  | "scales"
  | "vyapar"
  | "ledger"
  | "settings";

export default function DeskTabs({
  initialJobWork,
  initialClosing,
  initialMfg,
  initialParties,
  initialItems,
  initialSettings,
  initialSales,
  initialPurchases,
  initialExpenses,
  initialVyapar,
  dbConnected,
}: {
  initialJobWork: JobWorkIntakeDTO[];
  initialClosing: DailyClosingDTO[];
  initialMfg: MfgBatchDTO[];
  initialParties: PartyDTO[];
  initialItems: ItemDTO[];
  initialSettings: BusinessSettingsDTO | null;
  initialSales: SalesInvoiceDTO[];
  initialPurchases: PurchaseBillDTO[];
  initialExpenses: ExpenseDTO[];
  initialVyapar: VyaparSnapshotDTO | null;
  dbConnected: boolean;
}) {
  const [active, setActive] = useState<Desk>("jobwork");
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  // The Owner opens on Home (today's figures); Staff keep opening on the Job-Work desk.
  const picked = useRef(false);
  useEffect(() => {
    if (isOwner && !picked.current) setActive("home");
  }, [isOwner]);
  // Phone tab bar links like /?desk=parties open that desk directly.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("desk") as Desk | null;
    if (want && want !== "home" && ["jobwork", "manufacturing", "closing", "sales", "purchase", "expenses", "reports", "parties", "inventory", "scales", "vyapar", "ledger", "settings"].includes(want)) {
      picked.current = true;
      setActive(want);
    }
  }, []);
  const open = (d: Desk) => {
    picked.current = true;
    setActive(d);
  };

  const tabs: { key: Desk; label: string }[] = [
    ...(isOwner ? [{ key: "home" as const, label: "Home" }] : []),
    { key: "jobwork", label: "Job-Work Desk" },
    { key: "manufacturing", label: "Manufacturing" },
    { key: "closing", label: "Daily Closing" },
    { key: "sales", label: "Sales" },
    { key: "purchase", label: "Purchase" },
    { key: "expenses", label: "Expenses" },
    { key: "parties", label: "Parties" },
    { key: "inventory", label: "Inventory" },
    { key: "scales", label: "Live Scales" },
    { key: "reports", label: "Reports & AI" },
    // Vyapar cross-check and Settings are Owner-only — Staff sessions never
    // see the tabs (and the API routes refuse them server-side even if they
    // guess the URL). Vyapar exposes financial totals (receivables, sales).
    ...(isOwner
      ? [
          { key: "ledger" as const, label: "Ledger" },
          { key: "vyapar" as const, label: "Vyapar Sync" },
          { key: "settings" as const, label: "Settings" },
        ]
      : []),
  ];

  const alertData = useMemo(
    () => ({
      sales: initialSales,
      purchases: initialPurchases,
      expenses: initialExpenses,
      jobWork: initialJobWork,
      mfg: initialMfg,
      closings: initialClosing,
      items: initialItems,
    }),
    [initialSales, initialPurchases, initialExpenses, initialJobWork, initialMfg, initialClosing, initialItems]
  );
  // Business date in IST, so alerts roll over at the business day, not UTC midnight.
  const today = useMemo(() => businessDate(Date.now()), []);

  const searchData = useMemo(
    () => ({ parties: initialParties, sales: initialSales, items: initialItems, jobWork: initialJobWork }),
    [initialParties, initialSales, initialItems, initialJobWork]
  );

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <GlobalSearch data={searchData} onOpen={(desk) => open(desk)} />
      </div>
      <AlertsStrip data={alertData} today={today} onOpen={(desk) => open(desk as Desk)} />
      <nav className="sb-tabs flex flex-wrap gap-2 mb-6 border-b border-black/10 dark:border-white/10">
        {tabs.map((tab) => {
          const peek = DESK_PEEK[tab.key];
          return (
            <Peekable
              key={tab.key}
              title={tab.label}
              lines={peek?.lines}
              href={tab.key === "home" ? "/" : `/?desk=${tab.key}`}
              pop={{ title: tab.label, url: `${tab.key === "home" ? "/" : `/?desk=${tab.key}`}${tab.key === "home" ? "?" : "&"}embed=1`, kind: "App" }}
              add={peek?.add ? { label: peek.add.label, pop: { title: peek.add.label, url: `/register?open=${peek.add.fn}&embed=1`, kind: "Function" } } : undefined}
            >
              <button
                onClick={() => open(tab.key)}
                aria-current={active === tab.key ? "page" : undefined}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${active === tab.key ? "on " : ""}${
                  active === tab.key
                    ? "border-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {tab.label}
              </button>
            </Peekable>
          );
        })}
      </nav>

      {active === "home" && isOwner && <HomeDesk onNavigate={(d) => open(d)} />}
      {active === "jobwork" && (
        <JobWorkDesk initialEntries={initialJobWork} dbConnected={dbConnected} />
      )}
      {active === "manufacturing" && (
        <ManufacturingDesk initialBatches={initialMfg} dbConnected={dbConnected} />
      )}
      {active === "closing" && (
        <DailyClosingDesk initialEntries={initialClosing} dbConnected={dbConnected} />
      )}
      {active === "sales" && (
        <SalesDesk
          initialInvoices={initialSales}
          purchases={initialPurchases}
          parties={initialParties}
          items={initialItems}
          settings={initialSettings}
          dbConnected={dbConnected}
        />
      )}
      {active === "purchase" && (
        <PurchaseDesk
          initialBills={initialPurchases}
          parties={initialParties}
          items={initialItems}
          settings={initialSettings}
          dbConnected={dbConnected}
        />
      )}
      {active === "expenses" && (
        <ExpensesDesk
          initialExpenses={initialExpenses}
          parties={initialParties}
          dbConnected={dbConnected}
        />
      )}
      {active === "parties" && (
        <PartiesDesk initialParties={initialParties} dbConnected={dbConnected} onNavigate={(d) => open(d as Desk)} />
      )}
      {active === "inventory" && (
        <InventoryDesk initialItems={initialItems} dbConnected={dbConnected} onNavigate={(d) => open(d as Desk)} />
      )}
      {active === "scales" && <ScaleDashboard />}
      {active === "reports" && (
        <ReportsDesk
          jobWork={initialJobWork}
          closing={initialClosing}
          mfg={initialMfg}
          onNavigate={(desk) => open(desk === "mfg" ? "manufacturing" : desk)}
        />
      )}
      {active === "ledger" && isOwner && <LedgerDesk />}
      {active === "vyapar" && isOwner && (
        <VyaparDesk initialSnapshot={initialVyapar} dbConnected={dbConnected} />
      )}
      {active === "settings" && isOwner && (
        <SettingsDesk initialSettings={initialSettings} dbConnected={dbConnected} />
      )}
    </div>
  );
}
