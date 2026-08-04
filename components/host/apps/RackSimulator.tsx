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
import {
  availableOf, canMount, deviceOnline, deviceWatts, isPowered, rackThermal, slotTempC,
  thermalState, uplinkOf, DEVICE_COOLING_C, LIQUID_COOLING_C, THERMAL_CRITICAL_C,
  type AssetItem, type RackDevice, type RackState,
} from "@/lib/core";
import { deviceIcon, IconLink, IconPower, IconServer, IconSliders, IconSnowflake, IconTerminal, IconTrash, IconX } from "@/components/ui/icons";
import SwitchCli from "./rack/SwitchCli";
import ServerConfigModal from "./rack/ServerConfigModal";
import CablingPanel from "./rack/CablingPanel";
import PingTool from "./rack/PingTool";
import RackTelemetry, { THERMAL_TONE } from "./rack/RackTelemetry";

const ROW_H = 26;

/**
 * Heatmap intensity for one U. Deliberately near-invisible at room
 * temperature: the rack should look normal until it is not, so a warm slot
 * reads as a signal rather than decoration.
 */
function heatOpacity(tempC: number): number {
  const t = (tempC - 24) / (THERMAL_CRITICAL_C - 24);
  return Math.max(0, Math.min(0.42, t * 0.42));
}

