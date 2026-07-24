"use client";

/**
 * MacOSEndpointEnv — mini macOS desktop (remote endpoint)
 * -------------------------------------------------------
 * Procedural visuals (wallpaper/theme/scattered department files) + a Dock of
 * troubleshooting apps: Activity Monitor · System Settings · Terminal ·
 * Safari · Console. All mutations write to InfrastructureState.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { MacNodeState } from "@/lib/core";
import { DesktopIconGrid, WallpaperLayer, DEFAULT_VISUAL } from "./endpoint-shared";
import { EndpointBrowser, EndpointEventLog, EndpointTerminal } from "./EndpointTools";

type AppId = "activity" | "settings" | "terminal" | "safari" | "console";

const DOCK: { id: AppId; label: string; icon: string }[] = [
  { id: "activity", label: "Activity Monitor", icon: "📈" },
  { id: "settings", label: "System Settings", icon: "⚙️" },
  { id: "terminal", label: "Terminal", icon: "⌨️" },
  { id: "safari", label: "Safari", icon: "🧭" },
  { id: "console", label: "Console", icon: "📋" },
];

export default function MacOSEndpointEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as MacNodeState | undefined;
  const [openApps, setOpenApps] = useState<AppId[]>([]);
  const [active, setActive] = useState<AppId | null>(null);
  if (!node) return null;

  const visual = node.visualState ?? DEFAULT_VISUAL;
  const dark = visual.theme === "dark";
  const activeMeta = DOCK.find((d) => d.id === active);

  function launch(id: AppId) {
    setOpenApps((a) => (a.includes(id) ? a : [...a, id]));
    setActive(id);
  }
  function close(id: AppId) {
    setOpenApps((a) => a.filter((x) => x !== id));
    setActive((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans">
      <WallpaperLayer visual={visual} />

      {/* Menu bar */}
      <div className="relative z-30 flex h-6 shrink-0 items-center gap-3 bg-black/35 px-3 text-[11px] text-gray-100 backdrop-blur">
        <span className="text-sm leading-none"></span>
        <span className="font-semibold">{activeMeta?.label ?? "Finder"}</span>
        <span className="text-gray-300">File</span>
        <span className="text-gray-300">Edit</span>
        <span className="text-gray-300">View</span>
        <span className="ml-auto flex items-center gap-2 text-gray-200">
          <span title={node.wifiEnabled ? "Wi-Fi on" : "Wi-Fi off"}>{node.wifiEnabled ? "📶" : "🚫"}</span>
          <span>{visual.loggedInUser}</span>
        </span>
      </div>

      {/* Desktop */}
      <div className="relative min-h-0 flex-1">
        <DesktopIconGrid visual={visual} />

        {openApps.map((id) => (
          <MacWindow
            key={id}
            app={DOCK.find((a) => a.id === id)!}
            dark={dark}
            focused={active === id}
            onFocus={() => setActive(id)}
            onClose={() => close(id)}
          >
            {renderApp(id, node.nodeId)}
          </MacWindow>
        ))}
      </div>

      {/* Dock */}
      <div className="relative z-30 flex shrink-0 justify-center pb-2">
        <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-xl">
          {DOCK.map((d) => (
            <button
              key={d.id}
              onClick={() => (openApps.includes(d.id) ? setActive(d.id) : launch(d.id))}
              title={d.label}
              className={`flex flex-col items-center transition-transform hover:-translate-y-1 ${active === d.id ? "-translate-y-1" : ""}`}
            >
              <span className="text-2xl">{d.icon}</span>
              <span className={`mt-0.5 h-1 w-1 rounded-full ${openApps.includes(d.id) ? "bg-white" : "bg-transparent"}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderApp(id: AppId, nodeId: string) {
  switch (id) {
    case "activity": return <ActivityMonitor nodeId={nodeId} />;
    case "settings": return <SystemSettings nodeId={nodeId} />;
    case "terminal": return <EndpointTerminal nodeId={nodeId} flavor="unix" />;
    case "safari": return <EndpointBrowser nodeId={nodeId} />;
    case "console": return <EndpointEventLog nodeId={nodeId} />;
  }
}

// ── macOS window chrome (traffic lights) ─────────────────────────────────────

function MacWindow({
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
      className={`absolute left-1/2 top-5 flex h-[300px] w-[min(580px,92%)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl backdrop-blur ${
        dark ? "border-white/15 bg-panel/95" : "border-gray-300 bg-white/95"
      }`}
      style={{ zIndex: focused ? 20 : 15 }}
      onMouseDown={onFocus}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-2 ${dark ? "border-edge bg-panelalt" : "border-gray-200 bg-gray-100"}`}>
        <span className="flex gap-1.5">
          <button onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57]" aria-label="Close" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className={`ml-1 text-xs font-semibold ${dark ? "text-gray-200" : "text-gray-700"}`}>{app.label}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ── Activity Monitor ─────────────────────────────────────────────────────────

function ActivityMonitor({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as MacNodeState;
  const killProcess = useInfraStore((s) => s.killProcess);
  const procs = [...node.processes].sort((a, b) => b.cpu - a.cpu);
  return (
    <div className="h-full overflow-y-auto term-scroll text-xs">
      <div className="grid grid-cols-[1fr_60px_60px_80px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Process Name</span><span className="text-right">% CPU</span><span className="text-right">Memory</span><span className="text-right">Action</span>
      </div>
      {procs.map((p) => {
        const hot = p.cpu >= 40;
        return (
          <div key={p.pid} className={`grid grid-cols-[1fr_60px_60px_80px] items-center gap-2 border-b border-edge/50 px-3 py-1.5 ${hot ? "bg-danger/10" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate text-gray-100">{p.command}</span>
              <span className="block font-mono text-[10px] text-gray-500">PID {p.pid} · {p.user}</span>
            </span>
            <span className={`text-right font-mono ${hot ? "font-bold text-danger" : "text-gray-300"}`}>{p.cpu.toFixed(1)}</span>
            <span className="text-right font-mono text-gray-400">{p.mem.toFixed(1)}%</span>
            <span className="text-right">
              <button onClick={() => killProcess(node.nodeId, p.pid)} className="rounded-full border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/15">Force Quit</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── System Settings ──────────────────────────────────────────────────────────

function SystemSettings({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as MacNodeState;
  const setWifi = useInfraStore((s) => s.setMacWifi);
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const setDns = useInfraStore((s) => s.setNodeDns);
  const [dnsDraft, setDnsDraft] = useState(node.network.dnsServers.join(", "));

  return (
    <div className="h-full space-y-3 overflow-y-auto term-scroll p-3 text-xs">
      <div className="flex items-center gap-3 rounded-lg border border-edge/60 bg-panelalt px-3 py-2.5">
        <span className="text-lg">📶</span>
        <div className="flex-1">
          <div className="text-gray-100">Wi-Fi</div>
          <div className="text-[10px] text-gray-500">{node.wifiEnabled ? "Connected · corp-secure" : "Turned off"}</div>
        </div>
        <button onClick={() => setWifi(node.nodeId, !node.wifiEnabled)} className={`relative h-6 w-11 rounded-full transition ${node.wifiEnabled ? "bg-emerald-500/70" : "bg-edge"}`} aria-label="Toggle Wi-Fi">
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${node.wifiEnabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Network</div>
        {node.network.interfaces.map((nic) => (
          <div key={nic.name} className="mb-1 flex items-center gap-2 rounded border border-edge/60 bg-panelalt px-2 py-1.5">
            <span className="text-gray-100">{nic.name}</span>
            <span className="font-mono text-[10px] text-gray-500">{nic.ipv4 ?? "—"}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${nic.up ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>{nic.up ? "Connected" : "Inactive"}</span>
            <button onClick={() => setUp(node.nodeId, nic.name, !nic.up)} className="rounded border border-edge px-2 py-0.5 text-[10px] text-gray-200 hover:bg-edge">{nic.up ? "Turn Off" : "Turn On"}</button>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">DNS servers</div>
        <div className="flex gap-1">
          <input value={dnsDraft} onChange={(e) => setDnsDraft(e.target.value)} className="flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-200 outline-none focus:border-info" />
          <button onClick={() => setDns(node.nodeId, dnsDraft.split(",").map((d) => d.trim()).filter(Boolean))} className="rounded bg-info px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110">Apply</button>
        </div>
      </div>

      <div className="text-[10px] text-gray-600">{node.productName} · Build {node.build}</div>
    </div>
  );
}
