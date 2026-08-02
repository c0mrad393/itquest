"use client";

/**
 * AssetManager — hardware inventory / store room (Level-0 host app)
 * ================================================================
 * Tracks every physical asset the company owns and lets the operator book
 * stock out against a ticket, a person or the rack. Stock levels live in
 * InfrastructureState, so allocations persist and ticket win-conditions can
 * read them.
 *
 * Icons are SVG (components/ui/icons) — no emoji in this UI.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { availableOf, CATEGORY_LABEL, type AssetCategory, type AssetItem } from "@/lib/core";
import {
  categoryIcon, IconAlert, IconBoxes, IconCheck, IconPackage, IconSearch, IconTrash, IconWrench, IconX,
} from "@/components/ui/icons";

const CATEGORIES: AssetCategory[] = ["workstation", "peripheral", "cable", "network", "server", "power", "panel"];

export default function AssetManager() {
  const inventory = useInfraStore((s) => s.infra.inventory);
  const returnAllocation = useInfraStore((s) => s.returnAllocation);

  const [tab, setTab] = useState<"stock" | "allocations">("stock");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<AssetCategory | "all">("all");
  const [checkout, setCheckout] = useState<AssetItem | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.items.filter((i) => {
      if (cat !== "all" && i.category !== cat) return false;
      if (q && !`${i.name} ${i.model} ${i.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inventory.items, query, cat]);

  const totals = useMemo(() => {
    const t = { total: 0, available: 0, deployed: 0, inRepair: 0 };
    for (const i of inventory.items) {
      t.total += i.total; t.available += availableOf(i); t.deployed += i.deployed; t.inRepair += i.inRepair;
    }
    return t;
  }, [inventory.items]);

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <IconBoxes size={18} className="text-info" />
        <span className="text-sm font-semibold">AssetManager</span>
        <div className="ml-3 flex rounded-lg border border-edge p-0.5 text-xs">
          <TabBtn active={tab === "stock"} onClick={() => setTab("stock")}>Stock</TabBtn>
          <TabBtn active={tab === "allocations"} onClick={() => setTab("allocations")}>Allocations ({inventory.allocations.length})</TabBtn>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <Stat label="Available" value={totals.available} tone="text-emerald-300" />
          <Stat label="Deployed" value={totals.deployed} tone="text-info" />
          <Stat label="Repair" value={totals.inRepair} tone="text-amber-300" />
        </div>
      </div>

      {tab === "stock" ? (
        <>
          {/* Filters */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"><IconSearch size={13} /></span>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search assets…"
                className="w-56 rounded border border-edge bg-panelalt py-1 pl-7 pr-2 text-xs outline-none placeholder:text-gray-600 focus:border-info"
              />
            </div>
            <CatChip active={cat === "all"} onClick={() => setCat("all")}>All</CatChip>
            {CATEGORIES.map((c) => (
              <CatChip key={c} active={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</CatChip>
            ))}
          </div>

          {/* Stock table */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 grid grid-cols-[1fr_90px_70px_70px_70px_110px] gap-2 border-b border-edge bg-panelalt px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <span>Asset</span><span>Category</span><span className="text-right">Avail</span>
              <span className="text-right">Deployed</span><span className="text-right">Repair</span><span className="text-right">Action</span>
            </div>
            {items.length === 0 && <div className="p-6 text-center text-xs text-gray-600">No assets match these filters.</div>}
            {items.map((i) => {
              const avail = availableOf(i);
              return (
                <div key={i.id} className="grid grid-cols-[1fr_90px_70px_70px_70px_110px] items-center gap-2 border-b border-edge/50 px-4 py-2 hover:bg-panelalt/50">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-gray-400">{categoryIcon(i.category, { size: 15 })}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-gray-100">{i.name}</span>
                      <span className="block truncate font-mono text-[10px] text-gray-500">{i.model}{i.uSize ? ` · ${i.uSize}U` : ""}</span>
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-gray-400">{CATEGORY_LABEL[i.category]}</span>
                  <span className={`text-right font-mono text-xs ${avail === 0 ? "text-danger" : avail <= 2 ? "text-amber-300" : "text-emerald-300"}`}>{avail}</span>
                  <span className="text-right font-mono text-xs text-gray-400">{i.deployed}</span>
                  <span className="text-right font-mono text-xs text-gray-400">{i.inRepair}</span>
                  <span className="text-right">
                    <button
                      onClick={() => setCheckout(i)} disabled={avail < 1}
                      className="rounded border border-info/40 px-2 py-0.5 text-[10px] font-semibold text-info hover:bg-info/10 disabled:cursor-not-allowed disabled:border-edge disabled:text-gray-600"
                    >Check out</button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inventory.allocations.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-gray-600">
              <IconPackage size={22} /> Nothing is checked out yet.
            </div>
          )}
          {inventory.allocations.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-edge/50 px-4 py-2">
              <span className="text-gray-500"><IconPackage size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-gray-100">{a.qty} × {a.itemName}</span>
                <span className="block truncate text-[10px] text-gray-500">
                  to {a.assignedTo}{a.ticketCode ? ` · ${a.ticketCode}` : ""} · {new Date(a.at).toLocaleString()}
                </span>
              </span>
              <button onClick={() => returnAllocation(a.id)} className="flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-[10px] text-gray-300 hover:bg-panelalt">
                <IconTrash size={11} /> Return
              </button>
            </div>
          ))}
        </div>
      )}

      {checkout && <CheckoutDialog item={checkout} onClose={() => setCheckout(null)} />}
    </div>
  );
}

