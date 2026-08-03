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
import { availableOf, CATEGORY_LABEL, type AssetCategory, type Ticket } from "@/lib/core";
import { LICENSES, hardwarePrice, hasLicense, type LicenseId } from "@/lib/economy/licenses";
import { AppIcon } from "@/components/ui/app-icons";
import { categoryIcon } from "@/components/ui/icons";
import { AppHeader, Chip, FilterBar, SearchField, Segmented } from "./AppChrome";
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

// ── Hardware counter ────────────────────────────────────────────────────────

const CATEGORIES: (AssetCategory | "all")[] = [
  "all",
  "peripheral",
  "cable",
  "network",
  "server",
  "power",
  "panel",
  "workstation",
];

function Hardware() {
  const items = useInfraStore((s) => s.infra.inventory.items);
  const purchase = useInfraStore((s) => s.purchaseAsset);
  const budget = useHostStore((s) => s.host.user.budget);
  const licenses = useHostStore((s) => s.host.licenses);
  const spend = useHostStore((s) => s.spendBudget);

  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const discounted = hasLicense(licenses, "spare-parts-contract");

  const listed = useMemo(
    () =>
      items
        .filter((i) => i.price != null)
        .filter((i) => category === "all" || i.category === category)
        .filter((i) =>
          query.trim()
            ? `${i.name} ${i.model} ${i.id}`.toLowerCase().includes(query.trim().toLowerCase())
            : true,
        ),
    [items, category, query],
  );

  // Anything the desk has run out of, surfaced first — that is the thing
  // blocking a repair right now.
  const outOfStock = listed.filter((i) => availableOf(i) === 0);

  function buy(id: string, unit: number) {
    const n = qty[id] ?? 1;
    const total = unit * n;
    if (!spend(total)) {
      playCue("error");
      setFlash(`insufficient:${id}`);
      setTimeout(() => setFlash(null), 1800);
      return;
    }
    purchase(id, n);
    playCue("notify");
    setFlash(`ok:${id}`);
    setTimeout(() => setFlash(null), 1800);
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
        <SearchField value={query} onChange={setQuery} placeholder="Search parts…" className="w-48" />
      </FilterBar>

      <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {discounted && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-200/90">
            <AppIcon id="truck" size={13} />
            Spare Parts Contract active — all hardware discounted.
          </div>
        )}

        {outOfStock.length > 0 && category === "all" && !query.trim() && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
              <AppIcon id="alert" size={11} />
              Out of stock — {outOfStock.length} line{outOfStock.length === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-[10px] text-amber-200/60">
              The Hardware Lab cannot fit a part the store room does not hold.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {listed.map((item) => {
            const unit = hardwarePrice(item.price!, licenses);
            const have = availableOf(item);
            const n = qty[item.id] ?? 1;
            const afford = budget >= unit * n;
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2.5 rounded-xl border bg-panelalt/50 p-3 ${
                  have === 0 ? "border-amber-500/30" : "border-edge"
                }`}
              >
                <span className="text-gray-400">{categoryIcon(item.category, { size: 17 })}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-gray-100">{item.name}</div>
                  <div className="truncate font-mono text-[10px] text-gray-500">
                    {item.model} ·{" "}
                    <span className={have === 0 ? "text-amber-300" : "text-gray-400"}>
                      {have} available
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-mono text-[12px] font-semibold text-gray-100">
                    {unit.toLocaleString()}
                    {discounted && (
                      <span className="ml-1 text-[10px] font-normal text-gray-600 line-through">
                        {item.price!.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-gray-600">Cr each</div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setQty({ ...qty, [item.id]: Math.max(1, n - 1) })}
                    className="flex h-6 w-6 items-center justify-center rounded border border-edge text-gray-400 hover:bg-edge"
                    aria-label="Fewer"
                  >
                    <AppIcon id="minus" size={11} />
                  </button>
                  <span className="w-5 text-center font-mono text-[11px] text-gray-200">{n}</span>
                  <button
                    onClick={() => setQty({ ...qty, [item.id]: Math.min(20, n + 1) })}
                    className="flex h-6 w-6 items-center justify-center rounded border border-edge text-gray-400 hover:bg-edge"
                    aria-label="More"
                  >
                    <AppIcon id="plus" size={11} />
                  </button>
                </div>

                <button
                  onClick={() => buy(item.id, unit)}
                  disabled={!afford}
                  title={afford ? `Order ${n}` : "Not enough IT Budget"}
                  className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    flash === `ok:${item.id}`
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : flash === `insufficient:${item.id}`
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : "border-info/50 bg-info/10 text-info hover:bg-info/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-gray-600"
                  }`}
                >
                  {flash === `ok:${item.id}`
                    ? "Ordered"
                    : flash === `insufficient:${item.id}`
                      ? "No funds"
                      : "Order"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
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
  const budget = useHostStore((s) => s.host.user.budget);
  const spend = useHostStore((s) => s.spendBudget);
  const note = useDialogueStore((s) => s.note);
  const push = useNotificationStore((s) => s.push);
  const [confirming, setConfirming] = useState<string | null>(null);

  const open = tickets.filter(
    (t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed",
  );

  function hire(ticket: Ticket) {
    const fee = contractorFee(ticket);
    if (!spend(fee)) {
      playCue("error");
      return;
    }
    outsource(ticket.id);
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
