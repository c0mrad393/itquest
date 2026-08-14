"use client";

/**
 * Monitor — infrastructure observability (Level-0 host app).
 * ==========================================================
 * An estate dashboard in the shape operators expect from Grafana/Datadog: a
 * KPI strip across the top, then one card per monitored node carrying CPU,
 * memory and network sparklines plus an anomaly line.
 *
 * The charts are drawn from lib/monitor/store.ts, which DERIVES its samples
 * from InfrastructureState — so a ticket that takes a host down flatlines its
 * card, a runaway process pins its CPU trace, and a saturated link lifts its
 * network trace, with no separate simulation to keep in sync. The dashboard is
 * a genuine diagnostic surface, not decoration.
 *
 * All chart geometry is inline SVG. No charting dependency, no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useMonitorStore, telemetryFor, type NodeTelemetry, type Sample } from "@/lib/monitor/store";
import { AppIcon } from "@/components/ui/app-icons";
import type { HostAppIconId } from "@/lib/core";
import { AppHeader, CountPill, Segmented } from "./AppChrome";
import { useHostStore } from "@/lib/host/store";
import { hasLicense } from "@/lib/economy/licenses";

type Metric = "cpu" | "mem" | "net";

const METRIC_META: Record<Metric, { label: string; stroke: string; fill: string }> = {
  cpu: { label: "CPU", stroke: "#60a5fa", fill: "rgba(96,165,250,0.16)" },
  mem: { label: "Memory", stroke: "#a78bfa", fill: "rgba(167,139,250,0.16)" },
  net: { label: "Network", stroke: "#34d399", fill: "rgba(52,211,153,0.16)" },
};

const ROLE_ICON: Record<string, HostAppIconId> = {
  "web-server": "globe",
  "app-server": "server",
  database: "disk",
  "load-balancer": "switch",
  "domain-controller": "users",
  "file-server": "folder",
  workstation: "monitor",
  firewall: "shield",
  router: "router",
  hypervisor: "boxes",
};

const STATUS_STYLE: Record<string, { dot: string; text: string; ring: string }> = {
  healthy: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "border-edge" },
  degraded: { dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-500/40" },
  critical: { dot: "bg-red-500", text: "text-red-300", ring: "border-red-500/50" },
  offline: { dot: "bg-gray-500", text: "text-gray-400", ring: "border-edge" },
};

export default function Monitor() {
  const infra = useInfraStore((s) => s.infra);
  const series = useMonitorStore((s) => s.series);
  const [metric, setMetric] = useState<Metric>("cpu");
  const [selected, setSelected] = useState<string | null>(null);
  // Advanced Diagnostics (Procurement → Licences) unlocks correlation: the
  // ranked anomaly list and the per-host drill-down. Without it you still get
  // the cards, you just have to read them yourself.
  const licenses = useHostStore((s) => s.host.licenses);
  const openApp = useHostStore((s) => s.openApp);
  const pro = hasLicense(licenses, "diagnostics-pro");

  const nodes = useMemo(() => telemetryFor(infra, series), [infra, series]);

  const online = nodes.filter((n) => n.online).length;
  const alerting = nodes.filter((n) => n.anomaly);
  const avg = (key: Metric) => {
    const live = nodes.filter((n) => n.online && n.samples.length);
    if (!live.length) return 0;
    return Math.round(live.reduce((t, n) => t + last(n.samples)[key], 0) / live.length);
  };
  const peakNet = nodes.reduce((m, n) => (n.samples.length ? Math.max(m, last(n.samples).net) : m), 0);

  const focused = pro ? (nodes.find((n) => n.nodeId === selected) ?? null) : null;

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="activity" title="Monitor" subtitle={`${infra.org.name} · infrastructure telemetry`}>
        {alerting.length > 0 && <CountPill value={alerting.length} label="alerting" tone="warn" />}
        <CountPill value={`${online}/${nodes.length}`} label="up" tone="muted" />
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: "cpu" as const, label: "CPU" },
            { value: "mem" as const, label: "MEM" },
            { value: "net" as const, label: "NET" },
          ]}
        />
      </AppHeader>

      <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {/* Estate KPIs */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi label="Hosts reporting" value={`${online}`} sub={`of ${nodes.length} monitored`} tone={online === nodes.length ? "ok" : "warn"} />
          <Kpi label="Avg CPU" value={`${avg("cpu")}%`} sub="across live hosts" tone={avg("cpu") > 80 ? "bad" : avg("cpu") > 60 ? "warn" : "ok"} />
          <Kpi label="Avg memory" value={`${avg("mem")}%`} sub="across live hosts" tone={avg("mem") > 88 ? "bad" : avg("mem") > 70 ? "warn" : "ok"} />
          <Kpi label="Peak link" value={`${peakNet}%`} sub="busiest segment" tone={peakNet > 88 ? "bad" : peakNet > 70 ? "warn" : "ok"} />
        </div>

        {/* Active anomalies — the triage list */}
        {pro && alerting.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.05]">
            <div className="flex items-center gap-2 border-b border-amber-500/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
              <AppIcon id="alert" size={12} />
              Active anomalies
            </div>
            {alerting.map((n) => (
              <button
                key={n.nodeId}
                onClick={() => setSelected(n.nodeId)}
                className="flex w-full items-center gap-2.5 border-b border-amber-500/10 px-3 py-1.5 text-left last:border-0 hover:bg-amber-500/[0.06]"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLE[n.status]?.dot ?? "bg-gray-500"}`} />
                <span className="font-mono text-[11px] text-gray-200">{n.hostname}</span>
                <span className="truncate text-[11px] text-amber-200/80">{n.anomaly}</span>
              </button>
            ))}
          </div>
        )}

        {/* Focused node — full-height traces for all three metrics */}
        {focused && (
          <div className="mb-4 rounded-xl border border-info/30 bg-panelalt/60 p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <AppIcon id={ROLE_ICON[focused.role] ?? "server"} size={15} />
              <span className="font-mono text-[13px] font-semibold text-gray-100">{focused.hostname}</span>
              <span className="text-[11px] text-gray-500">{focused.role}</span>
              <button
                onClick={() => setSelected(null)}
                className="ml-auto rounded border border-edge px-2 py-0.5 text-[10px] text-gray-400 hover:bg-edge"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["cpu", "mem", "net"] as Metric[]).map((m) => (
                <div key={m}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      {METRIC_META[m].label}
                    </span>
                    <span className="font-mono text-[13px] font-semibold text-gray-100">
                      {focused.samples.length ? last(focused.samples)[m] : 0}%
                    </span>
                  </div>
                  <Chart samples={focused.samples} metric={m} height={54} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!pro && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-edge bg-panelalt/40 px-3.5 py-2.5">
            <span className="text-gray-600">
              <AppIcon id="lock" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-gray-300">
                Anomaly correlation and per-host drill-down are locked
              </div>
              <div className="text-[10px] text-gray-600">
                Advanced Diagnostics licence required — available in Procurement.
              </div>
            </div>
            <button
              onClick={() => openApp("procurement")}
              className="shrink-0 rounded-md border border-info/40 px-2.5 py-1 text-[10px] font-semibold text-info hover:bg-info/10"
            >
              View licence
            </button>
          </div>
        )}

        {/* Node grid */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {nodes.map((n) => (
            <NodeCard
              key={n.nodeId}
              node={n}
              metric={metric}
              active={selected === n.nodeId}
              onClick={() => pro && setSelected(selected === n.nodeId ? null : n.nodeId)}
            />
          ))}
        </div>

        {nodes.length === 0 && (
          <div className="py-10 text-center text-[11px] text-gray-600">
            No monitored hosts in this environment.
          </div>
        )}
      </div>
    </div>
  );
}

function last(samples: Sample[]): Sample {
  return samples[samples.length - 1] ?? { t: 0, cpu: 0, mem: 0, net: 0 };
}

function NodeCard({
  node,
  metric,
  active,
  onClick,
}: {
  node: NodeTelemetry;
  metric: Metric;
  active: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLE[node.online ? node.status : "offline"] ?? STATUS_STYLE.offline;
  const current = node.samples.length ? last(node.samples)[metric] : 0;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border bg-panelalt/50 p-3 text-left transition hover:bg-panelalt ${
        active ? "border-info/60 ring-1 ring-info/30" : style.ring
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot} ${node.anomaly ? "animate-pulse" : ""}`} />
        <AppIcon id={ROLE_ICON[node.role] ?? "server"} size={13} />
        <span className="truncate font-mono text-[11.5px] text-gray-100">{node.hostname}</span>
        <span className="ml-auto font-mono text-[13px] font-semibold text-gray-100">
          {node.online ? `${current}%` : "—"}
        </span>
      </div>

      <Chart samples={node.samples} metric={metric} height={34} muted={!node.online} />

      <div className="flex items-center gap-2 text-[10px]">
        <span className={style.text}>{node.online ? node.status : "offline"}</span>
        {node.anomaly && (
          <span className="truncate text-amber-300/80" title={node.anomaly}>
            · {node.anomaly}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Sparkline: filled area + stroke over a fixed 0-100 domain, so cards are
 * comparable at a glance without per-card axis scaling. Drawn in a 100x100
 * viewBox with `preserveAspectRatio="none"` — the path stretches to whatever
 * box the layout gives it, which keeps the grid fully responsive.
 */
function Chart({
  samples,
  metric,
  height,
  muted = false,
}: {
  samples: Sample[];
  metric: Metric;
  height: number;
  muted?: boolean;
}) {
  const meta = METRIC_META[metric];
  const pts = samples.map((s) => s[metric]);

  // Anchor to a full window so a fresh series grows in from the right rather
  // than stretching two points across the whole card.
  const padded = pts.length >= 2 ? pts : [pts[0] ?? 0, pts[0] ?? 0];
  const step = 100 / Math.max(1, padded.length - 1);
  const coords = padded.map((v, i) => `${(i * step).toFixed(2)},${(100 - v).toFixed(2)}`);
  const line = `M${coords.join(" L")}`;
  const area = `${line} L100,100 L0,100 Z`;

  return (
    <div className="relative w-full overflow-hidden rounded-md bg-gray-500/20" style={{ height }}>
      {/* 25/50/75% guides */}
      <div className="absolute inset-0">
        {[25, 50, 75].map((y) => (
          <div key={y} className="absolute inset-x-0 border-t border-white/[0.04]" style={{ top: `${y}%` }} />
        ))}
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path d={area} fill={muted ? "rgba(148,163,184,0.10)" : meta.fill} />
        <path
          d={line}
          fill="none"
          stroke={muted ? "rgba(148,163,184,0.45)" : meta.stroke}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-300" : "text-emerald-300";
  return (
    <div className="rounded-xl border border-edge bg-panelalt/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-semibold leading-none ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-gray-600">{sub}</div>
    </div>
  );
}
