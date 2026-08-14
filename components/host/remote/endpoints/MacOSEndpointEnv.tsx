"use client";

/**
 * MacOSEndpointEnv — mini macOS desktop (remote endpoint)
 * -------------------------------------------------------
 * Realistic Apple shell: a top Menu Bar with working dropdowns (, File, Edit,
 * View, Go), a frosted-glass Dock, Spotlight (⌘Space), Finder, and a window
 * manager driving folders / file viewers / credential prompts. All mutations
 * write to InfrastructureState.
 */

import { useEffect, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { DesktopItem, EndpointFsItem, MacNodeState } from "@/lib/core";
import { DesktopIconGrid, WallpaperLayer, DEFAULT_VISUAL } from "./endpoint-shared";
import { EndpointBrowser, EndpointEventLog, EndpointTerminal } from "./EndpointTools";
import { useEndpointWM, renderEpBody, toFsItem, type EpWindow } from "./endpoint-fs";
import type { HostAppIconId } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";

type DockId = "finder" | "activity" | "settings" | "terminal" | "safari" | "console";

const DOCK: { id: DockId; label: string; icon: HostAppIconId }[] = [
  { id: "finder", label: "Finder", icon: "folder" },
  { id: "activity", label: "Activity Monitor", icon: "activity" },
  { id: "settings", label: "System Settings", icon: "gear" },
  { id: "terminal", label: "Terminal", icon: "terminal" },
  { id: "safari", label: "Safari", icon: "compass" },
  { id: "console", label: "Console", icon: "list" },
];

const TOOL_ICON: Record<Exclude<DockId, "finder">, HostAppIconId> = {
  activity: "activity", settings: "gear", terminal: "terminal", safari: "compass", console: "list",
};

export default function MacOSEndpointEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as MacNodeState | undefined;
  const wm = useEndpointWM("macos");
  const [menu, setMenu] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && (e.code === "Space" || e.key === " ")) { e.preventDefault(); setSpotlight((v) => !v); }
      if (e.key === "Escape") setSpotlight(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!node) return null;
  const visual = node.visualState ?? DEFAULT_VISUAL;
  const dark = visual.theme === "dark";

  function launchTool(id: Exclude<DockId, "finder">) {
    wm.open({ id: `tool-${id}`, title: DOCK.find((d) => d.id === id)?.label ?? id, icon: TOOL_ICON[id], content: { kind: "app", appId: id } });
  }
  function onDock(id: DockId) {
    if (id === "finder") wm.openSystem();
    else launchTool(id);
  }
  function openDesktopItem(item: DesktopItem) {
    if (item.kind === "app") {
      if (item.app === "edge") launchTool("safari");
      else wm.open({ id: `app-${item.app}`, title: item.name, icon: "grid", content: { kind: "app", appId: `stub:${item.name}` } });
      return;
    }
    wm.openItem(toFsItem(item));
  }
  const renderApp = (appId: string) => renderTool(node.nodeId, appId);
  const activeApp = DOCK.find((d) => `tool-${d.id}` === wm.focusId || (wm.focusId === "system" && d.id === "finder"));

  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans" onClick={() => setMenu(null)}>
      <WallpaperLayer visual={visual} />

      {/* Menu bar */}
      <MenuBar
        appName={activeApp?.label ?? "Finder"}
        node={node}
        openMenu={menu}
        setMenu={setMenu}
        onFinder={() => wm.openSystem()}
        onSettings={() => launchTool("settings")}
        onSpotlight={() => setSpotlight(true)}
      />

      {/* Desktop */}
      <div className="relative min-h-0 flex-1">
        <DesktopIconGrid visual={visual} onOpen={openDesktopItem} />

        {wm.windows.map((win, i) => (
          <MacWindow key={win.id} win={win} index={i} dark={dark} onFocus={() => wm.focus(win.id)} onClose={() => wm.close(win.id)}>
            {renderEpBody(win, { nodeId: node.nodeId, variant: "macos", wm, renderApp })}
          </MacWindow>
        ))}

        {spotlight && <Spotlight node={node} onClose={() => setSpotlight(false)} onOpen={(it) => { setSpotlight(false); wm.openItem(it); }} />}
      </div>

      {/* Dock */}
      <div className="relative z-30 flex shrink-0 justify-center pb-2">
        <div className="flex items-end gap-2 rounded-2xl border border-white/20 bg-white/15 px-3 py-1.5 shadow-2xl backdrop-blur-md">
          {DOCK.map((d) => {
            const winId = d.id === "finder" ? "system" : `tool-${d.id}`;
            const isOpen = wm.windows.some((w) => w.id === winId);
            return (
              <button
                key={d.id}
                onClick={() => onDock(d.id)}
                title={d.label}
                className="flex flex-col items-center transition-transform hover:-translate-y-1.5"
              >
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/80 text-slate-700 shadow ring-1 ring-black/10"><AppIcon id={d.icon} size={17} /></span>
                <span className={`mt-0.5 h-1 w-1 rounded-full ${isOpen ? "bg-white" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderTool(nodeId: string, appId: string): React.ReactNode {
  switch (appId) {
    case "activity": return <ActivityMonitor nodeId={nodeId} />;
    case "settings": return <SystemSettings nodeId={nodeId} />;
    case "terminal": return <EndpointTerminal nodeId={nodeId} flavor="unix" />;
    case "safari": return <EndpointBrowser nodeId={nodeId} />;
    case "console": return <EndpointEventLog nodeId={nodeId} />;
    default: return <AppStub name={appId.replace(/^stub:/, "")} />;
  }
}

function AppStub({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel text-center">
      <div className="text-4xl"><AppIcon id="grid" size={36} /></div>
      <div className="text-sm font-semibold text-gray-100">{name}</div>
      <div className="text-[11px] text-gray-500">Opening {name}… (full app arrives in a later build)</div>
    </div>
  );
}

// ── Menu bar with working dropdowns ──────────────────────────────────────────

function MenuBar({
  appName, node, openMenu, setMenu, onFinder, onSettings, onSpotlight,
}: {
  appName: string;
  node: MacNodeState;
  openMenu: string | null;
  setMenu: (m: string | null) => void;
  onFinder: () => void;
  onSettings: () => void;
  onSpotlight: () => void;
}) {
  const menus: Record<string, { label: string; onClick?: () => void }[]> = {
    "": [
      { label: "About This Mac", onClick: onSettings },
      { label: "System Settings…", onClick: onSettings },
      { label: "Sleep" },
      { label: "Restart…" },
      { label: "Shut Down…" },
    ],
    app: [
      { label: `About ${appName}` },
      { label: "Settings…", onClick: onSettings },
      { label: `Hide ${appName}` },
      { label: `Quit ${appName}` },
    ],
    File: [
      { label: "New Finder Window", onClick: onFinder },
      { label: "New Folder" },
      { label: "Open" },
      { label: "Close Window" },
    ],
    Edit: [{ label: "Undo" }, { label: "Redo" }, { label: "Cut" }, { label: "Copy" }, { label: "Paste" }],
    View: [{ label: "as Icons" }, { label: "as List" }, { label: "Show Path Bar" }, { label: "Show Status Bar" }],
    Go: [
      { label: "Computer", onClick: onFinder },
      { label: "Home", onClick: onFinder },
      { label: "Applications", onClick: onFinder },
      { label: "Network", onClick: onFinder },
    ],
  };
  const labels = ["", "app", "File", "Edit", "View", "Go"];
  return (
    <div className="relative z-40 flex h-6 shrink-0 items-center gap-1 bg-black/40 px-2 text-[11px] text-gray-100 backdrop-blur-md">
      {labels.map((l) => (
        <div key={l} className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenu(openMenu === l ? null : l)}
            className={`rounded px-2 py-0.5 ${openMenu === l ? "bg-white/25" : "hover:bg-white/15"} ${l === "" ? "text-sm" : ""} ${l === "app" ? "font-semibold" : ""}`}
          >
            {l === "" ? "" : l === "app" ? appName : l}
          </button>
          {openMenu === l && (
            <div className="absolute left-0 top-6 min-w-[200px] rounded-lg border border-white/15 bg-black/70 p-1 shadow-2xl backdrop-blur-md">
              {menus[l].map((it, idx) => (
                <button
                  key={idx}
                  onClick={() => { it.onClick?.(); setMenu(null); }}
                  className="block w-full rounded px-3 py-1 text-left text-[11px] text-gray-100 hover:bg-info/70"
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <span className="ml-auto flex items-center gap-3 pr-1">
        <button onClick={(e) => { e.stopPropagation(); onSpotlight(); }} title="Spotlight (⌘Space)" className="hover:opacity-80"><AppIcon id="search" size={16} /></button>
        <span title={node.wifiEnabled ? "Wi-Fi on" : "Wi-Fi off"}><AppIcon id={node.wifiEnabled ? "globe" : "ban"} size={14} /></span>
        <span><AppIcon id="battery" size={14} /></span>
        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
    </div>
  );
}

// ── Spotlight ────────────────────────────────────────────────────────────────

function Spotlight({ node, onClose, onOpen }: { node: MacNodeState; onClose: () => void; onOpen: (i: EndpointFsItem) => void }) {
  const [q, setQ] = useState("");
  const visual = node.visualState ?? DEFAULT_VISUAL;
  const pool: EndpointFsItem[] = [
    ...visual.desktop.filter((d) => d.kind !== "app").map(toFsItem),
    ...(visual.documents ?? []),
    ...(visual.downloads ?? []),
  ];
  const results = q.trim() ? pool.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-sunken/60 pt-16" onClick={onClose}>
      <div className="w-[440px] overflow-hidden rounded-xl border border-white/20 bg-black/70 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-lg"><AppIcon id="search" size={16} /></span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) onOpen(results[0]); }}
            placeholder="Spotlight Search"
            className="w-full bg-transparent text-lg text-gray-100 outline-none placeholder:text-gray-500"
          />
        </div>
        {results.length > 0 && (
          <div className="border-t border-white/10 p-1">
            {results.map((r) => (
              <button key={r.id} onClick={() => onOpen(r)} className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs text-gray-100 hover:bg-info/70">
                <span><AppIcon id={r.isFolder ? "folder" : "file-text"} size={16} /></span>
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── macOS window chrome (traffic lights, cascaded) ───────────────────────────

function MacWindow({
  win, index, dark, onFocus, onClose, children,
}: {
  win: EpWindow; index: number; dark: boolean; onFocus: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const left = 40 + (index % 5) * 30;
  const top = 14 + (index % 5) * 26;
  return (
    <div
      className={`absolute flex h-[300px] w-[min(600px,92%)] flex-col overflow-hidden rounded-xl border shadow-2xl ${dark ? "border-white/15 bg-panel/95" : "border-gray-300 bg-white/95"}`}
      style={{ left: `${left}px`, top: `${top}px`, zIndex: win.z }}
      onMouseDown={onFocus}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-2 ${dark ? "border-edge bg-panelalt" : "border-gray-200 bg-gray-100"}`}>
        <span className="flex gap-1.5">
          <button onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57]" aria-label="Close" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className={`ml-1 inline-flex items-center gap-1.5 truncate text-xs font-semibold ${dark ? "text-gray-200" : "text-gray-700"}`}><AppIcon id={win.icon} size={12} /> {win.title}</span>
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
    <div className="h-full overflow-y-auto text-xs">
      <div className="grid grid-cols-[1fr_60px_60px_80px] gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Process Name</span><span className="text-right">% CPU</span><span className="text-right">Memory</span><span className="text-right">Action</span>
      </div>
      {procs.map((p) => {
        const hot = p.cpu >= 40;
        return (
          <div key={p.pid} className={`grid grid-cols-[1fr_60px_60px_80px] items-center gap-2 border-b border-edge/50 px-3 py-1.5 ${hot ? "bg-danger/10" : ""}`}>
            <span className="min-w-0"><span className="block truncate text-gray-100">{p.command}</span><span className="block font-mono text-[10px] text-gray-500">PID {p.pid} · {p.user}</span></span>
            <span className={`text-right font-mono ${hot ? "font-bold text-danger" : "text-gray-300"}`}>{p.cpu.toFixed(1)}</span>
            <span className="text-right font-mono text-gray-400">{p.mem.toFixed(1)}%</span>
            <span className="text-right"><button onClick={() => killProcess(node.nodeId, p.pid)} className="rounded-full border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/15">Force Quit</button></span>
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
    <div className="h-full space-y-3 overflow-y-auto p-3 text-xs">
      <div className="flex items-center gap-3 rounded-lg border border-edge/60 bg-panelalt px-3 py-2.5">
        <span className="text-lg"><AppIcon id="globe" size={14} /></span>
        <div className="flex-1"><div className="text-gray-100">Wi-Fi</div><div className="text-[10px] text-gray-500">{node.wifiEnabled ? "Connected · corp-secure" : "Turned off"}</div></div>
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
