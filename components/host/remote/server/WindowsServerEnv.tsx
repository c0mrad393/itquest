"use client";

/**
 * WindowsServerEnv — realistic Windows Server 2019/2022 desktop (DC / servers)
 * ===========================================================================
 * Replaces the primitive console-launcher for Windows servers with a proper
 * Server desktop: classic dark-blue background, a bottom taskbar (Start button,
 * pinned admin tools, system tray with network + clock), and windowed apps with
 * authentic Segoe-UI title bars (minimize / maximize / close) and drop shadows.
 * Server Manager auto-launches on connect, just like the real thing.
 */

import { useEffect, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { WindowsNodeState } from "@/lib/core";
import ServerManager from "./ServerManager";
import AducMmc from "./AducMmc";
import ServicesPanel from "../apps-windows/ServicesPanel";
import ControlPanel from "../apps-windows/ControlPanel";
import EventViewer from "../apps-windows/EventViewer";
import FileExplorer from "../apps-windows/FileExplorer";

const SEGOE = '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif';

type AppId = "servermgr" | "aduc" | "gpmc" | "services" | "eventvwr" | "controlpanel" | "explorer" | "powershell";

interface AppMeta { id: AppId; title: string; icon: string; needs?: "ad" | "gpo" }
const APPS: AppMeta[] = [
  { id: "servermgr", title: "Server Manager", icon: "🗄️" },
  { id: "aduc", title: "Active Directory Users and Computers", icon: "👥", needs: "ad" },
  { id: "gpmc", title: "Group Policy Management", icon: "📜", needs: "gpo" },
  { id: "services", title: "Services", icon: "⚙️" },
  { id: "eventvwr", title: "Event Viewer", icon: "📋" },
  { id: "controlpanel", title: "Control Panel", icon: "🎛️" },
  { id: "explorer", title: "File Explorer", icon: "🗂️" },
  { id: "powershell", title: "Windows PowerShell", icon: "⌨️" },
];

interface WinState { app: AppId; z: number; mode: "normal" | "min" | "max" }

export default function WindowsServerEnv({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [wins, setWins] = useState<WinState[]>([]);
  const [z, setZ] = useState(10);
  const [focus, setFocus] = useState<AppId | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  // Auto-launch Server Manager on connect.
  useEffect(() => { open("servermgr"); /* eslint-disable-next-line */ }, []);

  if (!node) return null;
  const apps = APPS.filter((a) => (a.needs === "ad" ? !!node.activeDirectory : a.needs === "gpo" ? !!node.groupPolicy : true));

  function open(app: AppId) {
    setZ((v) => v + 1);
    setFocus(app);
    setStartOpen(false);
    setWins((prev) => {
      const cur = prev.find((w) => w.app === app);
      if (cur) return prev.map((w) => (w.app === app ? { ...w, z: z + 1, mode: w.mode === "min" ? "normal" : w.mode } : w));
      return [...prev, { app, z: z + 1, mode: "normal" }];
    });
  }
  function close(app: AppId) { setWins((p) => p.filter((w) => w.app !== app)); }
  function setMode(app: AppId, mode: WinState["mode"]) { setWins((p) => p.map((w) => (w.app === app ? { ...w, mode } : w))); if (mode !== "min") { setFocus(app); setZ((v) => v + 1); } }
  function raise(app: AppId) { setZ((v) => v + 1); setFocus(app); setWins((p) => p.map((w) => (w.app === app ? { ...w, z: z + 1 } : w))); }

  const meta = (a: AppId) => apps.find((x) => x.id === a) ?? APPS.find((x) => x.id === a)!;

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ fontFamily: SEGOE, background: "linear-gradient(135deg,#0a3a63 0%,#0e2d52 55%,#0a2340 100%)" }}>
      {/* Desktop watermark + edition */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[10vw] leading-none text-white/[0.04]">🪟</div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-14 right-4 text-right text-[11px] text-white/40">
        <div>{node.edition}</div>
        <div>{node.hostname} · {node.domain}</div>
      </div>

      {/* Desktop icons */}
      <div className="relative z-0 flex flex-col gap-4 p-3">
        <DeskIcon icon="🖥️" label="This PC" onOpen={() => open("explorer")} />
        <DeskIcon icon="🗄️" label="Server Manager" onOpen={() => open("servermgr")} />
        <DeskIcon icon="🗑️" label="Recycle Bin" onOpen={() => {}} />
      </div>

      {/* Windows layer */}
      <div className="relative min-h-0 flex-1">
        {wins.filter((w) => w.mode !== "min").map((w, i) => (
          <ServerWindow key={w.app} meta={meta(w.app)} state={w} index={i} focused={focus === w.app}
            onFocus={() => raise(w.app)} onMin={() => setMode(w.app, "min")} onMax={() => setMode(w.app, w.mode === "max" ? "normal" : "max")} onClose={() => close(w.app)}>
            {renderApp(w.app, node, open)}
          </ServerWindow>
        ))}
      </div>

      {startOpen && <StartMenu node={node} apps={apps} onOpen={open} />}

      {/* Taskbar */}
      <div className="relative z-40 flex h-10 shrink-0 items-center gap-1 border-t border-black/40 bg-[#1c2733]/95 px-1.5 backdrop-blur" onClick={() => setStartOpen(false)}>
        <button onClick={(e) => { e.stopPropagation(); setStartOpen((v) => !v); }} title="Start"
          className={`flex h-8 w-9 items-center justify-center rounded ${startOpen ? "bg-white/15" : "hover:bg-white/10"}`}>
          <svg width="18" height="18" viewBox="0 0 18 18"><rect x="0" y="0" width="8" height="8" fill="#4cc2ff" /><rect x="10" y="0" width="8" height="8" fill="#4cc2ff" /><rect x="0" y="10" width="8" height="8" fill="#4cc2ff" /><rect x="10" y="10" width="8" height="8" fill="#4cc2ff" /></svg>
        </button>
        {/* pinned + running */}
        {(["servermgr", "aduc", "powershell", "explorer", "eventvwr"] as AppId[]).filter((a) => apps.some((x) => x.id === a)).map((a) => {
          const running = wins.some((w) => w.app === a);
          return (
            <button key={a} onClick={(e) => { e.stopPropagation(); running ? (focus === a ? setMode(a, "min") : raise(a)) : open(a); }} title={meta(a).title}
              className={`relative flex h-8 w-9 items-center justify-center rounded text-base ${focus === a ? "bg-white/20" : "hover:bg-white/10"}`}>
              {meta(a).icon}
              {running && <span className={`absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full ${focus === a ? "w-5 bg-[#4cc2ff]" : "w-3 bg-white/50"}`} />}
            </button>
          );
        })}
        {/* system tray */}
        <div className="ml-auto flex items-center gap-3 pr-2 text-[11px] text-gray-200">
          <span title="Network" className="text-[13px]">📶</span>
          <span title="Volume" className="text-[13px]">🔊</span>
          <div className="text-right leading-tight">
            <div>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-[10px] text-gray-400">{now.toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderApp(app: AppId, node: WindowsNodeState, open: (a: AppId) => void): React.ReactNode {
  switch (app) {
    case "servermgr": return <ServerManager node={node} onOpen={open} />;
    case "aduc": return <AducMmc nodeId={node.nodeId} />;
    case "gpmc": return <GpmcStub />;
    case "services": return <ServicesPanel nodeId={node.nodeId} />;
    case "eventvwr": return <EventViewer nodeId={node.nodeId} />;
    case "controlpanel": return <ControlPanel nodeId={node.nodeId} />;
    case "explorer": return <FileExplorer nodeId={node.nodeId} />;
    case "powershell": return <PowerShell node={node} />;
  }
}

// ── Windows-style window chrome ──────────────────────────────────────────────

function ServerWindow({
  meta, state, index, focused, onFocus, onMin, onMax, onClose, children,
}: {
  meta: AppMeta; state: WinState; index: number; focused: boolean;
  onFocus: () => void; onMin: () => void; onMax: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const maximized = state.mode === "max";
  const rect = maximized
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : { left: 24 + index * 26, top: 16 + index * 24, width: "min(760px, 94%)", height: "min(460px, 90%)" };
  return (
    <div
      className="absolute flex flex-col overflow-hidden border border-[#7a7a7a] bg-[#f0f0f0] shadow-2xl shadow-black/50"
      style={{ ...rect, zIndex: state.z, borderRadius: maximized ? 0 : 6 }}
      onMouseDown={onFocus}
    >
      {/* Title bar */}
      <div className={`flex h-8 shrink-0 items-center gap-2 pl-2 pr-0 ${focused ? "bg-[#f6f6f6]" : "bg-[#eaeaea]"}`}>
        <span className="text-[13px]">{meta.icon}</span>
        <span className="truncate text-[12px] text-[#1f1f1f]">{meta.title}</span>
        <div className="ml-auto flex h-full">
          <TitleBtn onClick={onMin} label="Minimize"><rect x="2" y="6" width="8" height="1" fill="#1f1f1f" /></TitleBtn>
          <TitleBtn onClick={onMax} label="Maximize"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="#1f1f1f" /></TitleBtn>
          <TitleBtn onClick={onClose} label="Close" danger><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1" /></TitleBtn>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-white">{children}</div>
    </div>
  );
}

function TitleBtn({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label}
      className={`flex h-full w-11 items-center justify-center text-[#1f1f1f] ${danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-black/10"}`}>
      <svg width="12" height="12" viewBox="0 0 12 12">{children}</svg>
    </button>
  );
}

// ── Desktop icon ─────────────────────────────────────────────────────────────

function DeskIcon({ icon, label, onOpen }: { icon: string; label: string; onOpen: () => void }) {
  return (
    <button onDoubleClick={onOpen} className="flex w-16 flex-col items-center gap-1 rounded p-1 text-center hover:bg-white/10">
      <span className="text-2xl drop-shadow">{icon}</span>
      <span className="text-[11px] leading-tight text-white drop-shadow" style={{ textShadow: "0 1px 2px rgba(0,0,0,.8)" }}>{label}</span>
    </button>
  );
}

// ── Start menu ───────────────────────────────────────────────────────────────

function StartMenu({ node, apps, onOpen }: { node: WindowsNodeState; apps: AppMeta[]; onOpen: (a: AppId) => void }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute bottom-11 left-1.5 z-50 w-72 rounded-md border border-black/40 bg-[#1c2733]/98 p-2 text-gray-100 shadow-2xl backdrop-blur">
      <div className="mb-1 px-2 text-[10px] uppercase tracking-wider text-gray-400">Administrative Tools</div>
      {apps.map((a) => (
        <button key={a.id} onClick={() => onOpen(a.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-white/10">
          <span>{a.icon}</span> {a.title}
        </button>
      ))}
      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2 text-[12px]">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0078d4]">👤</span>
        <span>Administrator</span>
        <span className="ml-auto text-gray-400">⏻</span>
      </div>
    </div>
  );
}

// ── PowerShell + GPMC stub ───────────────────────────────────────────────────

function PowerShell({ node }: { node: WindowsNodeState }) {
  return (
    <div className="h-full overflow-auto bg-[#012456] p-3 font-mono text-[12px] leading-relaxed text-gray-100">
      <div>Windows PowerShell</div>
      <div className="text-gray-400">Copyright (C) Microsoft Corporation. All rights reserved.</div>
      <div className="mt-3">PS C:\Users\Administrator&gt; hostname</div>
      <div>{node.hostname}</div>
      <div className="mt-1">PS C:\Users\Administrator&gt; Get-ADDomain | Select-Object DNSRoot,DomainMode</div>
      <div className="whitespace-pre text-gray-300">{`\nDNSRoot        DomainMode\n-------        ----------\n${node.domain ?? "triageos.corp"}    Windows2016Domain\n`}</div>
      <div className="mt-1">PS C:\Users\Administrator&gt; <span className="caret">▏</span></div>
    </div>
  );
}

function GpmcStub() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-white text-center text-[#1f1f1f]">
      <div className="text-3xl">📜</div>
      <div className="text-sm">Group Policy Management</div>
      <div className="text-[11px] text-gray-500">GPO editing surfaces in a later content pass. Policy state is live on the node.</div>
    </div>
  );
}
