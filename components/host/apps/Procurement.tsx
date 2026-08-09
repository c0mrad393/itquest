"use client";

/**
 * Procurement — the vendor storefront (Level-0 host app).
 * =======================================================
 * Where IT Budget turns back into capability. Three counters:
 *
 *   Hardware   restock the store room. This is the loop that matters: the
 *              Hardware Lab consumes parts and refuses to fit what is not on
 *              the shelf, so an empty shelf blocks repairs until you buy.
 *   Licences   permanent unlocks that change other apps (see lib/economy).
 *   Emergency  hire an external contractor to close a ticket you are stuck
 *              on. It costs a great deal and pays no XP — the work was
 *              bought, not done.
 *
 * Hardware writes to `infra.inventory` (world state, persisted with the save);
 * budget and licences live on the host profile. Nothing here is escrowed —
 * every purchase is a single transaction that either completes or is refused
 * for insufficient funds.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import {
  availableOf,
  CATEGORY_LABEL,
  SHIPPING_OPTIONS,
  shippingOption,
  specLine,
  type AssetCategory,
  type ShippingMethod,
  type Ticket,
} from "@/lib/core";
import { LICENSES, hardwarePrice, hasLicense, type LicenseId } from "@/lib/economy/licenses";
import { AppIcon } from "@/components/ui/app-icons";
import { categoryIcon } from "@/components/ui/icons";
import { AppHeader, SearchField, Segmented } from "./AppChrome";
import { playCue } from "@/lib/audio/engine";

type Tab = "hardware" | "licenses" | "emergency";

/** What an external contractor charges to close a ticket, by tier. */
const CONTRACTOR_FEE: Record<string, number> = {
  Tier_1_Easy: 900,
  Tier_2_Medium: 2400,
  Tier_3_Hard: 6500,
  Tier_4_Expert: 14000,
};

export function contractorFee(ticket: Ticket): number {
  return CONTRACTOR_FEE[ticket.difficulty] ?? CONTRACTOR_FEE.Tier_1_Easy;
}

export default function Procurement() {
  const budget = useHostStore((s) => s.host.user.budget);
  const [tab, setTab] = useState<Tab>("hardware");

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="cart" title="Procurement" subtitle="Vendor storefront">
        <BudgetPill budget={budget} />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "hardware" as const, label: "Hardware" },
            { value: "licenses" as const, label: "Licences" },
            { value: "emergency" as const, label: "Emergency" },
          ]}
        />
      </AppHeader>

      {tab === "hardware" && <Hardware />}
      {tab === "licenses" && <Licences />}
      {tab === "emergency" && <Emergency />}
    </div>
  );
}

function BudgetPill({ budget }: { budget: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1"
      title="IT Budget — earned by resolving tickets"
    >
      <span className="text-emerald-300">
        <AppIcon id="credit" size={13} />
      </span>
      <span className="font-mono text-[12px] font-semibold text-gray-100">
        {budget.toLocaleString()}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-gray-600">Cr</span>
    </span>
  );
}

// ── Hardware counter (B2B catalogue) ───────────────────────────────────────

const CATEGORIES: (AssetCategory | "all")[] = [
  "all", "memory", "storage", "component", "network", "server", "power", "cable", "peripheral", "panel", "workstation",
];

type StockFilter = "all" | "in-stock" | "out";

