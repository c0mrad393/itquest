"use client";

/**
 * CablingPanel — patch and power cabling for the rack. Every cable booked here
 * consumes a lead from AssetManager stock (RJ45 3m for data, C13 for power),
 * and disconnecting returns it to the shelf.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useSelectedRack } from "./rack-context";
import { availableOf, type CableKind } from "@/lib/core";
import { IconAlert, IconLink, IconPlus, IconPower, IconX } from "@/components/ui/icons";

const SKU: Record<CableKind, string> = { patch: "sku-rj45-3m", power: "sku-power-c13" };

export default function CablingPanel() {
  const { rackId, rack } = useSelectedRack();
  const inventory = useInfraStore((s) => s.infra.inventory);
  const connect = useInfraStore((s) => s.rackConnectCable);
  const disconnect = useInfraStore((s) => s.rackDisconnectCable);

  const [kind, setKind] = useState<CableKind>("patch");
  const [fromId, setFromId] = useState("");
  const [fromPort, setFromPort] = useState("");
  const [toId, setToId] = useState("");
  const [toPort, setToPort] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const devices = rack.devices;
  const fromDev = devices.find((d) => d.id === fromId);
  const toDev = devices.find((d) => d.id === toId);
  const stock = inventory.items.find((i) => i.id === SKU[kind]);
  const cableStock = stock ? availableOf(stock) : 0;

  // For power runs the destination is a UPS/PDU; for data it's anything else.
  const destinations = devices.filter((d) =>
    d.id !== fromId && (kind === "power" ? d.kind === "ups" || d.kind === "pdu" : d.kind !== "ups" && d.kind !== "pdu"),
  );
  /** Power runs use PSU inlets / PDU outlets; data runs use the network ports. */
  const portsFor = (d: typeof fromDev) =>
    (d?.ports ?? []).filter((p) => (kind === "power" ? /^psu$|^out\d+$/.test(p) : !/^psu$/.test(p)));

  function add() {
    if (!fromId || !toId || !fromPort || !toPort) { setErr("Pick both ends of the cable."); return; }
    if (cableStock < 1) { setErr(`Out of ${kind === "power" ? "power leads" : "patch cables"} — restock in AssetManager.`); return; }
    const before = rack.cables.length;
    connect(rackId, { kind, fromDeviceId: fromId, fromPort, toDeviceId: toId, toPort });
    // The store rejects double-patched ports silently; surface that to the operator.
    setTimeout(() => {
      const after =
        useInfraStore.getState().infra.datacenter.racks.find((r) => r.id === rackId)?.cables.length ?? 0;
      if (after === before) setErr("That port is already in use.");
      else { setErr(null); setFromPort(""); setToPort(""); }
    }, 0);
  }

  return (
    <div className="p-3 text-xs">
      <div className="mb-2 flex items-center gap-1 rounded-md border border-edge p-0.5">
        <KindTab active={kind === "patch"} onClick={() => { setKind("patch"); setToId(""); setToPort(""); }} icon={<IconLink size={11} />}>Data</KindTab>
        <KindTab active={kind === "power"} onClick={() => { setKind("power"); setToId(""); setToPort(""); }} icon={<IconPower size={11} />}>Power</KindTab>
      </div>

      <div className="mb-2 flex items-center justify-between rounded border border-edge bg-panelalt/60 px-2 py-1 text-[10px]">
        <span className="text-gray-500">{kind === "power" ? "Power leads (C13)" : "Patch cables (Cat6 3m)"}</span>
        <span className={cableStock === 0 ? "text-danger" : cableStock <= 3 ? "text-amber-300" : "text-emerald-300"}>{cableStock} in stock</span>
      </div>

      {devices.length < 2 ? (
        <p className="py-4 text-center text-[11px] text-gray-600">Mount at least two devices to start cabling.</p>
      ) : (
        <>
          <Label>From</Label>
          <Select value={fromId} onChange={(v) => { setFromId(v); setFromPort(""); setErr(null); }} placeholder="— device —"
            options={devices.map((d) => ({ value: d.id, label: `${d.name} (U${d.uStart})` }))} />
          {fromDev && (
            <Select value={fromPort} onChange={(v) => { setFromPort(v); setErr(null); }} placeholder="— port —"
              options={portsFor(fromDev).map((p) => ({ value: p, label: p }))} />
          )}

          <Label className="mt-2">To</Label>
          <Select value={toId} onChange={(v) => { setToId(v); setToPort(""); setErr(null); }} placeholder="— device —"
            options={destinations.map((d) => ({ value: d.id, label: `${d.name} (U${d.uStart})` }))} />
          {toDev && (
            <Select value={toPort} onChange={(v) => { setToPort(v); setErr(null); }} placeholder="— port —"
              options={portsFor(toDev).map((p) => ({ value: p, label: p }))} />
          )}

          {err && <div className="mt-2 flex items-center gap-1.5 text-[10px] text-danger"><IconAlert size={11} /> {err}</div>}

          <button onClick={add} disabled={cableStock < 1}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-info px-2 py-1.5 text-[11px] font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500">
            <IconPlus size={12} /> Connect cable
          </button>
        </>
      )}

      <div className="mt-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Installed cables ({rack.cables.length})</div>
      {rack.cables.length === 0 && <p className="text-[10px] text-gray-600">No cables installed.</p>}
      {rack.cables.map((c) => {
        const a = devices.find((d) => d.id === c.fromDeviceId);
        const b = devices.find((d) => d.id === c.toDeviceId);
        return (
          <div key={c.id} className="mb-1 flex items-center gap-1.5 rounded border border-edge bg-panelalt/40 px-2 py-1">
            <span className={c.kind === "power" ? "text-amber-300" : "text-info"}>
              {c.kind === "power" ? <IconPower size={11} /> : <IconLink size={11} />}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-gray-300">
              {a?.name}:{c.fromPort} → {b?.name}:{c.toPort}
            </span>
            <button onClick={() => disconnect(rackId, c.id)} aria-label="Disconnect" className="text-gray-500 hover:text-danger"><IconX size={11} /></button>
          </div>
        );
      })}
    </div>
  );
}

function KindTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${active ? "bg-info font-semibold text-black" : "text-gray-300 hover:bg-panelalt"}`}>
      {icon} {children}
    </button>
  );
}
function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${className}`}>{children}</div>;
}
function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="mb-1 w-full rounded border border-edge bg-panelalt px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-info">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
