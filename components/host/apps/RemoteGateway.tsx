"use client";

/**
 * Remote Gateway Manager (Level-0 host app)
 * -----------------------------------------
 * Lists the client's connectable nodes from InfrastructureState with live
 * health/reachability, and launches nested remote sessions. "Connect" opens a
 * RemoteSessionWindow (RDP/SSH) via the host window manager; if a session is
 * already open for a node, the button focuses it instead.
 */

import { useInfraStore } from "@/lib/infra/store";
import { gatewayTargets } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import type { HealthStatus } from "@/lib/core";
import { AppIcon, OS_ICON_ID } from "@/components/ui/app-icons";

const HEALTH: Record<HealthStatus, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-emerald-400", text: "text-emerald-300" },
  degraded: { label: "Degraded", dot: "bg-amber-400", text: "text-amber-300" },
  critical: { label: "Critical", dot: "bg-red-500", text: "text-red-300" },
  offline: { label: "Offline", dot: "bg-gray-500", text: "text-gray-400" },
};

export default function RemoteGateway() {
  const infra = useInfraStore((s) => s.infra);
  const windows = useHostStore((s) => s.windows);
  const openRemote = useHostStore((s) => s.openRemote);
  const focus = useHostStore((s) => s.focus);

  // Derived from the datacenter every render, so unracking a server or
  // tripping its PDU removes it from the list on the same frame.
  const targets = gatewayTargets(infra);

  function sessionFor(nodeId: string) {
    return windows.find((w) => w.kind === "remote" && w.nodeId === nodeId);
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-4 py-3">
        <span className="text-sm font-semibold">{infra.clientOrg}</span>
        <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
          {targets.filter((t) => t.connectable).length} of {targets.length} reachable
        </span>
        <span className="ml-auto text-[11px] text-gray-500">Remote Gateway · RDP / SSH</span>
      </div>

      <div className="grid flex-1 gap-3 overflow-y-auto term-scroll p-4 md:grid-cols-2">
        {targets.map((entry) => {
          const node = entry.node;
          const h = HEALTH[node.health.status];
          const session = sessionFor(entry.nodeId);
          // Physical reality decides, not a list captured at world generation.
          const canConnect = entry.connectable;

          return (
            <div
              key={entry.nodeId}
              className="flex flex-col gap-3 rounded-xl border border-edge bg-panelalt p-4"
            >
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

              {/* Telemetry */}
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Metric label="CPU" value={`${node.health.cpuLoad}%`} />
                <Metric label="MEM" value={`${node.health.memUsedPct}%`} />
                <Metric label="DISK" value={`${node.health.diskUsedPct}%`} />
              </div>

              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-[11px] ${h.text}`}>
                  <span className={`h-2 w-2 rounded-full ${h.dot}`} />
                  {h.label}
                </span>
                <span className="text-[11px] text-gray-500">
                  · {node.role.replace(/-/g, " ")}
                </span>
                <span className="ml-auto text-[11px] text-gray-500">{node.connection.latencyMs} ms</span>
              </div>

              {session ? (
                <button
                  onClick={() => focus(session.instanceId)}
                  className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                >
                  ● Session active — Focus
                </button>
              ) : (
                <button
                  disabled={!canConnect}
                  onClick={() =>
                    openRemote(node.nodeId, node.displayName, OS_ICON_ID[node.os], node.connection.protocol)
                  }
                  title={entry.reason ?? undefined}
                  className="w-full rounded-md bg-info px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
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
    <div className="rounded-md bg-black/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-mono text-gray-200">{value}</div>
    </div>
  );
}
