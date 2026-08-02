"use client";

/**
 * RackSimulator — physical + logical infrastructure lab (Level-0 host app)
 * =======================================================================
 * Left: rackable equipment pulled live from the AssetManager inventory.
 * Right: a 24U rack. Drag a unit onto a free U to mount it (consuming stock).
 *
 * Selecting a mounted device opens its logical layer:
 *   switch / router → Cisco-style CLI (SwitchCli)
 *   server          → addressing + services modal (ServerConfigModal)
 * Cabling and power are booked through the cabling panel (each cable consumes
 * a patch / power lead from stock), and the Ping tool grades reachability with
 * the same pure `pingCheck` the ticket win-conditions use.
 *
 * SVG icons only — no emoji.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { availableOf, canMount, isPowered, uplinkOf, type AssetItem, type RackDevice } from "@/lib/core";
import { deviceIcon, IconLink, IconPower, IconServer, IconSliders, IconTerminal, IconTrash, IconX } from "@/components/ui/icons";
import SwitchCli from "./rack/SwitchCli";
import ServerConfigModal from "./rack/ServerConfigModal";
import CablingPanel from "./rack/CablingPanel";
import PingTool from "./rack/PingTool";

const ROW_H = 26;

export default function RackSimulator() {
  const inventory = useInfraStore((s) => s.infra.inventory);
  const rack = useInfraStore((s) => s.infra.rack);
  const mount = useInfraStore((s) => s.rackMountDevice);
  const remove = useInfraStore((s) => s.rackRemoveDevice);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<AssetItem | null>(null);
  /** Click-to-place: an "armed" unit waiting for the operator to pick a U. */
  const [armed, setArmed] = useState<AssetItem | null>(null);
  const [hoverU, setHoverU] = useState<number | null>(null);
  const [modal, setModal] = useState<"cli" | "server" | null>(null);
  const [panel, setPanel] = useState<"cabling" | "ping">("cabling");

  const rackable = inventory.items.filter((i) => !!i.deviceKind);
  const selected = rack.devices.find((d) => d.id === selectedId) ?? null;
  const units = Array.from({ length: rack.sizeU }, (_, i) => i + 1);

  /** Placing a unit — from a drag-drop or from a click-to-place selection. */
  function placeAt(u: number, item: AssetItem | null) {
    if (item) mount(item.id, u);
    setDragItem(null); setArmed(null); setHoverU(null);
  }
  function openLogical(d: RackDevice) {
    setSelectedId(d.id);
    if (d.kind === "switch" || d.kind === "router") setModal("cli");
    else if (d.kind === "server") setModal("server");
  }

  const pending = dragItem ?? armed;
  const dragSize = pending?.uSize ?? 1;

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <IconServer size={18} className="text-info" />
        <span className="text-sm font-semibold">Rack &amp; Network Lab</span>
        <span className="ml-2 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
          {rack.devices.length} mounted · {rack.cables.length} cables
        </span>
        <span className="ml-auto text-[11px] text-gray-500">Rack A · {rack.sizeU}U</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: equipment */}
        <div className="flex w-60 shrink-0 flex-col border-r border-edge">
          <div className="border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Available equipment
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {rackable.map((i) => {
              const avail = availableOf(i);
              return (
                <div
                  key={i.id}
                  draggable={avail > 0}
                  onDragStart={() => setDragItem(i)}
                  onDragEnd={() => { setDragItem(null); setHoverU(null); }}
                  onClick={() => avail > 0 && setArmed((a) => (a?.id === i.id ? null : i))}
                  title={avail > 0 ? "Drag onto a U slot, or click to select then click a free U" : "Out of stock"}
                  className={`mb-1.5 flex items-center gap-2 rounded-md border p-2 ${
                    avail > 0
                      ? `cursor-grab bg-panelalt/60 active:cursor-grabbing ${armed?.id === i.id ? "border-info ring-1 ring-info/40" : "border-edge hover:border-info/50"}`
                      : "border-edge/50 opacity-40"
                  }`}
                >
                  <span className="text-gray-400">{deviceIcon(i.deviceKind!, { size: 16 })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-gray-100">{i.name}</span>
                    <span className="block text-[9px] text-gray-500">{i.uSize}U · {i.model}</span>
                  </span>
                  <span className={`font-mono text-[11px] ${avail === 0 ? "text-danger" : "text-emerald-300"}`}>{avail}</span>
                </div>
              );
            })}
            <p className="mt-2 px-1 text-[10px] leading-relaxed text-gray-600">
              {armed
                ? `${armed.name} selected — click a free U slot to mount it.`
                : "Drag a unit onto a free U slot, or click it then click a slot. Mounting consumes one unit from AssetManager stock."}
            </p>
          </div>
        </div>

        {/* Middle: the rack */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500">
              <span>Rack A</span><span>{rack.devices.length}/{rack.sizeU}U used</span>
            </div>
            <div className="relative rounded-md border-2 border-[#2a3340] bg-[#0b1017] p-1.5">
              <div className="relative" style={{ height: rack.sizeU * ROW_H }}>
                {/* U slots */}
                {units.map((u) => {
                  const occupied = rack.devices.some((d) => u >= d.uStart && u < d.uStart + d.uSize);
                  const isHover = hoverU !== null && u >= hoverU && u < hoverU + dragSize;
                  const legal = hoverU !== null && canMount(rack, hoverU, dragSize);
                  return (
                    <div
                      key={u}
                      data-uslot={u}
                      onDragOver={(e) => { e.preventDefault(); setHoverU(u); }}
                      onDrop={(e) => { e.preventDefault(); placeAt(u, dragItem); }}
                      onMouseEnter={() => armed && setHoverU(u)}
                      onClick={() => armed && placeAt(u, armed)}
                      className={`absolute left-0 right-0 flex items-center border-b border-dashed border-white/5 ${
                        isHover ? (legal ? "bg-info/20" : "bg-danger/20") : ""
                      } ${armed && !occupied ? "cursor-pointer" : ""}`}
                      style={{ top: (u - 1) * ROW_H, height: ROW_H }}
                    >
                      <span className="w-7 shrink-0 pl-1 font-mono text-[9px] text-gray-600">U{u}</span>
                      {!occupied && (
                        <span className="text-[9px] text-gray-700">{armed ? `place ${armed.name} here` : "— empty —"}</span>
                      )}
                    </div>
                  );
                })}

                {/* Mounted devices */}
                {rack.devices.map((d) => {
                  const powered = isPowered(rack, d.id);
                  const link = uplinkOf(rack, d.id);
                  const isSel = d.id === selectedId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      onDoubleClick={() => openLogical(d)}
                      title={`${d.name} — double-click to configure`}
                      className={`absolute left-8 right-1 flex items-center gap-2 rounded border px-2 text-left transition ${
                        isSel ? "border-info bg-info/20" : "border-[#3a4757] bg-[#18212c] hover:border-info/50"
                      }`}
                      style={{ top: (d.uStart - 1) * ROW_H + 2, height: d.uSize * ROW_H - 4 }}
                    >
                      <span className={powered ? "text-emerald-400" : "text-gray-600"}>{deviceIcon(d.kind, { size: 14 })}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-100">{d.name}</span>
                      {link && <span className="font-mono text-[9px] text-info">{link.port}</span>}
                      <span
                        title={powered ? "Powered" : "No power"}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${powered ? "bg-emerald-400" : "bg-danger"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selection toolbar */}
            {selected && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-edge bg-panelalt/60 p-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-gray-200">
                  {deviceIcon(selected.kind, { size: 13 })} {selected.name}
                </span>
                <span className={isPowered(rack, selected.id) ? "text-emerald-300" : "text-danger"}>
                  {isPowered(rack, selected.id) ? "powered" : "no power"}
                </span>
                {(selected.kind === "switch" || selected.kind === "router") && (
                  <ToolBtn onClick={() => setModal("cli")} icon={<IconTerminal size={12} />}>Console (CLI)</ToolBtn>
                )}
                {selected.kind === "server" && (
                  <ToolBtn onClick={() => setModal("server")} icon={<IconSliders size={12} />}>Configure</ToolBtn>
                )}
                <ToolBtn onClick={() => { remove(selected.id); setSelectedId(null); }} icon={<IconTrash size={12} />} danger>Unrack</ToolBtn>
              </div>
            )}
          </div>
        </div>

        {/* Right: cabling / ping */}
        <div className="flex w-72 shrink-0 flex-col border-l border-edge">
          <div className="flex shrink-0 border-b border-edge">
            <PanelTab active={panel === "cabling"} onClick={() => setPanel("cabling")} icon={<IconLink size={12} />}>Cabling</PanelTab>
            <PanelTab active={panel === "ping"} onClick={() => setPanel("ping")} icon={<IconPower size={12} />}>Test</PanelTab>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === "cabling" ? <CablingPanel /> : <PingTool />}
          </div>
        </div>
      </div>

      {/* Logical-layer modals */}
      {modal === "cli" && selected && (selected.kind === "switch" || selected.kind === "router") && (
        <ModalShell title={`${selected.name} — console`} onClose={() => setModal(null)}>
          <SwitchCli deviceId={selected.id} />
        </ModalShell>
      )}
      {modal === "server" && selected && selected.kind === "server" && (
        <ModalShell title={`${selected.name} — system configuration`} onClose={() => setModal(null)}>
          <ServerConfigModal deviceId={selected.id} />
        </ModalShell>
      )}
    </div>
  );
}

// ── atoms ───────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className="flex max-h-full w-[560px] flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-panelalt px-3 py-2 text-xs">
          <span className="font-semibold text-gray-100">{title}</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white"><IconX size={12} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function ToolBtn({ onClick, icon, danger, children }: { onClick: () => void; icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 rounded border px-2 py-0.5 ${danger ? "border-danger/40 text-danger hover:bg-danger/10" : "border-edge text-gray-200 hover:bg-panel"}`}>
      {icon} {children}
    </button>
  );
}

function PanelTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] ${active ? "border-b-2 border-info text-gray-100" : "text-gray-400 hover:text-gray-200"}`}>
      {icon} {children}
    </button>
  );
}
