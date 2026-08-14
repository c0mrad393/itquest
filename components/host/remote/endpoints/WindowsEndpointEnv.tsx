"use client";

/**
 * WindowsEndpointEnv — mini DeskOS 12 desktop (remote endpoint)
 * -----------------------------------------------------------------
 * Hyper-realistic Win11 shell: centered Mica taskbar, Start menu with Pinned
 * apps + Recommended files, a Quick Settings flyout (Wi-Fi / Volume / Battery),
 * and a real window manager driving This PC, folders, file viewers, credential
 * prompts, and the diagnostic tools. All mutations write to InfrastructureState.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { DesktopItem, EndpointFsItem, HostAppIconId, WindowsNodeState } from "@/lib/core";
import { DesktopIconGrid, WallpaperLayer, DEFAULT_VISUAL } from "./endpoint-shared";
import { EndpointBrowser, EndpointEventLog, EndpointTerminal } from "./EndpointTools";
import { useEndpointWM, renderEpBody, toFsItem, type EpWindow } from "./endpoint-fs";
import { AppIcon } from "@/components/ui/app-icons";

type ToolId = "taskmgr" | "network" | "cmd" | "browser" | "eventvwr";

const PINNED: { id: ToolId | "thispc"; label: string; icon: HostAppIconId }[] = [
  { id: "thispc", label: "This PC", icon: "disk" },
  { id: "taskmgr", label: "Task Manager", icon: "chart-bar" },
  { id: "network", label: "Network", icon: "globe" },
  { id: "cmd", label: "Terminal", icon: "terminal" },
  { id: "browser", label: "Edge", icon: "compass" },
  { id: "eventvwr", label: "Event Viewer", icon: "list" },
];

const TOOL_ICON: Record<ToolId, HostAppIconId> = {
  taskmgr: "chart-bar", network: "globe", cmd: "terminal", browser: "compass", eventvwr: "list",
};

export default function WindowsEndpointEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const wm = useEndpointWM("windows");
  const [startOpen, setStartOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  if (!node) return null;

  const visual = node.visualState ?? DEFAULT_VISUAL;
  const dark = visual.theme === "dark";

  function launchTool(id: ToolId) {
    wm.open({ id: `tool-${id}`, title: PINNED.find((p) => p.id === id)?.label ?? id, icon: TOOL_ICON[id], content: { kind: "app", appId: id } });
  }
  function onPinned(id: ToolId | "thispc") {
    setStartOpen(false);
    if (id === "thispc") wm.openSystem();
    else launchTool(id);
  }
  function openDesktopItem(item: DesktopItem) {
    if (item.kind === "app") {
      if (item.app === "edge") launchTool("browser");
      else if (item.app === "recycle-bin") wm.open({ id: "recycle", title: "Recycle Bin", icon: "recycle", content: { kind: "folder", items: [] } });
      else wm.open({ id: `app-${item.app}`, title: item.name, icon: "grid", content: { kind: "app", appId: `stub:${item.name}` } });
      return;
    }
    wm.openItem(toFsItem(item));
  }
  const renderApp = (appId: string) => renderTool(node.nodeId, appId);

  const closeMenus = () => { setStartOpen(false); setQuickOpen(false); };

  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans">
      <WallpaperLayer visual={visual} />

      {/* Desktop */}
      <div className="relative min-h-0 flex-1" onClick={closeMenus}>
        <DesktopIconGrid visual={visual} onOpen={openDesktopItem} />

        {wm.windows.map((win, i) => (
          <WinWindow key={win.id} win={win} index={i} dark={dark} focused={wm.focusId === win.id} onFocus={() => wm.focus(win.id)} onClose={() => wm.close(win.id)}>
            {renderEpBody(win, { nodeId: node.nodeId, variant: "windows", wm, renderApp })}
          </WinWindow>
        ))}

        {startOpen && <StartMenu node={node} onPinned={onPinned} onOpenFile={(it) => { setStartOpen(false); wm.openItem(it); }} />}
        {quickOpen && <QuickSettings nodeId={node.nodeId} />}
      </div>

      {/* Taskbar (centered, Mica) */}
      <div className="relative z-30 flex h-11 shrink-0 items-center border-t border-white/10 bg-black/45 px-3 backdrop-blur-md">
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setQuickOpen(false); setStartOpen((v) => !v); }}
            title="Start"
            className={`flex h-8 w-8 items-center justify-center rounded ${startOpen ? "bg-white/20" : "hover:bg-gray-500/15"}`}
          >
            <svg width="16" height="16" viewBox="0 0 18 18">
              <rect x="0" y="0" width="8" height="8" fill="#4cc2ff" /><rect x="10" y="0" width="8" height="8" fill="#4cc2ff" />
              <rect x="0" y="10" width="8" height="8" fill="#4cc2ff" /><rect x="10" y="10" width="8" height="8" fill="#4cc2ff" />
            </svg>
          </button>
          {PINNED.map((p) => {
            const winId = p.id === "thispc" ? "system" : `tool-${p.id}`;
            const isOpen = wm.windows.some((w) => w.id === winId);
            return (
              <button
                key={p.id}
                onClick={(e) => { e.stopPropagation(); onPinned(p.id); }}
                title={p.label}
                className={`relative flex h-8 w-8 items-center justify-center rounded text-base ${isOpen ? "bg-white/15" : "hover:bg-gray-500/15"}`}
              >
                <AppIcon id={p.icon} size={18} />
                {isOpen && <span className="absolute bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-info" />}
              </button>
            );
          })}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setStartOpen(false); setQuickOpen((v) => !v); }}
          className={`ml-auto flex items-center gap-2 rounded px-2 py-1 text-[11px] text-gray-200 ${quickOpen ? "bg-white/15" : "hover:bg-gray-500/15"}`}
          title="Quick settings"
        >
          <span title={netUp(node) ? "Connected" : "No network"} className={netUp(node) ? "" : "text-danger"}>
            <AppIcon id={netUp(node) ? "globe" : "ban"} size={13} />
          </span>
          <AppIcon id="activity" size={13} />
          <AppIcon id="battery" size={13} />
        </button>
        <div className="pl-3 text-right text-[10px] leading-tight text-gray-300">
          <div>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div>{node.edition}</div>
        </div>
      </div>
    </div>
  );
}

