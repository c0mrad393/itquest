"use client";

/**
 * Remote Gateway Manager (Level-0 host app)
 * =========================================
 * Every machine the operator can reach, and the state of each connection.
 *
 * ── WHAT THE POLISH PASS CHANGED, AND WHY ───────────────────────────────────
 *
 * The card used to lead with three telemetry tiles — CPU, MEM, DISK — given
 * equal weight to the hostname. That is backwards for what this screen is FOR.
 * Nobody opens a connection manager to read a memory percentage; they open it
 * to answer "can I get in, and is anything wrong with it". CPU at 61% is the
 * Monitor's job, and the Monitor does it better with a history behind it.
 *
 * So the essentials view answers the two questions the screen exists for —
 * REACHABLE, and HEALTHY — and the metrics move behind the same Advanced
 * toggle the Ticket Center uses, following the rule from Disclosure.tsx:
 * hiding is allowed only where leaving it alone still yields a correct result.
 * A connection made without reading the disk percentage is a correct
 * connection. A connection made without knowing the host is compromised is not,
 * so that never hides.
 *
 * ── STATUS IS THE LOUDEST THING ON THE CARD ─────────────────────────────────
 *
 * A connection manager is read at a glance, usually while something is broken.
 * Reachability is now a coloured rail down the leading edge plus an explicit
 * word, rather than a dot competing with four other small marks — the same
 * device as the Ticket Center's selection rail, for the same reason: a rail
 * survives peripheral vision and a 2mm dot does not.
 */

import { useInfraStore } from "@/lib/infra/store";
import { gatewayTargets } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import type { HealthStatus } from "@/lib/core";
import { AppIcon, OS_ICON_ID } from "@/components/ui/app-icons";
import { computeTraffic, effectiveLatency } from "@/lib/core";
import { useTrafficOverrides } from "@/lib/host/devtools";
import { useState } from "react";
import { Segmented } from "./AppChrome";

const HEALTH: Record<HealthStatus, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-emerald-400", text: "text-emerald-300" },
  degraded: { label: "Degraded", dot: "bg-amber-400", text: "text-amber-300" },
  critical: { label: "Critical", dot: "bg-red-500", text: "text-red-300" },
  offline: { label: "Offline", dot: "bg-gray-500", text: "text-gray-400" },
};