// ── Checkout dialog ──────────────────────────────────────────────────────────

function CheckoutDialog({ item, onClose }: { item: AssetItem; onClose: () => void }) {
  const allocate = useInfraStore((s) => s.allocateAsset);
  const setRepair = useInfraStore((s) => s.setAssetRepair);
  const tickets = useTicketStore((s) => s.tickets).filter((t) => t.status !== "resolved" && t.status !== "closed" && !t.mailOnly);

  const avail = availableOf(item);
  const [qty, setQty] = useState(1);
  const [assignedTo, setAssignedTo] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (qty < 1 || qty > avail) { setErr(`Only ${avail} available.`); return; }
    if (!assignedTo.trim()) { setErr("Enter who or what this is assigned to."); return; }
    const t = tickets.find((x) => x.id === ticketId);
    allocate(item.id, qty, assignedTo.trim(), t ? { id: t.id, code: t.code } : undefined);
    onClose();
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[380px] overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-2 text-xs">
          <span className="text-info">{categoryIcon(item.category, { size: 15 })}</span>
          <span className="font-semibold text-gray-100">Check out — {item.name}</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white"><IconX size={12} /></button>
        </div>
        <div className="space-y-3 p-4 text-xs">
          <div className="flex items-center justify-between rounded border border-edge bg-panelalt/60 px-2 py-1.5 text-[11px]">
            <span className="text-gray-400">{item.model}</span>
            <span className={avail <= 2 ? "text-amber-300" : "text-emerald-300"}>{avail} available</span>
          </div>

          <Field label="Quantity">
            <div className="flex items-center gap-1">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="rounded border border-edge px-2 py-1 text-gray-300 hover:bg-panelalt">−</button>
              <input type="number" value={qty} min={1} max={avail}
                onChange={(e) => { setQty(Math.max(1, Math.min(avail, Number(e.target.value) || 1))); setErr(null); }}
                className="w-16 rounded border border-edge bg-panelalt px-2 py-1 text-center font-mono text-gray-100 outline-none focus:border-info" />
              <button onClick={() => setQty((q) => Math.min(avail, q + 1))} className="rounded border border-edge px-2 py-1 text-gray-300 hover:bg-panelalt">+</button>
            </div>
          </Field>

          <Field label="Assign to">
            <input value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setErr(null); }}
              placeholder="user, hostname or Rack A"
              className="w-full rounded border border-edge bg-panelalt px-2 py-1 text-gray-100 outline-none placeholder:text-gray-600 focus:border-info" />
          </Field>

          <Field label="Against ticket">
            <select value={ticketId} onChange={(e) => setTicketId(e.target.value)}
              className="w-full rounded border border-edge bg-panelalt px-2 py-1 text-gray-200 outline-none focus:border-info">
              <option value="">— none —</option>
              {tickets.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.title.slice(0, 46)}</option>)}
            </select>
          </Field>

          {err && <div className="flex items-center gap-1.5 text-[11px] text-danger"><IconAlert size={12} /> {err}</div>}

          <div className="flex items-center gap-2 border-t border-edge pt-3">
            <button
              onClick={() => { setRepair(item.id, item.inRepair + 1); onClose(); }}
              className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-[11px] text-amber-300 hover:bg-panelalt"
              title="Move one unit to the repair bench"
            ><IconWrench size={12} /> Send to repair</button>
            <button onClick={onClose} className="ml-auto rounded border border-edge px-3 py-1 text-gray-300 hover:bg-panelalt">Cancel</button>
            <button onClick={submit} className="flex items-center gap-1 rounded bg-info px-3 py-1 font-semibold text-black hover:brightness-110">
              <IconCheck size={12} /> Allocate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1 ${active ? "bg-info font-semibold text-black" : "text-gray-300 hover:bg-panel"}`}>{children}</button>;
}
function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${active ? "border-info bg-info/15 text-info" : "border-edge text-gray-400 hover:bg-panelalt"}`}>{children}</button>;
}
function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <span className="flex items-baseline gap-1"><span className="text-gray-500">{label}</span><span className={`font-mono ${tone}`}>{value}</span></span>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      {children}
    </div>
  );
}
