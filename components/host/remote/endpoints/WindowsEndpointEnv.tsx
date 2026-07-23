"use client";

/**
 * WindowsEndpointEnv — mini Windows 10/11 desktop (remote endpoint)
 * -----------------------------------------------------------------
 * Rendered inside a TriageRemote RDP session to a Windows client node.
 * Desktop + Start menu + taskbar, with two troubleshooting apps:
 *   • Task Manager     — end rogue / high-CPU processes
 *   • Network Settings — enable/disable adapters, change IP + DNS
 *
 * Every action writes through useInfraStore to the shared InfrastructureState,
 * so the TicketReconciler picks up fixes automatically.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState } from "@/lib/core";

type AppId = "taskmgr" | "network" | null;

export default function WindowsEndpointEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [app, setApp] = useState<AppId>(null);
  const [startOpen, setStartOpen] = useState(false);

  if (!node) return null;

  const APPS: { id: Exclude<AppId, null>; label: string; icon: string }[] = [
    { id: "taskmgr", label: "Task Manager", icon: "📊" },
    { id: "network", label: "Network Settings", icon: "🖧" },
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-[#0a2547] to-[#123a63] font-sans">
      {/* Wallpaper watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[6vw] font-black text-white/[0.04]">{node.hostname}</span>
      </div>

      {/* Desktop icons */}
      <div className="relative flex-1 p-3" onClick={() => setStartOpen(false)}>
        <div className="flex w-20 flex-col gap-3">
          {APPS.map((a) => (
            <button
              key={a.id}
              onDoubleClick={() => setApp(a.id)}
              onClick={() => setApp(a.id)}
              className="flex flex-col items-center gap-1 rounded p-2 text-center hover:bg-white/10"
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="text-[10px] leading-tight text-gray-100 drop-shadow">{a.label}</span>
            </button>
          ))}
        </div>

        {/* App window */}
        {app && (
          <div className="absolute left-1/2 top-6 w-[min(560px,88%)] -translate-x-1/2 overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl">
            <div className="flex items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-xs">
              <span>{APPS.find((a) => a.id === app)?.icon}</span>
              <span className="font-semibold text-gray-200">
                {APPS.find((a) => a.id === app)?.label}
              </span>
              <button
                onClick={() => setApp(null)}
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto term-scroll">
              {app === "taskmgr" ? <TaskManager node={node} /> : <NetworkSettings node={node} />}
            </div>
          </div>
        )}

        {/* Start menu */}
        {startOpen && (
          <div className="absolute bottom-10 left-2 w-56 rounded-lg border border-edge bg-panel/95 p-2 shadow-2xl backdrop-blur">
            <div className="mb-1 px-2 text-[10px] uppercase tracking-wider text-gray-500">Tools</div>
            {APPS.map((a) => (
              <button
                key={a.id}
                onClick={() => { setApp(a.id); setStartOpen(false); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-white/10"
              >
                <span>{a.icon}</span> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Taskbar */}
      <div className="relative flex h-9 shrink-0 items-center gap-2 border-t border-white/10 bg-black/50 px-2 backdrop-blur">
        <button
          onClick={(e) => { e.stopPropagation(); setStartOpen((v) => !v); }}
          className={`flex h-7 w-7 items-center justify-center rounded ${startOpen ? "bg-white/15" : "hover:bg-white/10"}`}
          aria-label="Start"
        >
          <svg width="14" height="14" viewBox="0 0 18 18">
            <rect x="0" y="0" width="8" height="8" fill="#4cc2ff" />
            <rect x="10" y="0" width="8" height="8" fill="#4cc2ff" />
            <rect x="0" y="10" width="8" height="8" fill="#4cc2ff" />
            <rect x="10" y="10" width="8" height="8" fill="#4cc2ff" />
          </svg>
        </button>
        {APPS.map((a) => (
          <button
            key={a.id}
            onClick={() => setApp(a.id)}
            className={`flex h-7 items-center gap-1 rounded px-2 text-[11px] ${
              app === a.id ? "bg-white/15 text-gray-100" : "text-gray-300 hover:bg-white/10"
            }`}
          >
            <span>{a.icon}</span>
            <span className="hidden sm:inline">{a.label}</span>
          </button>
        ))}
        <span className="ml-auto pr-1 text-[10px] text-gray-400">{node.edition}</span>
      </div>
    </div>
  );
}

// ── Task Manager ────────────────────────────────────────────────────────────

function TaskManager({ node }: { node: WindowsNodeState }) {
  const killProcess = useInfraStore((s) => s.killProcess);
  const procs = [...node.processes].sort((a, b) => b.cpu - a.cpu);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Name</span>
        <span className="text-right">CPU</span>
        <span className="text-right">Memory</span>
        <span className="text-right">Action</span>
      </div>
      {procs.map((p) => {
        const hot = p.cpu >= 40;
        return (
          <div
            key={p.pid}
            className={`grid grid-cols-[1fr_60px_60px_70px] items-center gap-2 border-b border-edge/50 px-3 py-1.5 ${
              hot ? "bg-danger/10" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-gray-100">{p.command}</span>
              <span className="block font-mono text-[10px] text-gray-500">PID {p.pid} · {p.user}</span>
            </span>
            <span className={`text-right font-mono ${hot ? "font-bold text-danger" : "text-gray-300"}`}>
              {p.cpu.toFixed(1)}%
            </span>
            <span className="text-right font-mono text-gray-400">{p.mem.toFixed(1)}%</span>
            <span className="text-right">
              <button
                onClick={() => killProcess(node.nodeId, p.pid)}
                className="rounded border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/15"
              >
                End task
              </button>
            </span>
          </div>
        );
      })}
      {procs.length === 0 && <div className="p-4 text-center text-gray-600">No processes running.</div>}
    </div>
  );
}

// ── Network Settings ────────────────────────────────────────────────────────

function NetworkSettings({ node }: { node: WindowsNodeState }) {
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const setDns = useInfraStore((s) => s.setNodeDns);
  const setIp = useInfraStore((s) => s.setNodeIpv4);
  const [dnsDraft, setDnsDraft] = useState(node.network.dnsServers.join(", "));
  const [ipDraft, setIpDraft] = useState(node.network.interfaces[0]?.ipv4 ?? "");

  return (
    <div className="space-y-3 p-3 text-xs">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Adapters</div>
        {node.network.interfaces.map((nic) => (
          <div key={nic.name} className="mb-1 flex items-center gap-2 rounded border border-edge/60 bg-panelalt px-2 py-1.5">
            <span className="text-gray-100">{nic.name}</span>
            <span className="font-mono text-[10px] text-gray-500">{nic.ipv4 ?? "—"}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${nic.up ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
              {nic.up ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={() => setUp(node.nodeId, nic.name, !nic.up)}
              className="rounded border border-edge px-2 py-0.5 text-[10px] text-gray-200 hover:bg-edge"
            >
              {nic.up ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">IPv4 address</div>
        <div className="flex gap-1">
          <input
            value={ipDraft}
            onChange={(e) => setIpDraft(e.target.value)}
            className="flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none focus:border-info"
          />
          <button
            onClick={() => node.network.interfaces[0] && setIp(node.nodeId, node.network.interfaces[0].name, ipDraft.trim())}
            className="rounded bg-info px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">DNS servers</div>
        <div className="flex gap-1">
          <input
            value={dnsDraft}
            onChange={(e) => setDnsDraft(e.target.value)}
            placeholder="10.0.1.10, 1.1.1.1"
            className="flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
          />
          <button
            onClick={() => setDns(node.nodeId, dnsDraft.split(",").map((d) => d.trim()).filter(Boolean))}
            className="rounded bg-info px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