function netUp(node: WindowsNodeState): boolean {
  return node.network.interfaces.some((n) => n.up);
}

function renderTool(nodeId: string, appId: string): React.ReactNode {
  switch (appId) {
    case "taskmgr": return <TaskManager nodeId={nodeId} />;
    case "network": return <NetworkSettings nodeId={nodeId} />;
    case "cmd": return <EndpointTerminal nodeId={nodeId} flavor="win" />;
    case "browser": return <EndpointBrowser nodeId={nodeId} />;
    case "eventvwr": return <EndpointEventLog nodeId={nodeId} />;
    default: return <AppStub name={appId.replace(/^stub:/, "")} />;
  }
}

function AppStub({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel text-center">
      <div className="text-gray-600"><AppIcon id="grid" size={36} /></div>
      <div className="text-sm font-semibold text-gray-100">{name}</div>
      <div className="text-[11px] text-gray-500">Launching the {name} client… (full app arrives in a later build)</div>
    </div>
  );
}

// ── Win11 window chrome (cascaded, focus-raise) ──────────────────────────────

function WinWindow({
  win, index, dark, focused, onFocus, onClose, children,
}: {
  win: EpWindow; index: number; dark: boolean; focused: boolean; onFocus: () => void; onClose: () => void; children: React.ReactNode;
}) {
  void focused;
  const left = 44 + (index % 5) * 30;
  const top = 18 + (index % 5) * 26;
  return (
    <div
      className={`absolute flex h-[320px] w-[min(600px,88%)] flex-col overflow-hidden rounded-lg border shadow-2xl ${dark ? "border-edge bg-panel" : "border-gray-300 bg-white"}`}
      style={{ left: `${left}px`, top: `${top}px`, zIndex: win.z }}
      onMouseDown={onFocus}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs ${dark ? "border-edge bg-panelalt" : "border-gray-200 bg-gray-100"}`}>
        <AppIcon id={win.icon} size={13} />
        <span className={`truncate font-semibold ${dark ? "text-gray-200" : "text-gray-700"}`}>{win.title}</span>
        <button onClick={onClose} className="ml-auto flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ── Start menu (Pinned apps + Recommended files) ─────────────────────────────

function StartMenu({
  node, onPinned, onOpenFile,
}: {
  node: WindowsNodeState;
  onPinned: (id: ToolId | "thispc") => void;
  onOpenFile: (item: EndpointFsItem) => void;
}) {
  const visual = node.visualState ?? DEFAULT_VISUAL;
  const recommended: EndpointFsItem[] = [
    ...visual.desktop.filter((d) => d.kind !== "app").map(toFsItem),
    ...(visual.documents ?? []),
  ].slice(0, 6);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-14 left-1/2 z-40 w-[420px] -translate-x-1/2 rounded-xl border border-white/15 bg-sunken/70 p-4 shadow-2xl backdrop-blur-md"
    >
      <input placeholder="Search for apps, settings, and documents" className="mb-4 w-full rounded-full border border-white/10 bg-gray-500/15 px-4 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-400" />
      <div className="mb-2 text-[11px] font-semibold text-gray-200">Pinned</div>
      <div className="mb-4 grid grid-cols-6 gap-2">
        {PINNED.map((p) => (
          <button key={p.id} onClick={() => onPinned(p.id)} className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-gray-500/15">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300"><AppIcon id={p.icon} size={19} /></span>
            <span className="w-full truncate text-center text-[9px] text-gray-300">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="mb-2 text-[11px] font-semibold text-gray-200">Recommended</div>
      <div className="grid grid-cols-2 gap-1">
        {recommended.map((it) => (
          <button key={it.id} onClick={() => onOpenFile(it)} className="flex items-center gap-2 rounded-md p-2 text-left hover:bg-gray-500/15">
            <span className="text-lg"><AppIcon id={it.isFolder ? "folder" : "file-text"} size={16} /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-gray-100">{it.name}</span>
              <span className="block text-[9px] text-gray-500">Recently used</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-gray-200">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info/30"><AppIcon id="user" size={15} /></span>
        <span className="truncate">{visual.loggedInUser}</span>
        <span className="ml-auto text-gray-400">⏻</span>
      </div>
    </div>
  );
}

// ── Quick Settings flyout ────────────────────────────────────────────────────

function QuickSettings({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState;
  const setUp = useInfraStore((s) => s.setNodeInterfaceUp);
  const [volume, setVolume] = useState(60);
  const nic = node.network.interfaces[0];
  const wifiOn = node.network.interfaces.some((n) => n.up);
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute bottom-14 right-2 z-40 w-64 rounded-xl border border-white/15 bg-sunken/70 p-3 text-xs text-gray-100 shadow-2xl backdrop-blur-md">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => nic && setUp(node.nodeId, nic.name, !wifiOn)}
          className={`flex flex-col items-start gap-1 rounded-lg p-2 ${wifiOn ? "bg-info/70 text-black" : "bg-gray-500/15"}`}
        >
          <span className="text-base"><AppIcon id="globe" size={14} /></span>
          <span className="text-[10px] font-semibold">Wi-Fi</span>
          <span className="text-[9px] opacity-80">{wifiOn ? "Connected" : "Off"}</span>
        </button>
        <div className="flex flex-col items-start gap-1 rounded-lg bg-gray-500/15 p-2">
          <span className="text-base"><AppIcon id="battery" size={14} /></span>
          <span className="text-[10px] font-semibold">Battery</span>
          <span className="text-[9px] opacity-80">87% · plugged in</span>
        </div>
      </div>
      <div className="rounded-lg bg-gray-500/15 p-2">
        <div className="mb-1 flex items-center gap-2">
          <span><AppIcon id="activity" size={14} /></span>
          <span className="text-[10px]">Volume</span>
          <span className="ml-auto text-[10px] text-gray-400">{volume}%</span>
        </div>
        <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-info" />
      </div>
    </div>
  );
}

// ── Task Manager ─────────────────────────────────────────────────────────────

function TaskManager({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState;
  const killProcess = useInfraStore((s) => s.killProcess);
  const procs = [...node.processes].sort((a, b) => b.cpu - a.cpu);
  return (
    <div className="h-full overflow-y-auto text-xs">
      <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Name</span><span className="text-right">CPU</span><span className="text-right">Memory</span><span className="text-right">Action</span>
      </div>
      {procs.map((p) => {
        const hot = p.cpu >= 40;
        return (
          <div key={p.pid} className={`grid grid-cols-[1fr_60px_60px_70px] items-center gap-2 border-b border-edge/50 px-3 py-1.5 ${hot ? "bg-danger/10" : ""}`}>
            <span className="min-w-0"><span className="block truncate text-gray-100">{p.command}</span><span className="block font-mono text-[10px] text-gray-500">PID {p.pid} · {p.user}</span></span>
            <span className={`text-right font-mono ${hot ? "font-bold text-danger" : "text-gray-300"}`}>{p.cpu.toFixed(1)}%</span>
            <span className="text-right font-mono text-gray-400">{p.mem.toFixed(1)}%</span>
            <span className="text-right"><button onClick={() => killProcess(node.nodeId, p.pid)} className="rounded border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/15">End task</button></span>
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
  const [dnsDraft, setDnsDraft] = useState(node.network.dnsServers.join(", "));
  return (
    <div className="h-full space-y-3 overflow-y-auto p-3 text-xs">
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
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">DNS servers</div>
        <div className="flex gap-1">
          <input value={dnsDraft} onChange={(e) => setDnsDraft(e.target.value)} className="flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-gray-200 outline-none focus:border-info" />
          <button onClick={() => setDns(node.nodeId, dnsDraft.split(",").map((d) => d.trim()).filter(Boolean))} className="rounded bg-info px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110">Apply</button>
        </div>
      </div>
    </div>
  );
}
