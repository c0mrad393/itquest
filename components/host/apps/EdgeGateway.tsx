"use client";

/**
 * pfGate — Edge Gateway Manager (host app)
 * ========================================
 * The perimeter firewall's web GUI, as reached from a browser on the LAN. It
 * replaces the NetOps Console and the Monitor, which were two windows onto the
 * same network and never explained how they related.
 *
 * ── WHY IT LOOKS LIKE A WEB APP INSIDE A WINDOW ─────────────────────────────
 *
 * Because that is what it is. A firewall appliance has no desktop client; you
 * point a browser at its address and get a dense admin page served off the box.
 * Rendering a browser chrome with the gateway's real address in the bar is not
 * decoration — it teaches where this interface lives and why it is reachable
 * from the LAN and not from outside, which is a genuine exam question.
 *
 * ── THIS SURFACE PINS ITS OWN THEME ─────────────────────────────────────────
 *
 * `theme-dark` is stamped on the page body. v1 pinned LIGHT, on the reasoning
 * that appliance GUIs are grey admin pages; v2 moves to dark because that is
 * what the current generation of these consoles ships (and what the brief
 * asks): a dark ground is what makes neon throughput traces read as signal
 * rather than decoration.
 *
 * The pin itself is the load-bearing part, in either direction. A surface that
 * paints its own ground must pin its tokens, or the inverting neutral ramp
 * slides underneath it and produces unreadable text in one of the two host
 * themes.
 *
 * Pinning does NOT mean writing theme-specific colour utilities. The ramp
 * INVERTS: `gray-50` is the ink end and `gray-900` the wash end, so this file
 * writes `text-gray-100` / `text-gray-200` throughout and the pin resolves
 * them. Reaching for `text-gray-800` because it sounds dark produces
 * near-invisible text — the exact fault the pin exists to prevent, arrived at
 * from the other direction. Switching the pin light→dark needed no colour
 * edits anywhere in this file, which is the proof the convention holds.
 *
 * ── WHAT CAME FROM THE RETIRED APPS ─────────────────────────────────────────
 *
 * Nothing was dropped. The Monitor's telemetry is the Dashboard's system and
 * traffic widgets; the NetOps Console's link optimisation is Interfaces →
 * Uplinks, still driving `rerouteLink` / `setLinkFirewall` / `setLinkBlocked`,
 * because live tickets grade those actions and deleting the only UI for them
 * would have broken the queue.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useEffect, useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useNow } from "@/lib/sla/store";
import type { DhcpReservation, FirewallRule, L7App, NatRule, ThreatEvent } from "@/lib/vm/types";
import {
  CHAIN_FOR,
  EDGE_GATEWAY_ID,
  deriveLeases,
  evaluate,
  lanCidrFor,
  natTargetProblem,
  resolveInbound,
  threatSummary,
  type EdgeIface,
} from "@/lib/network/edge";
import { AppIcon } from "@/components/ui/app-icons";

type MenuId = "dashboard" | "interfaces" | "firewall" | "services" | "security" | "status" | "diagnostics";
type PageId =
  | "dashboard"
  | "if-assign"
  | "if-uplinks"
  | "fw-rules"
  | "fw-nat"
  | "svc-dhcp"
  | "sec-ids"
  | "sec-threats"
  | "st-interfaces"
  | "st-logs"
  | "diag-ping"
  | "diag-states";

interface MenuDef {
  id: MenuId;
  label: string;
  items: { id: PageId; label: string }[];
}

const MENUS: MenuDef[] = [
  { id: "dashboard", label: "System", items: [{ id: "dashboard", label: "Dashboard" }] },
  {
    id: "interfaces",
    label: "Interfaces",
    items: [
      { id: "if-assign", label: "Assignments" },
      { id: "if-uplinks", label: "Uplinks & Links" },
    ],
  },
  {
    id: "firewall",
    label: "Firewall",
    items: [
      { id: "fw-rules", label: "Rules" },
      { id: "fw-nat", label: "NAT / Port Forward" },
    ],
  },
  { id: "services", label: "Services", items: [{ id: "svc-dhcp", label: "DHCP Server" }] },
  {
    id: "security",
    label: "Security",
    items: [
      { id: "sec-ids", label: "IDS / IPS" },
      { id: "sec-threats", label: "Threat Intelligence" },
    ],
  },
  {
    id: "status",
    label: "Status",
    items: [
      { id: "st-interfaces", label: "Interfaces" },
      { id: "st-logs", label: "System Logs" },
    ],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    items: [
      { id: "diag-ping", label: "Ping / Reachability" },
      { id: "diag-states", label: "Firewall States" },
    ],
  },
];

export default function EdgeGateway() {
  useNow(); // 1s tick — the appliance's graphs and log tail are live
  const ensure = useInfraStore((s) => s.ensureEdgeGateway);
  const infra = useInfraStore((s) => s.infra);
  const [page, setPage] = useState<PageId>("dashboard");
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);

  // Mint the appliance on first open. Saved estates predate it, so this is
  // also the migration — see `ensureEdgeGateway`.
  useEffect(() => {
    ensure();
  }, [ensure]);

  const gw = infra.nodes[EDGE_GATEWAY_ID];
  if (!gw) {
    return (
      <div className="flex h-full items-center justify-center bg-panel text-[11px] text-gray-500">
        Bringing up the edge gateway…
      </div>
    );
  }

  const lanIp = gw.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* ── Browser chrome ─────────────────────────────────────────────────
          The address bar is the point: this GUI is served BY the appliance. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-danger/70" />
          <span className="h-2 w-2 rounded-full bg-warn/70" />
          <span className="h-2 w-2 rounded-full bg-ok/70" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-edge bg-panel px-2 py-1">
          <span className="text-ok-text">
            <AppIcon id="lock" size={10} />
          </span>
          <span className="truncate font-mono text-[10px] text-gray-400">
            https://{lanIp}/{page === "dashboard" ? "" : page.replace("-", "/")}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-gray-500">pfGate</span>
      </div>

      {/* ── The appliance page itself ──────────────────────────────────────
          `theme-dark` pinned — see the header note. Pinning stops the host's
          inverting ramp from sliding underneath the tokens below. */}
      <div className="theme-dark flex min-h-0 flex-1 flex-col bg-surface text-gray-100">
        <TopNav
          page={page}
          openMenu={openMenu}
          onOpen={setOpenMenu}
          onNavigate={(p) => {
            setPage(p);
            setOpenMenu(null);
          }}
          hostname={gw.hostname}
        />

        <div className="min-h-0 flex-1 overflow-y-auto term-scroll" onClick={() => setOpenMenu(null)}>
          {page === "dashboard" && <DashboardPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "if-assign" && <AssignmentsPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "if-uplinks" && <UplinksPage />}
          {page === "fw-rules" && <FirewallRulesPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "fw-nat" && <NatPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "svc-dhcp" && <DhcpPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "sec-ids" && <IdsPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "sec-threats" && <ThreatPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "st-interfaces" && <StatusInterfacesPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "st-logs" && <FirewallLogPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "diag-ping" && <DiagPingPage nodeId={EDGE_GATEWAY_ID} />}
          {page === "diag-states" && <DiagStatesPage nodeId={EDGE_GATEWAY_ID} />}
        </div>
      </div>
    </div>
  );
}

// ── Chrome ──────────────────────────────────────────────────────────────────

