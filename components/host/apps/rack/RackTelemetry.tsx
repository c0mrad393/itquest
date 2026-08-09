"use client";

/**
 * RackTelemetry — live power & thermal readout for the Rack Lab (v0.3.1)
 * ======================================================================
 * Everything here is DERIVED. `rackPower` and `rackThermal` are the same pure
 * functions the ticket win-conditions call, so what the operator reads in this
 * bar is exactly what the reconciler grades — there is no second, prettier
 * number computed for the UI.
 *
 * Three readouts, in the order an operator actually triages them:
 *   1. Breaker state — if it is open nothing else matters.
 *   2. Power draw against the PDU ceiling.
 *   3. Rack temperature against the 30C / 45C thresholds.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useInfraStore } from "@/lib/infra/store";
import { useSelectedRack } from "./rack-context";
import {
  connectedLoadWatts,
  pduSpec,
  PDU_SPECS,
  rackPower,
  rackThermal,
  THERMAL_CRITICAL_C,
  THERMAL_LABEL,
  THERMAL_WARNING_C,
  type ThermalState,
} from "@/lib/core";
import { availableOf } from "@/lib/core";
import { IconAlert, IconBolt, IconThermometer } from "@/components/ui/icons";

/** Shared palette so the bar, the gauge and the heatmap agree on "hot". */
export const THERMAL_TONE: Record<ThermalState, { text: string; bg: string; ring: string }> = {
  optimal: { text: "text-emerald-300", bg: "bg-emerald-400", ring: "border-emerald-400/40" },
  warning: { text: "text-amber-300", bg: "bg-amber-400", ring: "border-amber-400/40" },
  critical: { text: "text-danger", bg: "bg-danger", ring: "border-danger/50" },
};

/** Load colour follows the same three-step scale as heat. */
function loadState(pct: number): ThermalState {
  if (pct >= 100) return "critical";
  if (pct >= 80) return "warning";
  return "optimal";
}

export default function RackTelemetry() {
  const { rackId, rack } = useSelectedRack();
  const items = useInfraStore((s) => s.infra.inventory.items);
  // Live draw includes what the bound nodes are actually running.
  const nodes = useInfraStore((s) => s.infra.nodes);
  const resetBreaker = useInfraStore((s) => s.rackResetBreaker);
  const setPdu = useInfraStore((s) => s.rackSetPdu);

  const power = rackPower(rack, nodes);
  const thermal = rackThermal(rack, nodes);
  const cabled = connectedLoadWatts(rack, nodes);
  const ceiling = pduSpec(rack.pduId).maxWatts;
  const overBy = cabled - ceiling;

  const loadTone = THERMAL_TONE[loadState(power.loadPct)];
  const heatTone = THERMAL_TONE[thermal.state];

  // Gauge geometry: 21C sits at the left, THERMAL_CRITICAL_C + 8 at the right.
  const gaugeMin = 18;
  const gaugeMax = THERMAL_CRITICAL_C + 8;
  const pctOf = (c: number) => Math.max(0, Math.min(100, ((c - gaugeMin) / (gaugeMax - gaugeMin)) * 100));

  return (
    <div className="shrink-0 border-b border-edge bg-panelalt/60 px-4 py-2">
      {rack.breakerTripped && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-danger/50 bg-danger/10 px-2.5 py-1.5 text-[11px]">
          <IconAlert size={13} className="shrink-0 text-danger" />
          <span className="font-semibold text-danger">PDU breaker open</span>
          <span className="text-gray-300">
            Rack de-energised.{" "}
            {overBy > 0
              ? `Shed ${overBy.toLocaleString()}W of cabled load before it will re-close.`
              : "Load is back inside the envelope."}
          </span>
          <button
            onClick={() => resetBreaker(rackId)}
            disabled={overBy > 0}
            className={`ml-auto rounded border px-2 py-0.5 font-semibold ${
              overBy > 0
                ? "cursor-not-allowed border-edge text-gray-600"
                : "border-emerald-400/50 text-emerald-300 hover:bg-emerald-400/10"
            }`}
          >
            Reset breaker
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* ── Power draw ─────────────────────────────────────────────── */}
        <div className="min-w-[15rem] flex-1">
          <div className="mb-1 flex items-baseline gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
            <IconBolt size={11} className={loadTone.text} />
            <span>Power draw</span>
            <span className={`ml-auto font-mono text-[11px] normal-case tracking-normal ${loadTone.text}`}>
              {power.drawWatts.toLocaleString()}W / {ceiling.toLocaleString()}W ({power.loadPct}%)
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-black/50">
            {/* 80% marker — the point where a rack stops having headroom. */}
            <span className="absolute inset-y-0 z-10 w-px bg-white/25" style={{ left: "80%" }} />
            <div
              className={`h-full rounded-full transition-all ${loadTone.bg}`}
              style={{ width: `${Math.min(100, power.loadPct)}%` }}
            />
          </div>
        </div>

        {/* ── Temperature ────────────────────────────────────────────── */}
        <div className="min-w-[15rem] flex-1">
          <div className="mb-1 flex items-baseline gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
            <IconThermometer size={11} className={heatTone.text} />
            <span>Ambient</span>
            <span className={`ml-auto font-mono text-[11px] normal-case tracking-normal ${heatTone.text}`}>
              {thermal.tempC.toFixed(1)}&deg;C [{THERMAL_LABEL[thermal.state]}]
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-black/50">
            <span className="absolute inset-y-0 z-10 w-px bg-amber-400/60" style={{ left: `${pctOf(THERMAL_WARNING_C)}%` }} />
            <span className="absolute inset-y-0 z-10 w-px bg-danger/70" style={{ left: `${pctOf(THERMAL_CRITICAL_C)}%` }} />
            <div
              className={`h-full rounded-full transition-all ${heatTone.bg}`}
              style={{ width: `${pctOf(thermal.tempC)}%` }}
            />
          </div>
          <div className="mt-0.5 text-[9px] text-gray-600">
            +{thermal.riseC.toFixed(1)}&deg;C dissipated &minus; {thermal.coolingC}&deg;C cooling
          </div>
        </div>

        {/* ── Feed selector ──────────────────────────────────────────── */}
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
          <span>Feed</span>
          <select
            value={rack.pduId}
            onChange={(e) => setPdu(rackId, e.target.value)}
            className="rounded border border-edge bg-panel px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-gray-200"
          >
            {PDU_SPECS.map((p) => {
              const sku = items.find((i) => i.id === (p.id === "pdu-30a" ? "sku-pdu-30a" : "sku-pdu-1u"));
              const stock = sku ? availableOf(sku) : 0;
              const fitted = rack.pduId === p.id;
              return (
                <option key={p.id} value={p.id} disabled={!fitted && stock < 1}>
                  {p.label} — {p.maxWatts.toLocaleString()}W
                  {fitted ? " (fitted)" : stock < 1 ? " (none in stock)" : ` (${stock} spare)`}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {thermal.state !== "optimal" && !rack.breakerTripped && (
        <p className={`mt-1.5 text-[10px] ${heatTone.text}`}>
          {thermal.state === "critical"
            ? "Thermal shutdown — every device in the rack is offline and hardware is being damaged. Fit cooling or shed load now."
            : "Thermal warning — devices are throttling and SLA scores will suffer. Fit a fan tray or CRAC."}
        </p>
      )}
    </div>
  );
}