export default function RackSimulator() {
  const inventory = useInfraStore((s) => s.infra.inventory);
  const rack = useInfraStore((s) => s.infra.rack);
  const mount = useInfraStore((s) => s.rackMountDevice);
  const remove = useInfraStore((s) => s.rackRemoveDevice);
  const setLiquid = useInfraStore((s) => s.rackSetLiquidCooling);
  const liquidStock = useInfraStore((s) =>
    availableOf(s.infra.inventory.items.find((i) => i.id === "sku-liquid-kit") ?? { spare: 0 } as AssetItem),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<AssetItem | null>(null);
  /** Click-to-place: an "armed" unit waiting for the operator to pick a U. */
  const [armed, setArmed] = useState<AssetItem | null>(null);
  const [hoverU, setHoverU] = useState<number | null>(null);
  /** U slot the pointer is over — drives the per-slot power/heat readout. */
  const [statU, setStatU] = useState<number | null>(null);
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

      <RackTelemetry />

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

        {/* Middle: the rack.
            Two bands — the 24U frame scrolls, the readouts under it do NOT.
            A slot stat you have to scroll past 24 rows to read is a stat
            nobody reads, and it has to be visible WHILE the pointer is on the
            slot it describes. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
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
                  // Thermal overlay: heat rises, so the top of the rack reads
                  // hotter than the bottom even at one steady-state ambient.
                  const slotC = slotTempC(rack, u);
                  const slotTone = THERMAL_TONE[thermalState(slotC)];
                  return (
                    <div
                      key={u}
                      data-uslot={u}
                      onDragOver={(e) => { e.preventDefault(); setHoverU(u); }}
                      onDrop={(e) => { e.preventDefault(); placeAt(u, dragItem); }}
                      onMouseEnter={() => { setStatU(u); if (armed) setHoverU(u); }}
                      onMouseLeave={() => setStatU((cur) => (cur === u ? null : cur))}
                      onClick={() => armed && placeAt(u, armed)}
                      title={`U${u} — ${slotC.toFixed(1)}\u00b0C`}
                      className={`absolute left-0 right-0 flex items-center border-b border-dashed border-white/5 ${
                        isHover ? (legal ? "bg-info/20" : "bg-danger/20") : ""
                      } ${armed && !occupied ? "cursor-pointer" : ""}`}
                      style={{ top: (u - 1) * ROW_H, height: ROW_H }}
                    >
                      {/* Heatmap wash — sits behind everything, hidden while
                          the operator is aiming a drop so it never confuses
                          "legal placement" with "hot". */}
                      {!isHover && !rack.breakerTripped && (
                        <span
                          aria-hidden
                          className={`pointer-events-none absolute inset-0 ${slotTone.bg}`}
                          style={{ opacity: heatOpacity(slotC) }}
                        />
                      )}
                      <span className="relative w-7 shrink-0 pl-1 font-mono text-[9px] text-gray-600">U{u}</span>
                      {!occupied && (
                        <span className="relative text-[9px] text-gray-700">{armed ? `place ${armed.name} here` : "— empty —"}</span>
                      )}
                    </div>
                  );
                })}

                {/* Mounted devices */}
                {rack.devices.map((d) => {
                  const powered = isPowered(rack, d.id);
                  // Cabled is not the same as RUNNING: a tripped breaker or a
                  // thermal shutdown takes the whole rack down regardless.
                  const online = deviceOnline(rack, d.id);
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
                      <span className={online ? "text-emerald-400" : powered ? "text-amber-400" : "text-gray-600"}>
                        {deviceIcon(d.kind, { size: 14 })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-100">
                        {d.name}
                        {d.liquidCooled && <IconSnowflake size={9} className="ml-1 inline text-cyan-300" />}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-gray-500">{deviceWatts(d)}W</span>
                      {link && <span className="font-mono text-[9px] text-info">{link.port}</span>}
                      <span
                        title={online ? "Online" : powered ? "Cabled but down (breaker or thermal)" : "No power"}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          online ? "bg-emerald-400" : powered ? "bg-amber-400" : "bg-danger"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>

          {/* Pinned readouts */}
          <div className="mx-auto w-full max-w-md shrink-0 px-4 pb-4">
            {/* Slot-level power & heat — follows the pointer down the rack */}
            <SlotStats rack={rack} u={statU} />

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
                {/* Liquid loops are per-device, so they are fitted here rather
                    than mounted in a U of their own. */}
                {deviceWatts(selected) > 0 && (
                  <ToolBtn
                    onClick={() => setLiquid(selected.id, !selected.liquidCooled)}
                    icon={<IconSnowflake size={12} />}
                    disabled={!selected.liquidCooled && liquidStock < 1}
                  >
                    {selected.liquidCooled
                      ? `Remove liquid loop (+${LIQUID_COOLING_C}\u00b0C)`
                      : `Fit liquid loop (\u2212${LIQUID_COOLING_C}\u00b0C · ${liquidStock} in stock)`}
                  </ToolBtn>
                )}
                {(DEVICE_COOLING_C[selected.kind] ?? 0) > 0 && (
                  <span className="text-cyan-300">
                    {isPowered(rack, selected.id)
                      ? `cooling \u2212${DEVICE_COOLING_C[selected.kind]}\u00b0C`
                      : "not cabled — cooling nothing"}
                  </span>
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

function ToolBtn({ onClick, icon, danger, disabled, children }: { onClick: () => void; icon: React.ReactNode; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1 rounded border px-2 py-0.5 ${
        disabled
          ? "cursor-not-allowed border-edge/50 text-gray-600"
          : danger
            ? "border-danger/40 text-danger hover:bg-danger/10"
            : "border-edge text-gray-200 hover:bg-panel"
      }`}>
      {icon} {children}
    </button>
  );
}

/**
 * Per-slot readout. Shows what the hovered U costs and what it runs at, so the
 * relationship between "this box draws 750W" and "this rack is at 38C" is
 * visible at the point of decision rather than only in the header total.
 */
function SlotStats({ rack, u }: { rack: RackState; u: number | null }) {
  if (u === null) {
    return (
      <p className="mt-2 text-[10px] text-gray-600">
        Hover a U slot for its temperature and load. Heat rises — the top of the rack always runs warmer.
      </p>
    );
  }
  const dev = rack.devices.find((d) => u >= d.uStart && u < d.uStart + d.uSize);
  const slotC = slotTempC(rack, u);
  const tone = THERMAL_TONE[thermalState(slotC)];
  const cooling = dev ? (DEVICE_COOLING_C[dev.kind] ?? 0) + (dev.liquidCooled ? LIQUID_COOLING_C : 0) : 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-edge bg-panelalt/60 px-2.5 py-1.5 font-mono text-[10px]">
      <span className="text-gray-300">U{u}</span>
      <span className={tone.text}>{slotC.toFixed(1)}&deg;C</span>
      {dev ? (
        <>
          <span className="text-gray-300">{dev.name}</span>
          <span className="text-gray-400">{deviceWatts(dev)}W draw</span>
          {cooling > 0 && <span className="text-cyan-300">&minus;{cooling}&deg;C cooling</span>}
          <span className={deviceOnline(rack, dev.id) ? "text-emerald-300" : "text-danger"}>
            {deviceOnline(rack, dev.id)
              ? "online"
              : rack.breakerTripped
                ? "breaker open"
                : rackThermal(rack).state === "critical"
                  ? "thermal shutdown"
                  : "no power"}
          </span>
        </>
      ) : (
        <span className="text-gray-600">empty</span>
      )}
    </div>
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
