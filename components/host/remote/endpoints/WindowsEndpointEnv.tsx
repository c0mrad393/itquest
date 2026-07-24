"use client";

/**
 * WindowsEndpointEnv — mini Windows 10/11 desktop (remote endpoint)
 * -----------------------------------------------------------------
 * Procedural: renders the node's visualState (wallpaper, theme, scattered
 * department desktop files). Toolset:
 *   Task Manager · Network Settings · Command Prompt · Web Browser · Event Viewer
 * Every mutating action writes to InfrastructureState so the reconciler fixes
 * tickets automatically.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState } from "@/lib/core";
import { DesktopIconGrid, WallpaperLayer, DEFAULT_VISUAL } from "./endpoint-shared";
import { EndpointBrowser, EndpointEventLog, EndpointTerminal } from "./EndpointTools";

type AppId = "taskmgr" | "network" | "cmd" | "browser" | "eventvwr";

const APPS: { id: AppId; label: string; icon: string }[] = [
  { id: "taskmgr", label: "Task Manager", icon: "📊" },
  { id: "network", label: "Network Settings", icon: "🖧" },
  { id: "cmd", label: "Command Prompt", icon: "⌨️" },
  { id: "browser", label: "Edge", icon: "🌐" },
  { id: "eventvwr", label: "Event Viewer", icon: "📑" },
];

export default function WindowsEndpointEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [openApps, setOpenApps] = useState<AppId[]>([]);
  const [active, setActive] = useState<AppId | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  if (!node) return null;

  const visual = node.visualState ?? DEFAULT_VISUAL;
  const dark = visual.theme === "dark";

  function launch(id: AppId) {
    setOpenApps((a) => (a.includes(id) ? a : [...a, id]));
    setActive(id);
    setStartOpen(false);
  }
  function close(id: AppId) {
    setOpenApps((a) => a.filter((x) => x !== id));
    setActive((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans">
      <WallpaperLayer visual={visual} />

      {/* Desktop */}
      <div className="relative flex-1" onClick={() => setStartOpen(false)}>
        <DesktopIconGrid visual={visual} />

        {openApps.map((id) => (
          <AppWindow
            key={id}
            app={APPS.find((a) => a.id === id)!}
            dark={dark}
            focused={active === id}
            onFocus={() => setActive(id)}
            onClose={() => close(id)}
          >
            {renderApp(id, node.nodeId)}
          </AppWindow>
        ))}

        {startOpen && (
          <div className="absolute bottom-10 left-2 z-30 w-56 rounded-lg border border-edge bg-panel/95 p-2 shadow-2xl backdrop-blur">
            <div className="mb-1 px-2 text-[10px] uppercase tracking-wider text-gray-500">
              {node.hostname} · {visual.loggedInUser}
            </div>
            {APPS.map((a) => (
              <button
                key={a.id}
                onClick={() => launch(a.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-white/10"
              >
                <span>{a.icon}</span> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Taskbar */}
      <div className="relative z-20 flex h-9 shrink-0 items-center gap-1 border-t border-white/10 bg-black/55 px-2 backdrop-blur">
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
        {APPS.map((a) => {
          const isOpen = openApps.includes(a.id);
          return (
            <button
              key={a.id}
              onClick={() => (isOpen ? setActive(a.id) : launch(a.id))}
              title={a.label}
              className={`relative flex h-7 items-center gap-1 rounded px-2 text-[11px] ${
                active === a.id ? "bg-white/15 text-gray-100" : "text-gray-300 hover:bg-white/10"
              }`}
            >
              <span>{a.icon}</span>
              {isOpen && <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-info" />}
            </button>
          );
        })}
        <span className="ml-auto pr-1 text-[10px] text-gray-400">{node.edition}</span>
      </div>
    </div>
  );
}

function renderApp(id: AppId, nodeId: string) {
  switch (id) {
    case "taskmgr": return <TaskManager nodeId={nodeId} />;
    case "network": return <NetworkSettings nodeId={nodeId} />;
    case "cmd": return <EndpointTerminal nodeId={nodeId} flavor="win" />;
    case "browser": return <EndpointBrowser nodeId={nodeId} />;
    case "eventvwr": return <EndpointEventLog nodeId={nodeId} />;
  }
}

// ── Draggable app window (Win11 chrome) ──────────────────────────────────────

function AppWindow({
  app,
  dark,
  focused,
  onFocus,
  onClose,
  children,
}: {
  app: { id: string; label: string; icon: string };
  dark: boolean;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute left-1/2 top-6 flex h-[320px] w-[min(560px,90%)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border shadow-2xl ${
        dark ? "border-edge bg-panel" : "border-gray-300 bg-white"
      }`}
      style={{ zIndex: focused ? 15 : 12 }}
      onMouseDown={onFocus}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs ${dark ? "border-edge bg-panelalt" : "border-gray-200 bg-gray-100"}`}>
        <span>{app.icon}</span>
        <span className={`font-semibold ${dark ? "text-gray-200" : "text-gray-700"}`}>{app.label}</span>
        <button onClick={onClose} className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ── Task Manager ─────────────────────────────────────────────────────────────

function TaskManager({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState;
  const killProcess = useInfraStore((s) => s.killProcess);
  const procs = [...node.processes].sort((a, b) => b.cpu - a.cpu);
  return (
    <div className="h-full overflow-y-auto term-scroll text-xs">
      <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Name</span><span className="text-right">CPU</span><span className="text-right">Memory</span><span className="text-right">Action</span>
      </div>
      {procs.map((p) => {
        const hot = p.cpu >= 40;
        return (
          <div key={p.pid} className={`grid grid-cols-[1fr_60px_60px_70px] items-center gap-2 border-b border-edge/50 px-3 py-1.5 ${hot ? "bg-danger/10" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate text-gray-100">{p.command}</span>
              <span className="block font-mono text-[10px] text-gray-500">PID {p.pid} · {p.user}</span>
            </span>
            <span className={`text-right font-mono ${hot ? "font-bold text-danger" : "text-gray-300"}`}>{p.cpu.toFixed(1)}%</span>
            <span className="text-right font-mono text-gray-400">{p.mem.toFixed(1)}%</span>
            <span className="text-right">
              <button onClick={() => killProcess(node.nodeId, p.pid)} className="rounded border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/15">End task</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Network Settings ─────────────────────────────────────────────────────────

function NetworkSettings({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState;
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const setDns = useInfraStore((s) => s.setNodeDns);
  const setIp = useInfraStore((s) => s.setNodeIpv4);
  const [dnsDraft, setDnsDraft] = useState(node.network.dnsServers.join(", "));
  const [ipDraft, setIpDraft] = useState(node.network.interfaces[0]?.ipv4 ?? "");

  return (
    <div className="h-full space-y-3 overflow-y-auto term-scroll p-3 text-xs">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Adapters</div>
        {node.network.interfaces.map((nic) => (
          <div key={nic.name} className="mb-1 flex items-center gap-2 rounded border border-edge/60 bg-panelalt px-2 py-1.5">
            <span className="text-gray-100">{nic.name}</span>
            <span className="font-mono text-[10px] text-gray-500">{nic.ipv4 ?? "—"}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${nic.up ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>{nic.up ? "Enabled" : "Disabled"}</span>
            <button onClick={() => setUp(node.nodeId, nic.name, !nic.up)} className="rounded border border-edge px-2 py-0.5 text-[10px] text-gray-200 hover:bg-edge">{nic.up ? "Disable" : "Enable"}</button>
          </div>
        ))}
      </div>
      <Field label="IPv4 address" value={ipDraft} onChange={setIpDraft} onApply={() => node.network.interfaces[0] && setIp(node.nodeId, node.network.interfaces[0].name, ipDraft.trim())} />
      <Field label="DNS servers" value={dnsDraft} onChange={setDnsDraft} onApply={() => setDns(node.nodeId, dnsDraft.split(",").map((d) => d.trim()).filter(Boolean))} placeholder="10.0.1.10, 1.1.1.1" />
    </div>
  );
}

function Field({ label, value, onChange, onApply, placeholder }: { label: string; value: string; onChange: (v: string) => void; onApply: () => void; placeholder?: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="flex gap-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-info" />
        <button onClick={onApply} className="rounded bg-info px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110">Apply</button>
      </div>
    </div>
  );
}