function TopNav({
  page,
  openMenu,
  onOpen,
  onNavigate,
  hostname,
}: {
  page: PageId;
  openMenu: MenuId | null;
  onOpen: (m: MenuId | null) => void;
  onNavigate: (p: PageId) => void;
  hostname: string;
}) {
  return (
    /*
     * Literal colours, not ramp tokens. This bar paints its own navy ground, so
     * `text-slate-*` would be read through the INVERTING neutral ramp and come
     * out as dark ink on dark navy under the light pin. An unthemed ground
     * needs unthemed ink.
     */
    <div className="relative z-20 shrink-0 border-b-2 border-[#1c3f6e] bg-[#20456f] text-white">
      <div className="flex items-center gap-1 px-2">
        <span className="mr-2 py-2 text-[12px] font-bold tracking-tight">pfGate</span>
        {MENUS.map((m) => {
          const active = m.items.some((i) => i.id === page);
          return (
            <div key={m.id} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(openMenu === m.id ? null : m.id);
                }}
                className={`px-3 py-2 text-[11px] transition-colors ${
                  openMenu === m.id || active ? "bg-[#2f5c8f] text-white" : "text-white/75 hover:bg-[#2a5183] hover:text-white"
                }`}
              >
                {m.label}
              </button>
              {openMenu === m.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full z-30 min-w-[13rem] border border-[#1c3f6e] bg-[#22496f] py-1 shadow-xl"
                >
                  {m.items.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => onNavigate(i.id)}
                      className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                        page === i.id ? "bg-[#3568a0] text-white" : "text-white/80 hover:bg-[#2f5c8f] hover:text-white"
                      }`}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <span className="ml-auto py-2 font-mono text-[10px] text-white/70">{hostname}</span>
      </div>
    </div>
  );
}

function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <h2 className="text-[15px] font-semibold text-gray-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The appliance's panel: a titled box with a grey header, as these GUIs use. */
function Widget({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded border border-edge bg-panel">
      <header className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-[3px] text-[11px]">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-gray-100">{value}</span>
    </div>
  );
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const tone = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warn" : "bg-info";
  return (
    <div className="py-1">
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>{label}</span>
        <span className="font-mono">{Math.round(pct)}%</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-sm bg-gray-500/20">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

function btn(kind: "primary" | "ghost" | "danger" = "ghost") {
  const base = "rounded border px-2 py-1 text-[10px] transition-colors disabled:opacity-40";
  if (kind === "primary") return `${base} border-info bg-info text-info-on hover:opacity-90`;
  if (kind === "danger") return `${base} border-danger/50 text-danger-text hover:bg-danger/10`;
  return `${base} border-edge text-gray-200 hover:bg-gray-500/10`;
}

// ── A. Dashboard ────────────────────────────────────────────────────────────

function DashboardPage({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const gw = infra.nodes[nodeId];
  if (!gw) return null;

  const up = gw.health.uptimeSeconds;
  const uptime = `${Math.floor(up / 86_400)}d ${Math.floor((up % 86_400) / 3600)}h`;

  /*
   * Throughput is DERIVED from the estate's links, not invented. The traffic
   * engine already tracks utilisation per link; the WAN figure is the uplink's
   * share of the backbone. A random walk would look livelier and mean nothing.
   */
  const wanLink = infra.links.find((l) => l.from === "internet" || l.to === "internet");
  const wanPct = wanLink?.utilizationPct ?? 0;
  const lanPct = infra.links.length
    ? infra.links.reduce((a, l) => a + l.utilizationPct, 0) / infra.links.length
    : 0;

  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(21rem, 1fr))" }}>
      <Widget title="System Information">
        <Field label="Name" value={<span className="font-mono">{gw.hostname}</span>} />
        <Field label="Version" value="pfGate 2.7.2 (amd64)" />
        <Field label="Uptime" value={uptime} />
        <Field label="Load average" value={<span className="font-mono">{(gw.health.cpuLoad / 25).toFixed(2)}</span>} />
        <div className="mt-2 border-t border-edge pt-2">
          <Meter label="CPU usage" pct={gw.health.cpuLoad} />
          <Meter label="Memory usage" pct={gw.health.memUsedPct} />
          <Meter label="Disk usage" pct={gw.health.diskUsedPct} />
        </div>
      </Widget>

      <Widget title="Interfaces">
        <table className="w-full text-left text-[11px]">
          <tbody className="divide-y divide-edge">
            {gw.network.interfaces.map((i) => (
              <tr key={i.name}>
                <td className="py-1.5 pr-2 font-mono font-semibold uppercase text-gray-200">
                  {i.name === "wan0" ? "WAN" : "LAN"}
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${
                      i.up ? "text-ok-text" : "text-danger-text"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${i.up ? "bg-ok" : "bg-danger"}`} />
                    {i.up ? "up" : "down"}
                  </span>
                </td>
                <td className="py-1.5 font-mono text-gray-200">{i.up ? i.ipv4 || "—" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>

      <Widget title="Traffic Graphs">
        <TrafficGraph label="WAN" pct={wanPct} />
        <TrafficGraph label="LAN" pct={lanPct} />
        <p className="mt-2 text-[10px] text-gray-500">
          Derived from live link utilisation across {infra.links.length} monitored links.
        </p>
      </Widget>

      <Widget title="Firewall Summary">
        <FirewallSummary nodeId={nodeId} />
      </Widget>

      <ConnectionsWidget nodeId={nodeId} />

      <ThreatWidget nodeId={nodeId} />
    </div>
  );
}

/**
 * A rolling Tx/Rx trace.
 *
 * The engine keeps no time series, so this component keeps its own: each tick
 * pushes the live utilisation onto a ring buffer and drops the oldest sample.
 * That makes the motion HONEST — the line moves because a real number changed,
 * not because a random walk is animating. Tx and Rx are split because a link
 * saturated in one direction is a different fault from one saturated in both,
 * and a single blended line hides which.
 *
 * The window is short (40 samples at 1s) on purpose: this is a "what is
 * happening now" instrument, and a long window would smooth away the spike an
 * operator opened the page to see.
 */
function TrafficGraph({ label, pct }: { label: string; pct: number }) {
  const [series, setSeries] = useState<{ tx: number[]; rx: number[] }>(() => ({
    tx: Array(40).fill(pct),
    rx: Array(40).fill(pct * 0.6),
  }));

  useEffect(() => {
    setSeries((prev) => ({
      // Outbound tracks the measured figure; inbound is the lighter return
      // path, which is what an office edge link actually looks like.
      tx: [...prev.tx.slice(1), pct],
      rx: [...prev.rx.slice(1), Math.max(0, pct * 0.55 + (pct > 60 ? 8 : 2))],
    }));
  }, [pct]);

  const path = (pts: number[]) =>
    pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${40 - (p / 100) * 40}`).join(" ");

  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <span className="flex gap-3 font-mono text-[10px]">
          <span className="text-[#22d3ee]">Tx {pct.toFixed(1)}%</span>
          <span className="text-[#a78bfa]">Rx {series.rx[series.rx.length - 1].toFixed(1)}%</span>
        </span>
      </div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-1 h-14 w-full rounded-sm border border-edge bg-[#080d15]"
      >
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.3" className="text-gray-500/25" />
        ))}
        <polyline points={`0,40 ${path(series.tx)} 100,40`} fill="rgba(34,211,238,0.16)" />
        <polyline
          points={path(series.tx)}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={path(series.rx)}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/**
 * The state table.
 *
 * Sessions are derived from the estate that exists: every LAN host with an
 * address contributes a plausible outbound flow, and any published port
 * forward contributes an inbound one. Nothing is stored — a connection table
 * is the most ephemeral thing on a firewall, and persisting one would mean
 * reconciling it with hosts that have since been re-addressed or powered off.
 */
interface ConnRow {
  key: string;
  proto: string;
  src: string;
  dst: string;
  state: string;
  /** Outbound flows come from LAN hosts; inbound ones arrive via a port forward. */
  dir: "in" | "out";
}

function ConnectionsWidget({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const now = useNow();
  const gw = infra.nodes[nodeId];

  const rows = useMemo<ConnRow[]>(() => {
    if (!gw) return [];
    const lanIp = gw.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
    const cidr = lanCidrFor(lanIp);
    const hosts = Object.values(infra.nodes)
      .filter((n) => n.network?.interfaces?.some((i) => i.ipv4 && i.ipv4 !== lanIp && cidrContainsLocal(cidr, i.ipv4)))
      .slice(0, 6);

    const DESTS = [
      { ip: "93.184.216.34", port: 443, proto: "tcp" },
      { ip: "1.1.1.1", port: 53, proto: "udp" },
      { ip: "151.101.1.69", port: 443, proto: "tcp" },
      { ip: "20.190.160.14", port: 443, proto: "tcp" },
    ];
    const STATES = ["ESTABLISHED", "TIME_WAIT", "SYN_SENT"];
    const t = Math.floor(now / 4000);

    const out: ConnRow[] = hosts.map((h, i) => {
      const ip = h.network.interfaces.find((x) => x.ipv4)?.ipv4 ?? "";
      const d = DESTS[(i + t) % DESTS.length];
      return {
        key: `${ip}-${i}`,
        proto: d.proto,
        src: `${ip}:${49000 + ((i * 7 + t) % 900)}`,
        dst: `${d.ip}:${d.port}`,
        state: d.proto === "udp" ? "—" : STATES[(i + t) % STATES.length],
        dir: "out",
      };
    });

    for (const n of gw.network.nat ?? []) {
      if (!n.enabled) continue;
      out.push({
        key: `nat-${n.id}`,
        proto: n.protocol,
        src: `198.51.100.${20 + (t % 40)}:${40000 + (t % 500)}`,
        dst: `${n.internalIp}:${n.internalPort}`,
        state: "ESTABLISHED",
        dir: "in",
      });
    }
    return out;
  }, [gw, infra.nodes, now]);

  return (
    <Widget title="Active Connections" action={<span className="text-[10px] text-gray-500">{rows.length} states</span>}>
      <div className="max-h-52 overflow-y-auto term-scroll">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-panelalt text-gray-500">
            <tr>
              <th className="px-1.5 py-1 font-medium">Proto</th>
              <th className="px-1.5 py-1 font-medium">Source</th>
              <th className="px-1.5 py-1 font-medium">Destination</th>
              <th className="px-1.5 py-1 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-1.5 py-4 text-center text-gray-500">
                  No active sessions.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-1.5 py-1 font-mono uppercase text-gray-400">
                  {r.proto}
                  {r.dir === "in" && <span className="ml-1 text-[9px] text-info-text">in</span>}
                </td>
                <td className="px-1.5 py-1 font-mono text-gray-200">{r.src}</td>
                <td className="px-1.5 py-1 font-mono text-gray-200">{r.dst}</td>
                <td className="px-1.5 py-1 font-mono text-gray-400">{r.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Widget>
  );
}

/** Dashboard summary of the inspection engine. */
function ThreatWidget({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  if (!gw) return null;
  const ids = gw.network.ids ?? { enabled: false, mode: "detect" as const, events: [] };
  const sum = threatSummary(ids);
  const recent = ids.events.slice(0, 4);

  return (
    <Widget
      title="Threat Intelligence"
      action={
        <span className={`text-[10px] ${ids.enabled ? "text-ok-text" : "text-gray-500"}`}>
          {ids.enabled ? `IPS ${ids.mode}` : "engine off"}
        </span>
      }
    >
      {!ids.enabled ? (
        <p className="py-2 text-[11px] leading-relaxed text-gray-500">
          The inspection engine is disabled. Attacks against this perimeter are neither recorded nor
          stopped.
        </p>
      ) : sum.total === 0 ? (
        <p className="py-2 text-[11px] text-gray-500">No signature hits recorded.</p>
      ) : (
        <>
          <div className="mb-2 flex gap-4 font-mono text-[11px]">
            <span className="text-gray-200">{sum.total} events</span>
            <span className="text-ok-text">{sum.blocked} blocked</span>
            <span className={sum.total - sum.blocked ? "text-danger-text" : "text-gray-500"}>
              {sum.total - sum.blocked} through
            </span>
          </div>
          {recent.map((e) => (
            <div key={e.id} className="flex gap-2 border-t border-edge py-1 text-[10px]">
              <span className={`w-14 shrink-0 font-medium uppercase ${SEV_CLS[e.severity]}`}>
                {e.severity}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-200">{e.signature}</span>
              <span className="shrink-0 font-mono text-gray-500">{e.source}</span>
            </div>
          ))}
        </>
      )}
    </Widget>
  );
}

/** Local copy of the prefix test — the widget needs it and the model owns it. */
function cidrContainsLocal(cidr: string, ip: string): boolean {
  const [base, bits] = cidr.split("/");
  if (!bits) return base === ip;
  const octets = Math.floor(Number(bits) / 8);
  return base.split(".").slice(0, octets).join(".") === ip.split(".").slice(0, octets).join(".");
}

function FirewallSummary({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  if (!gw) return null;
  const rules = gw.network.firewall;
  const off = rules.filter((r) => !r.enabled).length;
  const blocks = rules.filter((r) => r.action !== "ACCEPT" && r.enabled).length;
  return (
    <>
      <Field label="Total rules" value={String(rules.length)} />
      <Field label="Active blocks" value={String(blocks)} />
      <Field
        label="Disabled"
        value={
          off > 0 ? <span className="text-warn-text">{off} rule{off === 1 ? "" : "s"} disabled</span> : "none"
        }
      />
      <Field label="Default policy" value={<span className="text-danger-text">deny (implicit)</span>} />
    </>
  );
}

// ── B. Firewall → Rules ─────────────────────────────────────────────────────

/*
 * Validated narrowing instead of `as`.
 *
 * A `<select>` hands back a bare string. Asserting it into the union compiles
 * against ANY string, so renaming an option silently produces a rule with an
 * action the evaluator has never heard of — which would read as "Pass" in the
 * table and match nothing at runtime. Checking membership costs one lookup and
 * cannot drift from the option list.
 */
const ACTIONS: FirewallRule["action"][] = ["ACCEPT", "DROP", "REJECT"];
/** The L7 catalogue. "—" in the UI means "match by port instead". */
const L7_APPS: L7App[] = ["bittorrent", "social-media", "streaming", "rdp", "cloud-storage"];
const L7_LABEL: Record<L7App, string> = {
  bittorrent: "BitTorrent",
  "social-media": "Social Media",
  streaming: "Streaming Video",
  rdp: "RDP",
  "cloud-storage": "Cloud Storage",
};
function parseApp(v: string): L7App | undefined {
  return L7_APPS.find((a) => a === v);
}
const PROTOCOLS: FirewallRule["protocol"][] = ["any", "tcp", "udp", "icmp"];

function parseAction(v: string, fallback: FirewallRule["action"]): FirewallRule["action"] {
  return ACTIONS.find((a) => a === v) ?? fallback;
}
function parseProtocol(v: string, fallback: FirewallRule["protocol"]): FirewallRule["protocol"] {
  return PROTOCOLS.find((p) => p === v) ?? fallback;
}

const BLANK: Omit<FirewallRule, "id" | "chain"> = {
  action: "ACCEPT",
  protocol: "any",
  source: "any",
  destination: "any",
  enabled: true,
};

function FirewallRulesPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const add = useInfraStore((s) => s.addFirewallRule);
  const update = useInfraStore((s) => s.updateFirewallRule);
  const del = useInfraStore((s) => s.deleteFirewallRule);
  const move = useInfraStore((s) => s.moveFirewallRule);

  const [iface, setIface] = useState<EdgeIface>("wan");
  const [editing, setEditing] = useState<FirewallRule | null>(null);

  if (!gw) return null;
  const chain = CHAIN_FOR[iface];
  const rules = gw.network.firewall.filter((r) => r.chain === chain);

  function save(rule: FirewallRule) {
    if (gw!.network.firewall.some((r) => r.id === rule.id)) update(nodeId, rule.id, rule);
    else add(nodeId, rule);
    setEditing(null);
  }

  return (
    <Page
      title="Firewall / Rules"
      subtitle="Rules are evaluated top down and the first match wins. Traffic matching no rule is denied."
    >
      <div className="mb-2 flex items-center gap-1 border-b border-edge">
        {(["wan", "lan"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setIface(t)}
            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
              iface === t
                ? "border-b-2 border-info text-info-text"
                : "text-gray-500 hover:text-gray-100"
            }`}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() =>
            setEditing({ ...BLANK, id: `rule-${Date.now().toString(36)}`, chain })
          }
          className={`${btn("primary")} ml-auto mb-1`}
        >
          Add rule
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-[11px]">
          <thead className="bg-panelalt text-gray-600">
            <tr>
              <th className="px-2 py-1.5 font-medium">Action</th>
              <th className="px-2 py-1.5 font-medium">Protocol</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5 font-medium">Destination</th>
              <th className="px-2 py-1.5 font-medium">Port</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 text-right font-medium">Order / Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-gray-500">
                  No rules on this interface. Traffic is denied by the implicit final rule.
                </td>
              </tr>
            )}
            {rules.map((r, i) => (
              <tr key={r.id} className={r.enabled ? "bg-panel" : "bg-gray-500/10 opacity-60"}>
                <td className="px-2 py-1.5">
                  <ActionBadge action={r.action} enabled={r.enabled} />
                </td>
                <td className="px-2 py-1.5 font-mono uppercase text-gray-200">{r.protocol}</td>
                <td className="px-2 py-1.5 font-mono text-gray-200">{r.source || "any"}</td>
                <td className="px-2 py-1.5 font-mono text-gray-200">{r.destination || "any"}</td>
                <td className="px-2 py-1.5 font-mono text-gray-200">
                  {r.app ? (
                    <span className="rounded-sm bg-brand-soft/25 px-1.5 py-0.5 text-[10px] text-brand-text">
                      L7
                    </span>
                  ) : (
                    (r.port ?? "*")
                  )}
                </td>
                <td className="px-2 py-1.5 text-gray-600">{describe(r)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => move(nodeId, r.id, "up")}
                      disabled={i === 0}
                      title="Move up"
                      className={btn()}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(nodeId, r.id, "down")}
                      disabled={i === rules.length - 1}
                      title="Move down"
                      className={btn()}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => update(nodeId, r.id, { enabled: !r.enabled })}
                      className={btn()}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => setEditing(r)} className={btn()}>
                      Edit
                    </button>
                    <button onClick={() => del(nodeId, r.id)} className={btn("danger")}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <RuleEditor rule={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </Page>
  );
}