function Hardware() {
  const items = useInfraStore((s) => s.infra.inventory.items);
  const placeOrder = useInfraStore((s) => s.placeOrder);
  const budget = useHostStore((s) => s.host.user.budget);
  const licenses = useHostStore((s) => s.host.licenses);
  const spend = useHostStore((s) => s.spendBudget);

  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [brand, setBrand] = useState<string | "all">("all");
  const [busFilter, setBusFilter] = useState<string | "all">("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<ShippingMethod>("standard");
  const [flash, setFlash] = useState<string | null>(null);

  const discounted = hasLicense(licenses, "spare-parts-contract");
  const buyable = useMemo(() => items.filter((i) => i.price != null), [items]);

  const brands = useMemo(
    () => Array.from(new Set(buyable.map((i) => i.brand))).sort(),
    [buyable],
  );
  const interfaces = useMemo(
    () => Array.from(new Set(buyable.map((i) => i.traits?.busInterface).filter(Boolean))).sort() as string[],
    [buyable],
  );

  const listed = useMemo(
    () =>
      buyable.filter((i) => {
        if (category !== "all" && i.category !== category) return false;
        if (brand !== "all" && i.brand !== brand) return false;
        if (busFilter !== "all" && i.traits?.busInterface !== busFilter) return false;
        if (stockFilter === "in-stock" && availableOf(i) === 0) return false;
        if (stockFilter === "out" && availableOf(i) > 0) return false;
        const q = query.trim().toLowerCase();
        if (q && !`${i.name} ${i.brand} ${i.model} ${i.id} ${specLine(i)}`.toLowerCase().includes(q))
          return false;
        return true;
      }),
    [buyable, category, brand, busFilter, stockFilter, query],
  );

  const ship = shippingOption(method);
  const lines = Object.entries(cart).filter(([, n]) => n > 0);
  const subtotal = lines.reduce((t, [id, n]) => {
    const item = buyable.find((i) => i.id === id);
    return t + (item ? hardwarePrice(item.price!, licenses) * n : 0);
  }, 0);
  const orderTotal = Math.round(subtotal * (1 + ship.surcharge));
  const affordable = budget >= orderTotal && lines.length > 0;

  function submit() {
    if (!affordable) {
      playCue("error");
      setFlash("insufficient");
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    if (!spend(orderTotal)) {
      playCue("error");
      return;
    }
    // Charge once for the basket, then raise one order per line so each can be
    // tracked and delivered independently in the Asset Manager.
    for (const [id, qty] of lines) {
      const item = buyable.find((i) => i.id === id)!;
      const paid = Math.round(hardwarePrice(item.price!, licenses) * qty * (1 + ship.surcharge));
      placeOrder({ itemId: id, qty, method, paid });
    }
    playCue(method === "express" ? "success" : "notify");
    setCart({});
    setFlash(method === "express" ? "delivered" : "ordered");
    setTimeout(() => setFlash(null), 2600);
  }

  const setQty = (id: string, n: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, n)) }));

  return (
    <div className="flex min-h-0 flex-1">
      {/* Filter rail */}
      <aside className="term-scroll w-52 shrink-0 overflow-y-auto border-r border-edge bg-panelalt/40 p-3">
        <FilterGroup label="Category">
          {CATEGORIES.map((c) => (
            <RailItem key={c} active={category === c} onClick={() => setCategory(c)}>
              {c === "all" ? "All categories" : CATEGORY_LABEL[c]}
            </RailItem>
          ))}
        </FilterGroup>

        <FilterGroup label="Brand">
          <RailItem active={brand === "all"} onClick={() => setBrand("all")}>All brands</RailItem>
          {brands.map((b) => (
            <RailItem key={b} active={brand === b} onClick={() => setBrand(b)}>{b}</RailItem>
          ))}
        </FilterGroup>

        <FilterGroup label="Interface">
          <RailItem active={busFilter === "all"} onClick={() => setBusFilter("all")}>Any interface</RailItem>
          {interfaces.map((b) => (
            <RailItem key={b} active={busFilter === b} onClick={() => setBusFilter(b)}>{b}</RailItem>
          ))}
        </FilterGroup>

        <FilterGroup label="Availability">
          <RailItem active={stockFilter === "all"} onClick={() => setStockFilter("all")}>Any</RailItem>
          <RailItem active={stockFilter === "in-stock"} onClick={() => setStockFilter("in-stock")}>In stock</RailItem>
          <RailItem active={stockFilter === "out"} onClick={() => setStockFilter("out")}>Out of stock</RailItem>
        </FilterGroup>
      </aside>

      {/* Catalogue */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-edge px-3.5">
          <SearchField value={query} onChange={setQuery} placeholder="Search catalogue…" className="w-64" />
          <span className="text-[10px] text-gray-600">{listed.length} lines</span>
          {discounted && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              <AppIcon id="truck" size={11} />
              Contract pricing
            </span>
          )}
        </div>

        <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            {listed.map((item) => {
              const unit = hardwarePrice(item.price!, licenses);
              const have = availableOf(item);
              const n = cart[item.id] ?? 0;
              return (
                <article
                  key={item.id}
                  className={`flex flex-col rounded-xl border bg-panelalt/50 p-3 transition ${
                    n > 0 ? "border-info/50 ring-1 ring-info/20" : "border-edge"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 text-gray-500">
                      {categoryIcon(item.category, { size: 18 })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                          {item.brand}
                        </span>
                        <span className="font-mono text-[9px] text-gray-600">{item.model}</span>
                      </div>
                      <div className="mt-1 truncate text-[12.5px] font-medium text-gray-100">{item.name}</div>
                      <div className="truncate font-mono text-[10px] text-info/80">{specLine(item)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[13px] font-semibold text-gray-100">
                        {unit.toLocaleString()}
                      </div>
                      {discounted && (
                        <div className="font-mono text-[9px] text-gray-600 line-through">
                          {item.price!.toLocaleString()}
                        </div>
                      )}
                      <div className="text-[9px] uppercase tracking-wider text-gray-600">Cr</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2 border-t border-edge/60 pt-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        have === 0 ? "bg-danger/15 text-danger" : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {have === 0 ? "No spares" : `${have} spare`}
                    </span>
                    {item.inTransit > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                        <AppIcon id="truck" size={9} />
                        {item.inTransit} inbound
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => setQty(item.id, n - 1)}
                        disabled={n === 0}
                        className="flex h-6 w-6 items-center justify-center rounded border border-edge text-gray-400 hover:bg-edge disabled:opacity-30"
                        aria-label="Fewer"
                      >
                        <AppIcon id="minus" size={11} />
                      </button>
                      <span className="w-6 text-center font-mono text-[11px] text-gray-200">{n}</span>
                      <button
                        onClick={() => setQty(item.id, n + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-edge text-gray-400 hover:bg-edge"
                        aria-label="More"
                      >
                        <AppIcon id="plus" size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {listed.length === 0 && (
            <div className="py-12 text-center text-[11px] text-gray-600">
              Nothing in the catalogue matches those filters.
            </div>
          )}
        </div>
      </div>

      {/* Basket + shipping */}
      <aside className="flex w-64 shrink-0 flex-col border-l border-edge bg-panelalt/40">
        <div className="border-b border-edge px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Purchase order
        </div>

        <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {lines.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-gray-600">
              Nothing selected.
            </div>
          ) : (
            <div className="space-y-1.5">
              {lines.map(([id, n]) => {
                const item = buyable.find((i) => i.id === id)!;
                return (
                  <div key={id} className="flex items-start gap-2 text-[11px]">
                    <span className="font-mono text-gray-500">{n}×</span>
                    <span className="min-w-0 flex-1 truncate text-gray-300">{item.name}</span>
                    <span className="shrink-0 font-mono text-gray-400">
                      {(hardwarePrice(item.price!, licenses) * n).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-edge p-3">
          <div className="mb-2 text-[9px] uppercase tracking-wider text-gray-600">Shipping</div>
          <div className="space-y-1.5">
            {SHIPPING_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setMethod(o.id)}
                className={`flex w-full flex-col rounded-lg border p-2 text-left transition ${
                  method === o.id
                    ? "border-info/50 bg-info/10"
                    : "border-edge hover:border-gray-500"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <AppIcon id={o.id === "express" ? "truck" : "package"} size={12} />
                  <span className={`text-[11px] font-semibold ${method === o.id ? "text-info" : "text-gray-300"}`}>
                    {o.label}
                  </span>
                  {o.surcharge > 0 && (
                    <span className="ml-auto font-mono text-[10px] text-amber-300">
                      +{Math.round(o.surcharge * 100)}%
                    </span>
                  )}
                </span>
                <span className="mt-0.5 text-[9.5px] leading-snug text-gray-500">{o.blurb}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-1 border-t border-edge pt-2.5 text-[11px]">
            <Row label="Subtotal" value={`${subtotal.toLocaleString()} Cr`} />
            {ship.surcharge > 0 && (
              <Row
                label="Courier surcharge"
                value={`+${(orderTotal - subtotal).toLocaleString()} Cr`}
                tone="warn"
              />
            )}
            <Row label="Total" value={`${orderTotal.toLocaleString()} Cr`} strong />
            <Row label="Budget after" value={`${(budget - orderTotal).toLocaleString()} Cr`} tone={budget - orderTotal < 0 ? "bad" : "muted"} />
          </div>

          <button
            onClick={submit}
            disabled={!affordable}
            className={`mt-3 w-full rounded-md border px-3 py-2 text-[11px] font-semibold transition ${
              flash === "ordered" || flash === "delivered"
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : flash === "insufficient"
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : "border-info/50 bg-info/10 text-info hover:bg-info/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-gray-600"
            }`}
          >
            {flash === "delivered"
              ? "Delivered to the bench"
              : flash === "ordered"
                ? "Order placed — in transit"
                : flash === "insufficient"
                  ? "Not enough budget"
                  : `Place order${lines.length ? ` (${lines.length})` : ""}`}
          </button>
          {method === "standard" && lines.length > 0 && (
            <div className="mt-1.5 text-center text-[9px] text-gray-600">
              Arrives after {ship.ticketsToWait} more incidents are closed.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-gray-600">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] transition ${
        active ? "bg-info/15 text-info" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  value,
  strong,
  tone = "muted",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "muted" | "warn" | "bad";
}) {
  const color = tone === "bad" ? "text-danger" : tone === "warn" ? "text-amber-300" : "text-gray-300";
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono ${strong ? "font-semibold text-gray-100" : color}`}>{value}</span>
    </div>
  );
}

// ── Licences ────────────────────────────────────────────────────────────────

function Licences() {
  const budget = useHostStore((s) => s.host.user.budget);
  const licenses = useHostStore((s) => s.host.licenses);
  const spend = useHostStore((s) => s.spendBudget);
  const grant = useHostStore((s) => s.grantLicense);
  const [flash, setFlash] = useState<string | null>(null);

  function buy(id: LicenseId, price: number) {
    if (!spend(price)) {
      playCue("error");
      setFlash(id);
      setTimeout(() => setFlash(null), 1800);
      return;
    }
    grant(id);
    playCue("success");
  }

  return (
    <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {LICENSES.map((l) => {
          const owned = hasLicense(licenses, l.id);
          const afford = budget >= l.price;
          return (
            <div
              key={l.id}
              className={`flex flex-col rounded-xl border p-3.5 ${
                owned ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "border-edge bg-panelalt/50"
              }`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    owned ? "bg-emerald-500/15 text-emerald-300" : "bg-info/12 text-info"
                  }`}
                >
                  <AppIcon id={l.iconId} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-gray-100">{l.name}</div>
                  <div className="truncate text-[10px] text-gray-500">{l.vendor}</div>
                </div>
                {owned && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <AppIcon id="check" size={10} />
                    Owned
                  </span>
                )}
              </div>

              <div className="mb-1.5 text-[11.5px] text-gray-200">{l.effect}</div>
              <div className="mb-3 text-[10.5px] leading-relaxed text-gray-500">{l.detail}</div>

              <div className="mt-auto flex items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-gray-100">
                  {l.price.toLocaleString()}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-gray-600">Cr</span>
                {!owned && (
                  <button
                    onClick={() => buy(l.id, l.price)}
                    disabled={!afford}
                    className={`ml-auto rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                      flash === l.id
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : "border-info/50 bg-info/10 text-info hover:bg-info/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-gray-600"
                    }`}
                  >
                    {flash === l.id ? "No funds" : "Purchase"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Emergency services ──────────────────────────────────────────────────────

function Emergency() {
  const tickets = useTicketStore((s) => s.tickets);
  const outsource = useTicketStore((s) => s.outsource);
  const advanceDeliveries = useInfraStore((s) => s.advanceDeliveries);
  const budget = useHostStore((s) => s.host.user.budget);
  const spend = useHostStore((s) => s.spendBudget);
  const note = useDialogueStore((s) => s.note);
  const push = useNotificationStore((s) => s.push);
  const [confirming, setConfirming] = useState<string | null>(null);

  const open = tickets.filter(
    // Company projects are excluded: a milestone is the business deciding what
    // gets built, not a request the desk can buy its way out of.
    (t) => !t.mailOnly && !t.mandatory && t.status !== "resolved" && t.status !== "closed",
  );

  function hire(ticket: Ticket) {
    const fee = contractorFee(ticket);
    if (!spend(fee)) {
      playCue("error");
      return;
    }
    outsource(ticket.id);
    // A closed incident is a closed incident: freight advances either way.
    const arrived = advanceDeliveries();
    if (arrived.length > 0) {
      push({ kind: "info", title: "Delivery received", body: arrived.join(", "), badge: "Store room" });
    }
    note(
      ticket.id,
      `Closed by external contractor — ${fee.toLocaleString()} Cr. No XP awarded.`,
    );
    push({
      kind: "info",
      title: `${ticket.code} outsourced`,
      body: ticket.title,
      badge: `−${fee.toLocaleString()} Cr`,
    });
    setConfirming(null);
  }

  return (
    <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-200">
          <AppIcon id="alert" size={13} />
          Hire an external contractor
        </div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-amber-200/70">
          A specialist closes the incident for you. The customer is satisfied and the SLA
          is met — but the work was bought, not done, so it earns{" "}
          <span className="font-semibold">no XP</span> and no budget back. Reserved for
          tickets you are genuinely stuck on.
        </div>
      </div>

      {open.length === 0 && (
        <div className="py-10 text-center text-[11px] text-gray-600">
          Nothing open to outsource.
        </div>
      )}

      <div className="space-y-2">
        {open.map((t) => {
          const fee = contractorFee(t);
          const afford = budget >= fee;
          const isConfirming = confirming === t.id;
          return (
            <div
              key={t.id}
              className={`rounded-xl border bg-panelalt/50 p-3 ${
                isConfirming ? "border-amber-500/50" : "border-edge"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-gray-500">{t.code}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      {t.difficulty.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-gray-100">{t.title}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[13px] font-semibold text-gray-100">
                    {fee.toLocaleString()}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-gray-600">Cr fee</div>
                </div>
                {isConfirming ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => hire(t)}
                      className="rounded-md bg-amber-500/90 px-3 py-1.5 text-[11px] font-semibold text-black hover:brightness-110"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="rounded-md border border-edge px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-edge"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(t.id)}
                    disabled={!afford}
                    title={afford ? "Hire a contractor" : "Not enough IT Budget"}
                    className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-edge disabled:text-gray-600"
                  >
                    Hire
                  </button>
                )}
              </div>
              {isConfirming && (
                <div className="mt-2 border-t border-amber-500/20 pt-2 text-[10px] text-amber-200/70">
                  This closes {t.code} immediately for {fee.toLocaleString()} Cr and awards no XP.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