export default function RemoteGateway() {
  const infra = useInfraStore((s) => s.infra);
  // Congestion is a property of the PATH, so it is read once for the whole
  // list rather than per row — every entry here shares the same backbone.
  const satLevel = computeTraffic(infra, useTrafficOverrides()).level;
  const windows = useHostStore((s) => s.windows);
  const openRemote = useHostStore((s) => s.openRemote);
  const focus = useHostStore((s) => s.focus);

  // Derived from the datacenter every render, so unracking a server or
  // tripping its PDU removes it from the list on the same frame.
  const targets = gatewayTargets(infra);
  /*
   * Local state, not the ticket store's session-scoped preference: these are
   * two different screens with two different audiences, and an operator who
   * wants dense tickets does not necessarily want dense connection cards.
   * Sharing one flag would be a coupling nobody asked for.
   */
  const [pro, setPro] = useState(false);
  const reachable = targets.filter((t) => t.connectable).length;

  function sessionFor(nodeId: string) {
    return windows.find((w) => w.kind === "remote" && w.nodeId === nodeId);
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <div className="flex items-center gap-2.5 border-b border-edge bg-panelalt px-4 py-3">
        <span className="text-sm font-semibold">{infra.clientOrg}</span>
        {/* The count is the headline number on this screen, and it changes
            colour when anything is unreachable — a neutral pill reading
            "3 of 6" makes the operator do the subtraction themselves. */}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            reachable === targets.length
              ? "bg-accent/15 text-accent-strong"
              : "bg-warn/15 text-warn-strong"
          }`}
        >
          {reachable} of {targets.length} reachable
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-[11px] text-gray-500 sm:inline">RDP / SSH</span>
          <Segmented
            value={pro ? "advanced" : "essentials"}
            onChange={(v) => setPro(v === "advanced")}
            options={[
              { value: "essentials", label: "Essentials" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
        </div>
      </div>

      <div
        data-tutorial-target="gateway-targets"
        className="grid flex-1 gap-3 overflow-y-auto term-scroll p-4 md:grid-cols-2"
      >
        {targets.map((entry) => {
          const node = entry.node;
          /*
           * A compromised host is NEVER "Healthy", whatever its stored health
           * says. That field describes CPU and disk; it knows nothing about
           * encryption, and showing green beside a live ransomware incident is
           * the most misleading thing this card could do.
           */
          const h = entry.compromised
            ? { label: "Compromised", dot: "bg-danger", text: "text-danger-strong" }
            : HEALTH[node.health.status];
          const session = sessionFor(entry.nodeId);
          // Physical reality decides, not a list captured at world generation.
          const canConnect = entry.connectable;

          return (
            <div
              key={entry.nodeId}
              className="relative flex flex-col gap-3 overflow-hidden rounded-wm border border-edge bg-panelalt p-4 pl-5 transition hover:border-edge-strong"
            >
              {/* Reachability as a rail: readable in peripheral vision, which
                  a dot competing with four other small marks is not. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-[3px] ${
                  entry.compromised ? "bg-danger" : canConnect ? "bg-accent" : "bg-gray-600"
                }`}
              />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sunken/60 text-gray-300">
                  <AppIcon id={OS_ICON_ID[node.os]} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-100">{node.displayName}</div>
                  <div className="font-mono text-[11px] text-gray-500">
                    {node.hostname} · {node.connection.ip}
                    {entry.location && <span className="ml-1.5 text-gray-600">{entry.location}</span>}
                  </div>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    node.connection.protocol === "rdp" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300"
                  }`}
                >
                  {node.connection.protocol}
                </span>
              </div>

              {/* Telemetry is Advanced: useful, but never the reason this
                  screen is open. `grid-rows-[0fr]` collapses to a true zero
                  height without measuring the content. */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                  pro ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
                aria-hidden={!pro}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <Metric label="CPU" value={`${node.health.cpuLoad}%`} />
                    <Metric label="MEM" value={`${node.health.memUsedPct}%`} />
                    <Metric label="DISK" value={`${node.health.diskUsedPct}%`} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-[11px] ${h.text}`}>
                  <span className={`h-2 w-2 rounded-full ${h.dot}`} />
                  {h.label}
                </span>
                {pro && (
                  <span className="text-[11px] text-gray-500">· {node.role.replace(/-/g, " ")}</span>
                )}
                {/* Inflated by congestion, so the operator sees the network is
                    slow BEFORE they blame the machine they are about to open. */}
                <span
                  className={`ml-auto text-[11px] ${
                    satLevel === "clear" || satLevel === "busy" ? "text-gray-500" : "text-warn-strong"
                  }`}
                  title={
                    satLevel === "clear" || satLevel === "busy"
                      ? undefined
                      : `Base ${node.connection.latencyMs} ms, inflated by network congestion.`
                  }
                >
                  {effectiveLatency(node.connection.latencyMs, satLevel)} ms
                </span>
              </div>

              {session ? (
                <button
                  onClick={() => focus(session.instanceId)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent-strong transition hover:bg-accent/20"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="tut-pip absolute inline-flex h-full w-full rounded-full bg-accent" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Session active — focus it
                </button>
              ) : (
                <button
                  disabled={!canConnect}
                  onClick={() =>
                    openRemote(node.nodeId, node.displayName, OS_ICON_ID[node.os], node.connection.protocol)
                  }
                  title={entry.reason ?? undefined}
                  className="w-full rounded-md bg-brand-fill px-3 py-2 text-xs font-semibold text-brand-on transition hover:bg-brand-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
                >
                  {canConnect
                    ? `Connect via ${node.connection.protocol.toUpperCase()}`
                    : /* Naming the cause here is what turns a dead button into
                         a trail: the operator learns the rack is the problem
                         without opening three apps to find out. */
                      `Unreachable — ${entry.reason ?? "no route"}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-500/15 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-mono text-gray-200">{value}</div>
    </div>
  );
}