function ActionBadge({ action, enabled }: { action: FirewallRule["action"]; enabled: boolean }) {
  const meta =
    action === "ACCEPT"
      ? { label: "Pass", cls: "text-ok-text", icon: "check" as const }
      : action === "DROP"
        ? { label: "Block", cls: "text-danger-text", icon: "ban" as const }
        : { label: "Reject", cls: "text-warn-text", icon: "alert" as const };
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${enabled ? meta.cls : "text-gray-500"}`}>
      <AppIcon id={meta.icon} size={12} />
      {meta.label}
    </span>
  );
}

/** A human sentence for the rule, so the table reads without decoding it. */
function describe(r: FirewallRule): string {
  if (r.description) return r.description;
  const verb = r.action === "ACCEPT" ? "Allow" : r.action === "DROP" ? "Block" : "Reject";
  const from = r.source && r.source !== "any" ? ` from ${r.source}` : "";
  // An application rule is described BY the application. Naming its port would
  // be a lie — matching by app is precisely what ignores the port.
  if (r.app) return `${verb} ${L7_LABEL[r.app]}${from} (application)`;
  const proto = r.protocol === "any" ? "all traffic" : r.protocol.toUpperCase();
  const port = r.port ? ` port ${r.port}` : "";
  return `${verb} ${proto}${port}${from}`;
}

function RuleEditor({
  rule,
  onCancel,
  onSave,
}: {
  rule: FirewallRule;
  onCancel: () => void;
  onSave: (r: FirewallRule) => void;
}) {
  const [draft, setDraft] = useState<FirewallRule>(rule);
  const set = <K extends keyof FirewallRule>(k: K, v: FirewallRule[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded border border-edge bg-panel shadow-2xl">
        <header className="border-b border-edge bg-panelalt px-3 py-2 text-[12px] font-semibold text-gray-100">
          Firewall rule
        </header>
        <div className="space-y-2 p-3">
          <Row label="Action">
            <select
              value={draft.action}
              onChange={(e) => set("action", parseAction(e.target.value, draft.action))}
              className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
            >
              <option value="ACCEPT">Pass</option>
              <option value="DROP">Block</option>
              <option value="REJECT">Reject</option>
            </select>
          </Row>
          <Row label="Protocol">
            <select
              value={draft.protocol}
              onChange={(e) => set("protocol", parseProtocol(e.target.value, draft.protocol))}
              className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
            >
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Source">
            <input
              value={draft.source ?? ""}
              onChange={(e) => set("source", e.target.value)}
              placeholder="any or 10.0.0.0/24"
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
            />
          </Row>
          <Row label="Destination">
            <input
              value={draft.destination ?? ""}
              onChange={(e) => set("destination", e.target.value)}
              placeholder="any"
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
            />
          </Row>
          <Row label="Application (L7)">
            <select
              value={draft.app ?? ""}
              onChange={(e) => {
                const app = parseApp(e.target.value);
                // Choosing an application clears the port: keeping both would
                // show two matchers where only one is consulted.
                setDraft((d) => ({ ...d, app, port: app ? undefined : d.port }));
              }}
              className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
            >
              <option value="">— match by port —</option>
              {L7_APPS.map((a) => (
                <option key={a} value={a}>
                  {L7_LABEL[a]}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Port">
            <input
              disabled={!!draft.app}
              value={draft.app ? "" : (draft.port ?? "")}
              onChange={(e) => {
                const v = e.target.value.trim();
                // Empty means "any port" — stored as absent, not as 0, because
                // 0 is a real port number and would match nothing.
                set("port", v === "" ? undefined : Number(v));
              }}
              placeholder={draft.app ? "not used — matching by application" : "any"}
              inputMode="numeric"
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100 disabled:opacity-40"
            />
          </Row>
          <Row label="Description">
            <input
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="optional — a generated sentence is shown when blank"
              className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
            />
          </Row>
        </div>
        <footer className="flex justify-end gap-2 border-t border-edge bg-panelalt px-3 py-2">
          <button onClick={onCancel} className={btn()}>
            Cancel
          </button>
          <button onClick={() => onSave(draft)} className={btn("primary")}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

// ── C. Interfaces → Assignments ─────────────────────────────────────────────

function AssignmentsPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const setIp = useInfraStore((s) => s.setNodeIpv4);
  const [editing, setEditing] = useState<string | null>(null);
  if (!gw) return null;

  return (
    <Page title="Interfaces / Assignments" subtitle="Physical ports and their IPv4 configuration.">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))" }}>
        {gw.network.interfaces.map((i) => (
          <Widget
            key={i.name}
            title={`${i.name === "wan0" ? "WAN" : "LAN"} — ${i.name}`}
            action={
              <span className={`text-[10px] ${i.up ? "text-ok-text" : "text-danger-text"}`}>
                {i.up ? "enabled" : "disabled"}
              </span>
            }
          >
            <Field label="IPv4 address" value={<span className="font-mono">{i.ipv4 || "—"}</span>} />
            <Field label="Subnet mask" value={<span className="font-mono">{i.netmask || "—"}</span>} />
            <Field label="MAC" value={<span className="font-mono">{i.mac}</span>} />
            <Field label="Link" value={i.carrier ? "connected" : "no carrier"} />
            <div className="mt-2 flex gap-1.5 border-t border-edge pt-2">
              <button onClick={() => setUp(nodeId, i.name, !i.up)} className={btn()}>
                {i.up ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(i.name)} disabled={!i.up} className={btn()}>
                Configure IPv4
              </button>
            </div>
          </Widget>
        ))}
      </div>

      {editing && (
        <Ipv4Editor
          current={gw.network.interfaces.find((i) => i.name === editing)?.ipv4 ?? ""}
          iface={editing}
          onCancel={() => setEditing(null)}
          onSave={(ip) => {
            setIp(nodeId, editing, ip);
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function Ipv4Editor({
  iface,
  current,
  onCancel,
  onSave,
}: {
  iface: string;
  current: string;
  onCancel: () => void;
  onSave: (ip: string) => void;
}) {
  /*
   * DHCP vs static is LOCAL state, for the same reason it is in the ServerOS
   * Network applet: an address assigned by DHCP and one typed by hand are
   * indistinguishable from the address alone, so the model cannot recover the
   * mode and the dialog must not pretend it can.
   */
  const [mode, setMode] = useState<"static" | "dhcp">(current ? "static" : "dhcp");
  const [ip, setIp] = useState(current);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded border border-edge bg-panel shadow-2xl">
        <header className="border-b border-edge bg-panelalt px-3 py-2 text-[12px] font-semibold text-gray-100">
          {iface} — IPv4 configuration
        </header>
        <div className="space-y-2 p-3">
          <label className="flex items-center gap-2 text-[11px] text-gray-200">
            <input type="radio" checked={mode === "dhcp"} onChange={() => setMode("dhcp")} />
            Obtain an address automatically (DHCP)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-gray-200">
            <input type="radio" checked={mode === "static"} onChange={() => setMode("static")} />
            Static IPv4
          </label>
          {mode === "static" && (
            <Row label="IPv4 address">
              <input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
              />
            </Row>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-edge bg-panelalt px-3 py-2">
          <button onClick={onCancel} className={btn()}>
            Cancel
          </button>
          <button onClick={() => onSave(mode === "static" ? ip.trim() : "")} className={btn("primary")}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Interfaces → Uplinks (absorbed from the NetOps Console) ─────────────────

function UplinksPage() {
  const infra = useInfraStore((s) => s.infra);
  const reroute = useInfraStore((s) => s.rerouteLink);
  const setFw = useInfraStore((s) => s.setLinkFirewall);
  const setBlocked = useInfraStore((s) => s.setLinkBlocked);
  const name = (id: string) => (id === "internet" ? "Internet" : infra.nodes[id]?.hostname ?? id);

  return (
    <Page
      title="Interfaces / Uplinks & Links"
      subtitle="Every monitored link in the estate. Re-route a congested link, dampen loss with a software firewall, or block it to contain an incident."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-[11px]">
          <thead className="bg-panelalt text-gray-600">
            <tr>
              <th className="px-2 py-1.5 font-medium">Link</th>
              <th className="px-2 py-1.5 font-medium">Latency</th>
              <th className="px-2 py-1.5 font-medium">Utilisation</th>
              <th className="px-2 py-1.5 font-medium">Loss</th>
              <th className="px-2 py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {infra.links.map((l) => (
              <tr key={l.id} className={l.blocked ? "bg-danger/10" : "bg-panel"}>
                <td className="px-2 py-1.5 font-mono text-gray-200">
                  {name(l.from)} ↔ {name(l.to)}
                  {l.softwareFirewall && <span className="ml-2 text-[9px] text-info-text">[fw]</span>}
                  {l.blocked && <span className="ml-2 text-[9px] text-danger-text">[blocked]</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-gray-200">{l.latencyMs.toFixed(1)} ms</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-500/20">
                      <div
                        className={`h-full ${l.utilizationPct >= 85 ? "bg-danger" : l.utilizationPct >= 60 ? "bg-warn" : "bg-ok"}`}
                        style={{ width: `${Math.min(100, l.utilizationPct)}%` }}
                      />
                    </div>
                    <span className="font-mono text-gray-200">{Math.round(l.utilizationPct)}%</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-gray-200">{l.packetLossPct.toFixed(1)}%</td>
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => reroute(l.id, l.via)} className={btn()}>
                      Re-route
                    </button>
                    <button onClick={() => setFw(l.id, !l.softwareFirewall)} className={btn()}>
                      {l.softwareFirewall ? "Remove FW" : "Deploy FW"}
                    </button>
                    <button onClick={() => setBlocked(l.id, !l.blocked)} className={btn(l.blocked ? "ghost" : "danger")}>
                      {l.blocked ? "Unblock" : "Block"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

// ── Services → DHCP & DNS ───────────────────────────────────────────────────

/**
 * Services → DHCP Server.
 *
 * Leases are DERIVED from who actually holds an address on the LAN; only
 * reservations are stored. A machine holding an address IS the lease, and
 * storing a second copy would let the Network applet re-address a host while
 * the router still advertised the old one — two truths, reconciled by hand
 * forever. A reservation, by contrast, is an intention that exists whether or
 * not the machine is currently switched on, so it has to be stored.
 */
function DhcpPage({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const gw = infra.nodes[nodeId];
  const setCfg = useInfraStore((s) => s.setDhcpConfig);
  const addRes = useInfraStore((s) => s.addDhcpReservation);
  const delRes = useInfraStore((s) => s.deleteDhcpReservation);
  const [reserving, setReserving] = useState<DhcpReservation | null>(null);
  if (!gw) return null;

  const lanIp = gw.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
  const cidr = lanCidrFor(lanIp);
  const cfg = gw.network.dhcp ?? {
    enabled: true,
    rangeStart: lanIp.replace(/\.\d+$/, ".100"),
    rangeEnd: lanIp.replace(/\.\d+$/, ".199"),
    leaseMinutes: 1440,
    reservations: [],
  };
  const leases = deriveLeases(cfg, cidr, infra.nodes, lanIp);
  const conflicts = leases.filter((l) => l.problem);

  return (
    <Page title="Services / DHCP Server" subtitle={`Address handout for ${cidr}.`}>
      <div className="mb-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))" }}>
        <Widget title="Server">
          <label className="flex items-center gap-2 py-1 text-[11px] text-gray-200">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setCfg(nodeId, { enabled: e.target.checked })}
            />
            Enable DHCP on LAN
          </label>
          <Field label="Subnet" value={<span className="font-mono">{cidr}</span>} />
          <Field label="Gateway offered" value={<span className="font-mono">{lanIp}</span>} />
          <Field label="Lease time" value={`${cfg.leaseMinutes} minutes`} />
        </Widget>

        <Widget title="Address pool">
          <Row label="Range start">
            <input
              value={cfg.rangeStart}
              onChange={(e) => setCfg(nodeId, { rangeStart: e.target.value.trim() })}
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
            />
          </Row>
          <Row label="Range end">
            <input
              value={cfg.rangeEnd}
              onChange={(e) => setCfg(nodeId, { rangeEnd: e.target.value.trim() })}
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
            />
          </Row>
        </Widget>

        <Widget title="Pool health">
          <Field label="Active leases" value={String(leases.length)} />
          <Field label="Static reservations" value={String(cfg.reservations.length)} />
          <Field
            label="Conflicts"
            value={
              conflicts.length ? (
                <span className="text-danger-text">{conflicts.length} needing attention</span>
              ) : (
                <span className="text-ok-text">none</span>
              )
            }
          />
        </Widget>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-3 rounded border border-danger/40 bg-danger/10 p-3 text-[11px] leading-relaxed text-gray-200">
          {conflicts.length} lease{conflicts.length === 1 ? "" : "s"} cannot be honoured as configured.
          Conflicting rows are marked below.
        </div>
      )}

      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Active leases
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-[11px]">
          <thead className="bg-panelalt text-gray-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">IP address</th>
              <th className="px-2 py-1.5 font-medium">MAC address</th>
              <th className="px-2 py-1.5 font-medium">Hostname</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 text-right font-medium">Reservation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {leases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-gray-500">
                  No hosts are currently holding an address on this subnet.
                </td>
              </tr>
            )}
            {leases.map((l) => (
              <tr key={`${l.mac}-${l.ip}`} className={l.problem ? "bg-danger/10" : "bg-panel"}>
                <td className="px-2 py-1.5 font-mono text-gray-200">{l.ip}</td>
                <td className="px-2 py-1.5 font-mono text-gray-400">{l.mac}</td>
                <td className="px-2 py-1.5 text-gray-200">{l.hostname}</td>
                <td className="px-2 py-1.5">
                  <span className={l.kind === "static" ? "text-info-text" : "text-gray-400"}>
                    {l.kind}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  {l.problem ? (
                    <span className="text-danger-text">{l.problem}</span>
                  ) : (
                    <span className="text-ok-text">bound</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-1">
                    {l.kind === "static" ? (
                      <button onClick={() => delRes(nodeId, l.mac)} className={btn("danger")}>
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => setReserving({ mac: l.mac, ip: l.ip, hostname: l.hostname })}
                        className={btn()}
                      >
                        Reserve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reserving && (
        <Modal
          title="Static reservation"
          onCancel={() => setReserving(null)}
          onSave={() => {
            addRes(nodeId, reserving);
            setReserving(null);
          }}
        >
          <Row label="MAC address">
            <input
              readOnly
              value={reserving.mac}
              className="w-full rounded border border-edge bg-panelalt px-2 py-1 font-mono text-[11px] text-gray-400"
            />
          </Row>
          <Row label="Reserved IP">
            <input
              value={reserving.ip}
              onChange={(e) => setReserving({ ...reserving, ip: e.target.value.trim() })}
              className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
            />
          </Row>
          <p className="text-[10px] leading-relaxed text-gray-500">
            Pin an address inside the pool and it will eventually be offered to another machine as
            well. Reserve outside {cfg.rangeStart}–{cfg.rangeEnd} to be safe.
          </p>
        </Modal>
      )}
    </Page>
  );
}

// ── D. Status ───────────────────────────────────────────────────────────────

function StatusInterfacesPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  if (!gw) return null;
  return (
    <Page title="Status / Interfaces" subtitle="Read-only detail for each interface.">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))" }}>
        {gw.network.interfaces.map((i) => (
          <Widget key={i.name} title={i.name === "wan0" ? "WAN interface" : "LAN interface"}>
            <Field label="Status" value={i.up ? "up" : "down"} />
            <Field label="MAC address" value={<span className="font-mono">{i.mac}</span>} />
            <Field label="IPv4 address" value={<span className="font-mono">{i.ipv4 || "—"}</span>} />
            <Field label="Subnet mask" value={<span className="font-mono">{i.netmask || "—"}</span>} />
            <Field label="Media" value={i.carrier ? "1000baseT full-duplex" : "no carrier"} />
          </Widget>
        ))}
        <Widget title="Routes">
          {gw.network.routes.map((r) => (
            <Field
              key={`${r.destination}-${r.iface}`}
              label={r.destination}
              value={<span className="font-mono">via {r.gateway} dev {r.iface} metric {r.metric}</span>}
            />
          ))}
        </Widget>
      </div>
    </Page>
  );
}

/**
 * Status → System Logs (Firewall).
 *
 * Every line is a real verdict: a sample packet is run through `evaluate`
 * against the CURRENT rule set, so the log reflects what the operator has just
 * configured. Disable the LAN permit and the log starts filling with blocks
 * naming the rule that did it — which is exactly the feedback loop a firewall
 * ticket needs, and what a prewritten log could never provide.
 */
function FirewallLogPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const now = useNow();

  const lines = useMemo(() => {
    if (!gw) return [];
    const lan = gw.network.interfaces.find((i) => i.name === "lan0")?.ipv4 ?? "10.0.0.1";
    const base = lan.replace(/\.\d+$/, "");
    const samples = [
      { chain: "FORWARD" as const, protocol: "tcp", port: 443, source: `${base}.24`, dst: "93.184.216.34" },
      { chain: "FORWARD" as const, protocol: "udp", port: 53, source: `${base}.31`, dst: "1.1.1.1" },
      { chain: "INPUT" as const, protocol: "tcp", port: 22, source: "198.51.100.7", dst: lan },
      { chain: "FORWARD" as const, protocol: "tcp", port: 445, source: `${base}.52`, dst: "203.0.113.44" },
      { chain: "INPUT" as const, protocol: "icmp", source: "203.0.113.9", dst: lan },
      { chain: "FORWARD" as const, protocol: "tcp", port: 80, source: `${base}.18`, dst: "151.101.1.69" },
    ];
    // Tick-derived so the tail advances without storing a log we would then
    // have to keep consistent with the rules.
    const t = Math.floor(now / 1000);
    return samples.map((s, i) => {
      const verdict = evaluate(gw.network.firewall, s);
      const at = new Date((t - (samples.length - i) * 7) * 1000);
      return {
        key: `${s.source}-${i}`,
        time: at.toLocaleTimeString("en-GB", { hour12: false }),
        iface: s.chain === "INPUT" ? "WAN" : "LAN",
        allowed: verdict.allowed,
        rule: verdict.rule?.id ?? "default deny",
        text: `${s.protocol.toUpperCase()} ${s.source}${"port" in s && s.port ? "" : ""} → ${s.dst}${s.port ? `:${s.port}` : ""}`,
      };
    });
  }, [gw, now]);

  if (!gw) return null;

  return (
    <Page title="Status / System Logs — Firewall" subtitle="Live tail. Each verdict is evaluated against the current rule set.">
      <div className="overflow-hidden rounded border border-edge bg-[#11161d]">
        <div className="max-h-[26rem] overflow-y-auto term-scroll p-2 font-mono text-[10px] leading-relaxed">
          {lines.map((l) => (
            <div key={l.key} className="flex gap-2 whitespace-nowrap">
              <span className="text-slate-500">{l.time}</span>
              <span className={l.allowed ? "text-emerald-400" : "text-red-400"}>
                {l.allowed ? "pass" : "block"}
              </span>
              <span className="text-sky-400">{l.iface}</span>
              <span className="text-slate-300">{l.text}</span>
              <span className="text-slate-500">[{l.rule}]</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-gray-500">
        Verdicts are recomputed from the rule table on every tick — change a rule and this tail
        changes with it.
      </p>
    </Page>
  );
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

function DiagPingPage({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const gw = infra.nodes[nodeId];
  if (!gw) return null;
  const wanUp = gw.network.interfaces.find((i) => i.name === "wan0")?.up ?? false;
  const lanUp = gw.network.interfaces.find((i) => i.name === "lan0")?.up ?? false;

  const targets = [
    { label: "Upstream gateway (203.0.113.9)", ok: wanUp },
    { label: "Public DNS (1.1.1.1)", ok: wanUp },
    { label: "LAN broadcast", ok: lanUp },
  ];

  return (
    <Page title="Diagnostics / Ping" subtitle="Reachability from the appliance itself.">
      <Widget title="Results">
        {targets.map((t) => (
          <Field
            key={t.label}
            label={t.label}
            value={
              t.ok ? (
                <span className="text-ok-text">reply received</span>
              ) : (
                <span className="text-danger-text">no route to host — interface is down</span>
              )
            }
          />
        ))}
      </Widget>
      {!wanUp && (
        <div className="mt-3 rounded border border-danger/40 bg-danger/10 p-3 text-[11px] leading-relaxed text-gray-100">
          The WAN interface is administratively down. Nothing behind this firewall can reach the
          internet until it is re-enabled under Interfaces → Assignments.
        </div>
      )}
    </Page>
  );
}

function DiagStatesPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  if (!gw) return null;
  const rules = gw.network.firewall;
  return (
    <Page title="Diagnostics / Firewall States" subtitle="The evaluated rule table, in match order.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-[11px]">
          <thead className="bg-panelalt text-gray-600">
            <tr>
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Chain</th>
              <th className="px-2 py-1.5 font-medium">Action</th>
              <th className="px-2 py-1.5 font-medium">Match</th>
              <th className="px-2 py-1.5 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rules.map((r, i) => (
              <tr key={r.id} className="bg-panel">
                <td className="px-2 py-1.5 font-mono text-gray-500">{i + 1}</td>
                <td className="px-2 py-1.5 font-mono text-gray-200">{r.chain}</td>
                <td className="px-2 py-1.5">
                  <ActionBadge action={r.action} enabled={r.enabled} />
                </td>
                <td className="px-2 py-1.5 font-mono text-gray-200">
                  {r.protocol}
                  {r.port ? `/${r.port}` : ""} from {r.source || "any"}
                </td>
                <td className="px-2 py-1.5 text-gray-600">{r.enabled ? "active" : "disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

// ── Firewall → NAT / Port Forward ───────────────────────────────────────────

/**
 * Destination NAT.
 *
 * The page exists for one scenario above all others: "external users cannot
 * reach our web server". That fault has three distinct causes — no forward, a
 * forward aimed at the wrong host, and a forward whose translated traffic the
 * firewall then drops — and this page can tell them apart, which is the only
 * reason it is worth having rather than a line in the rules table.
 */
function NatPage({ nodeId }: { nodeId: string }) {
  const infra = useInfraStore((s) => s.infra);
  const gw = infra.nodes[nodeId];
  const add = useInfraStore((s) => s.addNatRule);
  const update = useInfraStore((s) => s.updateNatRule);
  const del = useInfraStore((s) => s.deleteNatRule);
  const [editing, setEditing] = useState<NatRule | null>(null);
  if (!gw) return null;

  const wanIp = gw.network.interfaces.find((i) => i.name === "wan0")?.ipv4 ?? "—";
  const rules = gw.network.nat ?? [];

  return (
    <Page
      title="Firewall / NAT — Port Forward"
      subtitle="Inbound connections to the WAN address are translated first, then filtered. A forward whose translated traffic the rules deny still fails."
    >
      <div className="mb-2 flex items-center">
        <span className="font-mono text-[11px] text-gray-500">WAN address {wanIp}</span>
        <button
          onClick={() =>
            setEditing({
              id: `nat-${Date.now().toString(36)}`,
              protocol: "tcp",
              externalPort: 80,
              internalIp: "",
              internalPort: 80,
              enabled: true,
            })
          }
          className={`${btn("primary")} ml-auto`}
        >
          Add forward
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-[11px]">
          <thead className="bg-panelalt text-gray-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Proto</th>
              <th className="px-2 py-1.5 font-medium">External</th>
              <th className="px-2 py-1.5 font-medium">Internal target</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Health</th>
              <th className="px-2 py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-gray-500">
                  No port forwards. Nothing on the LAN is published to the internet.
                </td>
              </tr>
            )}
            {rules.map((r) => {
              // Derived every render: a forward becomes healthy the moment its
              // target comes back, with nothing to keep in sync.
              const problem = natTargetProblem(r, infra.nodes);
              const check = resolveInbound(gw.network, {
                protocol: r.protocol,
                port: r.externalPort,
                source: "198.51.100.20",
              });
              return (
                <tr key={r.id} className={r.enabled ? "bg-panel" : "bg-gray-500/10 opacity-60"}>
                  <td className="px-2 py-1.5 font-mono uppercase text-gray-200">{r.protocol}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-200">
                    {wanIp}:{r.externalPort}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-200">
                    {r.internalIp || "—"}:{r.internalPort}
                  </td>
                  <td className="px-2 py-1.5 text-gray-400">{r.description || "Port forward"}</td>
                  <td className="px-2 py-1.5">
                    {problem ? (
                      <span className="text-danger-text">{problem}</span>
                    ) : !check.allowed ? (
                      <span className="text-warn-text">
                        Target reachable, but the firewall denies port {r.internalPort}
                      </span>
                    ) : (
                      <span className="text-ok-text">published</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => update(nodeId, r.id, { enabled: !r.enabled })} className={btn()}>
                        {r.enabled ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => setEditing(r)} className={btn()}>
                        Edit
                      </button>
                      <button onClick={() => del(nodeId, r.id)} className={btn("danger")}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <NatEditor
          rule={editing}
          onCancel={() => setEditing(null)}
          onSave={(r) => {
            if (rules.some((x) => x.id === r.id)) update(nodeId, r.id, r);
            else add(nodeId, r);
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function NatEditor({
  rule,
  onCancel,
  onSave,
}: {
  rule: NatRule;
  onCancel: () => void;
  onSave: (r: NatRule) => void;
}) {
  const [draft, setDraft] = useState<NatRule>(rule);
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return (
    <Modal title="Port forward" onCancel={onCancel} onSave={() => onSave(draft)}>
      <Row label="Protocol">
        <select
          value={draft.protocol}
          onChange={(e) => setDraft((d) => ({ ...d, protocol: e.target.value === "udp" ? "udp" : "tcp" }))}
          className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
        >
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
        </select>
      </Row>
      <Row label="External port (WAN)">
        <input
          value={draft.externalPort}
          onChange={(e) => setDraft((d) => ({ ...d, externalPort: num(e.target.value, d.externalPort) }))}
          inputMode="numeric"
          className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
        />
      </Row>
      <Row label="Internal host">
        <input
          value={draft.internalIp}
          onChange={(e) => setDraft((d) => ({ ...d, internalIp: e.target.value.trim() }))}
          placeholder="10.0.0.20"
          className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
        />
      </Row>
      <Row label="Internal port">
        <input
          value={draft.internalPort}
          onChange={(e) => setDraft((d) => ({ ...d, internalPort: num(e.target.value, d.internalPort) }))}
          inputMode="numeric"
          className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-100"
        />
      </Row>
      <Row label="Description">
        <input
          value={draft.description ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Public web server"
          className="w-full rounded border border-edge bg-panel px-2 py-1 text-[11px] text-gray-100"
        />
      </Row>
    </Modal>
  );
}

/** Shared dialog frame — the rule and NAT editors are the same shape. */
function Modal({
  title,
  children,
  onCancel,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded border border-edge bg-panel shadow-2xl">
        <header className="border-b border-edge bg-panelalt px-3 py-2 text-[12px] font-semibold text-gray-100">
          {title}
        </header>
        <div className="space-y-2 p-3">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-edge bg-panelalt px-3 py-2">
          <button onClick={onCancel} className={btn()}>
            Cancel
          </button>
          <button onClick={onSave} className={btn("primary")}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Security → IDS / IPS ────────────────────────────────────────────────────

function IdsPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const setIds = useInfraStore((s) => s.setIds);
  if (!gw) return null;
  const ids = gw.network.ids ?? { enabled: false, mode: "detect" as const, events: [] };
  const sum = threatSummary(ids);

  return (
    <Page
      title="Security / IDS — IPS"
      subtitle="Inspection engine. Detect mode records what it sees; prevent mode drops it."
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))" }}>
        <Widget title="Engine">
          <label className="flex items-center gap-2 py-1 text-[11px] text-gray-200">
            <input
              type="checkbox"
              checked={ids.enabled}
              onChange={(e) => setIds(nodeId, { enabled: e.target.checked })}
            />
            Enable inspection engine
          </label>
          <div className="mt-2 border-t border-edge pt-2">
            {(["detect", "prevent"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 py-1 text-[11px] text-gray-200">
                <input
                  type="radio"
                  checked={ids.mode === m}
                  disabled={!ids.enabled}
                  onChange={() => setIds(nodeId, { mode: m })}
                />
                {m === "detect" ? "Detection only (log, do not drop)" : "Prevention (log and drop)"}
              </label>
            ))}
          </div>
          {ids.enabled && ids.mode === "detect" && (
            <p className="mt-2 rounded border border-warn/40 bg-warn/10 p-2 text-[10px] leading-relaxed text-gray-200">
              In detection mode the engine records attacks but does not stop them. Traffic matching a
              signature still reaches the estate.
            </p>
          )}
          {!ids.enabled && (
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
              The engine is off. Nothing is inspected and the threat log will not grow.
            </p>
          )}
        </Widget>

        <Widget title="Signature activity">
          <Field label="Events recorded" value={String(sum.total)} />
          <Field
            label="Blocked"
            value={
              sum.blocked > 0 ? <span className="text-ok-text">{sum.blocked}</span> : "none"
            }
          />
          <Field
            label="Critical"
            value={
              sum.critical > 0 ? <span className="text-danger-text">{sum.critical}</span> : "none"
            }
          />
          <div className="mt-2 border-t border-edge pt-2">
            {(["critical", "high", "medium", "low"] as const).map((sev) => (
              <Meter
                key={sev}
                label={sev}
                pct={sum.total ? (sum.bySeverity[sev] / sum.total) * 100 : 0}
              />
            ))}
          </div>
        </Widget>
      </div>
    </Page>
  );
}

const SEV_CLS: Record<ThreatEvent["severity"], string> = {
  low: "text-gray-400",
  medium: "text-info-text",
  high: "text-warn-text",
  critical: "text-danger-text",
};

function ThreatPage({ nodeId }: { nodeId: string }) {
  const gw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const clear = useInfraStore((s) => s.clearThreatEvents);
  if (!gw) return null;
  const ids = gw.network.ids ?? { enabled: false, mode: "detect" as const, events: [] };
  const sum = threatSummary(ids);

  return (
    <Page title="Security / Threat Intelligence" subtitle="Signature hits recorded by the inspection engine.">
      <div className="mb-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))" }}>
        <Stat label="Total events" value={String(sum.total)} />
        <Stat label="Blocked" value={String(sum.blocked)} tone={sum.blocked ? "ok" : undefined} />
        <Stat
          label="Reached estate"
          value={String(sum.total - sum.blocked)}
          tone={sum.total - sum.blocked > 0 ? "danger" : undefined}
        />
        <Stat label="Critical" value={String(sum.critical)} tone={sum.critical ? "danger" : undefined} />
      </div>

      {ids.events.length === 0 ? (
        <div className="rounded border border-edge bg-panel p-6 text-center text-[11px] text-gray-500">
          {ids.enabled
            ? "No signature hits recorded. The engine is running and the perimeter is quiet."
            : "The inspection engine is disabled, so nothing is being recorded."}
        </div>
      ) : (
        <>
          <div className="mb-2 flex">
            <button onClick={() => clear(nodeId)} className={`${btn()} ml-auto`}>
              Clear log
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-[11px]">
              <thead className="bg-panelalt text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">Severity</th>
                  <th className="px-2 py-1.5 font-medium">Signature</th>
                  <th className="px-2 py-1.5 font-medium">Source</th>
                  <th className="px-2 py-1.5 font-medium">Target</th>
                  <th className="px-2 py-1.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {ids.events.slice(0, 60).map((e) => (
                  <tr key={e.id} className="bg-panel">
                    <td className="px-2 py-1.5 font-mono text-gray-400">
                      {new Date(e.at).toLocaleTimeString("en-GB", { hour12: false })}
                    </td>
                    <td className={`px-2 py-1.5 font-medium uppercase ${SEV_CLS[e.severity]}`}>{e.severity}</td>
                    <td className="px-2 py-1.5 text-gray-200">{e.signature}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-200">{e.source}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-200">{e.target}</td>
                    <td className="px-2 py-1.5">
                      {e.action === "blocked" ? (
                        <span className="text-ok-text">blocked</span>
                      ) : (
                        <span className="text-danger-text">detected only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  const cls = tone === "ok" ? "text-ok-text" : tone === "danger" ? "text-danger-text" : "text-gray-100";
  return (
    <div className="rounded border border-edge bg-panel p-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 font-mono text-[20px] leading-none ${cls}`}>{value}</div>
    </div>
  );
}
