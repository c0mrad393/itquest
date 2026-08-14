"use client";

/**
 * AssetManager — the enterprise hardware ledger (Level-0 host app).
 * =================================================================
 * A sortable asset register in the shape of an ITIL/CMDB hardware table:
 * one row per SKU, showing where every owned unit sits in its lifecycle.
 *
 * Units live in four buckets that always sum to what the company owns:
 *   Spare       on the shelf, fittable
 *   Deployed    in a machine or the rack
 *   In Transit  ordered, not yet delivered
 *   Faulty      pulled out broken, still an asset on the books
 *
 * The Faulty column is the honest part: a part swapped out in the Hardware
 * Lab does not evaporate, it comes back here as dead stock the desk still
 * owns and has to account for.
 *
 * SVG icons only — no emoji in this UI.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import {
  ASSET_STATUS_LABEL,
  CATEGORY_LABEL,
  availableOf,
  specLine,
  totalOwned,
  type AssetCategory,
  type AssetItem,
  type AssetStatus,
} from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import { categoryIcon } from "@/components/ui/icons";
import { AppHeader, Chip, CountPill, FilterBar, SearchField, Segmented } from "./AppChrome";
import { relativeTime } from "@/lib/host/ticket-ui";

type Tab = "register" | "orders" | "allocations";
type SortKey = "name" | "brand" | "category" | "spare" | "deployed" | "faulty" | "total";

const STATUS_STYLE: Record<AssetStatus, string> = {
  spare: "bg-emerald-500/15 text-emerald-300",
  deployed: "bg-sky-500/15 text-sky-300",
  "in-transit": "bg-amber-500/15 text-amber-300",
  faulty: "bg-danger/15 text-danger",
};

export default function AssetManager() {
  const inventory = useInfraStore((s) => s.infra.inventory);
  const [tab, setTab] = useState<Tab>("register");

  const totals = useMemo(() => {
    const t = { spare: 0, deployed: 0, "in-transit": 0, faulty: 0 } as Record<AssetStatus, number>;
    for (const i of inventory.items) {
      t.spare += i.spare;
      t.deployed += i.deployed;
      t["in-transit"] += i.inTransit;
      t.faulty += i.faulty;
    }
    return t;
  }, [inventory.items]);

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="boxes" title="Asset Manager" subtitle="Hardware register">
        {inventory.orders.length > 0 && (
          <CountPill value={inventory.orders.length} label="in transit" tone="warn" />
        )}
        {totals.faulty > 0 && <CountPill value={totals.faulty} label="faulty" tone="muted" />}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "register" as const, label: "Register" },
            { value: "orders" as const, label: "Orders" },
            { value: "allocations" as const, label: "Allocations" },
          ]}
        />
      </AppHeader>

      {tab === "register" && <Register totals={totals} />}
      {tab === "orders" && <Orders />}
      {tab === "allocations" && <Allocations />}
    </div>
  );
}

// ── Register ────────────────────────────────────────────────────────────────

const CATEGORIES: (AssetCategory | "all")[] = [
  "all",
  "memory",
  "storage",
  "component",
  "network",
  "server",
  "power",
  "cable",
  "peripheral",
  "panel",
  "workstation",
];

function Register({ totals }: { totals: Record<AssetStatus, number> }) {
  const items = useInfraStore((s) => s.infra.inventory.items);
  const setRepair = useInfraStore((s) => s.setAssetRepair);
  const openApp = useHostStore((s) => s.openApp);

  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [status, setStatus] = useState<AssetStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("category");
  const [desc, setDesc] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (status === "spare" && i.spare === 0) return false;
      if (status === "deployed" && i.deployed === 0) return false;
      if (status === "in-transit" && i.inTransit === 0) return false;
      if (status === "faulty" && i.faulty === 0) return false;
      if (q && !`${i.name} ${i.brand} ${i.model} ${i.id} ${specLine(i)}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    const val = (i: AssetItem): string | number => {
      switch (sort) {
        case "name": return i.name;
        case "brand": return i.brand;
        case "category": return i.category;
        case "spare": return i.spare;
        case "deployed": return i.deployed;
        case "faulty": return i.faulty;
        case "total": return totalOwned(i);
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return desc ? -c : c;
    });
  }, [items, category, status, query, sort, desc]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDesc(!desc);
    else {
      setSort(key);
      // Counts read best highest-first; names read best A-Z.
      setDesc(key === "spare" || key === "deployed" || key === "faulty" || key === "total");
    }
  }

  return (
    <>
      <FilterBar>
        <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Search SKU, brand, spec…" className="w-52" />
      </FilterBar>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-edge px-3.5">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "all" as const, label: "Any status" },
            { value: "spare" as const, label: `Spare ${totals.spare}` },
            { value: "deployed" as const, label: `Deployed ${totals.deployed}` },
            { value: "in-transit" as const, label: `Transit ${totals["in-transit"]}` },
            { value: "faulty" as const, label: `Faulty ${totals.faulty}` },
          ]}
        />
        <span className="ml-auto text-[10px] text-gray-600">{rows.length} SKUs</span>
      </div>

      <div className="term-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panelalt">
            <tr className="text-[9px] uppercase tracking-wider text-gray-600">
              <Th onClick={() => toggleSort("name")} active={sort === "name"} desc={desc} className="pl-3.5">Asset</Th>
              <Th onClick={() => toggleSort("brand")} active={sort === "brand"} desc={desc}>Brand</Th>
              <Th onClick={() => toggleSort("category")} active={sort === "category"} desc={desc}>Class</Th>
              <Th onClick={() => toggleSort("spare")} active={sort === "spare"} desc={desc} numeric>Spare</Th>
              <Th onClick={() => toggleSort("deployed")} active={sort === "deployed"} desc={desc} numeric>Deployed</Th>
              <Th active={false} desc={desc} numeric>Transit</Th>
              <Th onClick={() => toggleSort("faulty")} active={sort === "faulty"} desc={desc} numeric>Faulty</Th>
              <Th onClick={() => toggleSort("total")} active={sort === "total"} desc={desc} numeric>Owned</Th>
              <th className="border-b border-edge px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-[11px] text-gray-600">
                  No assets match these filters.
                </td>
              </tr>
            )}
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-edge/40 hover:bg-gray-500/[0.07]">
                <td className="w-[42%] min-w-[240px] py-2 pl-3.5 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-gray-500">{categoryIcon(i.category, { size: 15 })}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] text-gray-100">{i.name}</div>
                      <div className="truncate font-mono text-[10px] text-gray-600">
                        {i.id} · {specLine(i)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-[11px] text-gray-400">{i.brand}</td>
                <td className="px-2 py-2 text-[11px] text-gray-500">{CATEGORY_LABEL[i.category]}</td>
                <Num value={i.spare} tone={i.spare === 0 ? "zero" : "spare"} />
                <Num value={i.deployed} tone={i.deployed === 0 ? "zero" : "deployed"} />
                <Num value={i.inTransit} tone={i.inTransit === 0 ? "zero" : "transit"} />
                <Num value={i.faulty} tone={i.faulty === 0 ? "zero" : "faulty"} />
                <td className="px-2 py-2 text-right font-mono text-[11px] font-semibold text-gray-200">
                  {totalOwned(i)}
                </td>
                <td className="py-2 pl-2 pr-3.5 text-right">
                  {availableOf(i) > 0 ? (
                    <button
                      onClick={() => setRepair(i.id, 1)}
                      title="Condemn one spare unit — moves it to Faulty"
                      className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-gray-500 hover:border-danger/40 hover:text-danger"
                    >
                      Condemn
                    </button>
                  ) : i.price != null ? (
                    <button
                      onClick={() => openApp("procurement")}
                      title="No spares — order more"
                      className="rounded border border-info/30 px-1.5 py-0.5 text-[9px] text-info/80 hover:bg-info/10"
                    >
                      Order
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({
  children,
  onClick,
  active,
  desc,
  numeric,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  active: boolean;
  desc: boolean;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th className={`border-b border-edge px-2 py-1.5 font-semibold ${numeric ? "text-right" : ""} ${className}`}>
      {onClick ? (
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-gray-300 ${
            active ? "text-info" : ""
          }`}
        >
          {children}
          {active && <AppIcon id="chevron-up" size={9} className={desc ? "rotate-180" : ""} />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Num({ value, tone }: { value: number; tone: "zero" | "spare" | "deployed" | "transit" | "faulty" }) {
  const color =
    tone === "zero"
      ? "text-gray-700"
      : tone === "spare"
        ? "text-emerald-300"
        : tone === "deployed"
          ? "text-sky-300"
          : tone === "transit"
            ? "text-amber-300"
            : "text-danger";
  return <td className={`px-2 py-2 text-right font-mono text-[11px] ${color}`}>{value}</td>;
}

// ── Orders ──────────────────────────────────────────────────────────────────

function Orders() {
  const orders = useInfraStore((s) => s.infra.inventory.orders);
  const openApp = useHostStore((s) => s.openApp);

  return (
    <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
      {orders.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-[11px] text-gray-600">No orders in transit.</div>
          <button
            onClick={() => openApp("procurement")}
            className="mt-2 rounded-md border border-info/40 px-3 py-1.5 text-[11px] font-semibold text-info hover:bg-info/10"
          >
            Open Procurement
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-200/80">
            <AppIcon id="truck" size={13} />
            Standard freight is released as incidents are closed — deliveries are paced by work,
            not by waiting.
          </div>
          {orders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-xl border border-edge bg-panelalt/50 p-3">
              <span className="text-amber-300">
                <AppIcon id="truck" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-gray-100">
                  {o.qty}× {o.itemName}
                </div>
                <div className="font-mono text-[10px] text-gray-500">
                  {o.method === "express" ? "Express courier" : "Standard freight"} ·{" "}
                  {o.paid.toLocaleString()} Cr · ordered {relativeTime(o.placedAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[12px] font-semibold text-amber-300">
                  {o.ticketsRemaining}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-gray-600">
                  ticket{o.ticketsRemaining === 1 ? "" : "s"} away
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Allocations ─────────────────────────────────────────────────────────────

function Allocations() {
  const allocations = useInfraStore((s) => s.infra.inventory.allocations);
  const items = useInfraStore((s) => s.infra.inventory.items);
  const allocate = useInfraStore((s) => s.allocateAsset);
  const returnAlloc = useInfraStore((s) => s.returnAllocation);
  const tickets = useTicketStore((s) => s.tickets);

  const spares = items.filter((i) => availableOf(i) > 0);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState("");
  const [ticketId, setTicketId] = useState("");

  const chosen = itemId || spares[0]?.id || "";
  const open = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed" && !t.mailOnly);

  return (
    <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <section className="mb-4 rounded-xl border border-edge bg-panelalt/50 p-3.5">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Check out a spare
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-gray-600">Asset</span>
            <select
              value={chosen}
              onChange={(e) => setItemId(e.target.value)}
              className="w-56 rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              {spares.length === 0 && <option value="">No spares on the shelf</option>}
              {spares.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({availableOf(i)})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-gray-600">Qty</span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="w-16 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-gray-600">Assign to</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="user / hostname / rack U"
              className="w-48 rounded border border-edge bg-panel px-2 py-1 text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-gray-600">
              Against ticket
            </span>
            <select
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              className="w-36 rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-200 outline-none"
            >
              <option value="">None</option>
              {open.map((t) => (
                <option key={t.id} value={t.id}>{t.code}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              if (!chosen || !to.trim()) return;
              const t = open.find((x) => x.id === ticketId);
              allocate(chosen, qty, to.trim(), t ? { id: t.id, code: t.code } : undefined);
              setTo("");
              setQty(1);
            }}
            disabled={!chosen || !to.trim()}
            className="rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-[11px] font-semibold text-info hover:bg-info/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-gray-600"
          >
            Check out
          </button>
        </div>
      </section>

      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Allocation ledger
      </div>
      {allocations.length === 0 && (
        <div className="py-8 text-center text-[11px] text-gray-600">Nothing checked out.</div>
      )}
      <div className="space-y-1.5">
        {allocations.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-lg border border-edge bg-panelalt/40 px-3 py-2"
          >
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE.deployed}`}>
              {ASSET_STATUS_LABEL.deployed}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-gray-100">
                {a.qty}× {a.itemName}
              </div>
              <div className="truncate text-[10px] text-gray-500">
                {a.assignedTo}
                {a.ticketCode ? ` · ${a.ticketCode}` : ""} · {relativeTime(a.at)}
              </div>
            </div>
            <button
              onClick={() => returnAlloc(a.id)}
              className="shrink-0 rounded border border-edge px-2 py-1 text-[10px] text-gray-400 hover:bg-edge"
            >
              Return
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
