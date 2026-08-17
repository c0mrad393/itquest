"use client";

/**
 * ServerOS Desktop — the nested server environment (restored v0.8.1)
 * ==================================================================
 * Connecting to a server drops you onto that machine's DESKTOP: wallpaper,
 * taskbar, start menu. The Admin Center is an application you launch from it,
 * the way Server Manager is an application on a real server.
 *
 * WHY IT CAME BACK. v0.7.0 removed the nested desktop and opened the Admin
 * Center straight into the session, which was tidier and wrong. Anyone who has
 * administered a real server expects to land on a desktop and open a tool; the
 * simulator exists to be familiar to those people, and skipping the desktop
 * quietly taught that servers are consoles rather than computers.
 *
 * WHAT IS DIFFERENT FROM THE OLD ONE. The thing that made the first nested
 * desktop bad was not the desktop — it was that it scattered eight
 * single-purpose MMC windows across it. The Admin Center consolidated those
 * into one tool with a sidebar, and that consolidation is kept: the Start menu
 * lists four applications, not eight, and the desktop is a place to launch
 * them from rather than a filing cabinet.
 *
 * Windows here are draggable and have real chrome, because that is the feel
 * being restored. They are deliberately simple — no snapping, no resize
 * handles — since this is a window inside a window and every extra affordance
 * is one the operator has to disambiguate.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { HostAppIconId, WindowsNodeState } from "@/lib/core";
import { ADMIN_CENTER, SERVER_OS, SERVER_OS_FULL } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import { useThemeStore } from "@/lib/host/theme";
import AdminCenter from "./AdminCenter";
import ServicesPanel from "../apps-windows/ServicesPanel";
import NetworkPanel from "../apps-windows/NetworkPanel";
import EventViewer from "../apps-windows/EventViewer";
import WindowsUpdatePanel from "./WindowsUpdatePanel";
import ServerTerminal from "./ServerTerminal";

type AppId = "admin" | "services" | "network" | "events" | "updates" | "terminal";

interface AppMeta {
  id: AppId;
  title: string;
  iconId: HostAppIconId;
  /** Opened automatically on sign-in, the way Server Manager is. */
  autoStart?: boolean;
}

const APPS: AppMeta[] = [
  { id: "admin", title: ADMIN_CENTER, iconId: "server", autoStart: true },
  { id: "services", title: "Services", iconId: "gear" },
  { id: "network", title: "Network", iconId: "router" },
  { id: "events", title: "Event Log", iconId: "list" },
  { id: "updates", title: "Windows Update", iconId: "shield" },
  { id: "terminal", title: `${SERVER_OS} Console`, iconId: "terminal" },
];

interface WinState {
  app: AppId;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

const W = 940;
const H = 560;

export default function ServerOsDesktop({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const [wins, setWins] = useState<WinState[]>([]);
  const [topZ, setTopZ] = useState(10);
  const [startOpen, setStartOpen] = useState(false);
  const light = useThemeStore((s) => s.resolved) === "light";
  const [now, setNow] = useState(() => new Date());
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const launch = useCallback((app: AppId) => {
    setStartOpen(false);
    setTopZ((z) => z + 1);
    setWins((ws) => {
      const existing = ws.find((w) => w.app === app);
      if (existing) {
        return ws.map((w) => (w.app === app ? { ...w, minimized: false, z: topZ + 1 } : w));
      }
      // Cascade so a second window is not hidden exactly behind the first.
      const offset = ws.length * 22;
      return [
        ...ws,
        { app, x: 40 + offset, y: 24 + offset, z: topZ + 1, minimized: false, maximized: app === "admin" },
      ];
    });
  }, [topZ]);

  // Server Manager opens itself on connect, which is what a real server does.
  useEffect(() => {
    const auto = APPS.find((a) => a.autoStart);
    if (auto) launch(auto.id);
    // Once per session — relaunching on every render would fight the operator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-[11px] text-gray-600">
        This host is no longer in the estate.
      </div>
    );
  }

  const close = (app: AppId) => setWins((ws) => ws.filter((w) => w.app !== app));
  const focus = (app: AppId) => {
    setTopZ((z) => z + 1);
    setWins((ws) => ws.map((w) => (w.app === app ? { ...w, z: topZ + 1, minimized: false } : w)));
  };
  const toggleMin = (app: AppId) =>
    setWins((ws) => ws.map((w) => (w.app === app ? { ...w, minimized: !w.minimized } : w)));
  const toggleMax = (app: AppId) =>
    setWins((ws) => ws.map((w) => (w.app === app ? { ...w, maximized: !w.maximized } : w)));
  const move = (app: AppId, dx: number, dy: number) =>
    setWins((ws) =>
      ws.map((w) =>
        w.app === app ? { ...w, x: Math.max(0, w.x + dx), y: Math.max(0, w.y + dy) } : w,
      ),
    );

  return (
    <div
      ref={surface}
      onClick={() => setStartOpen(false)}
      className="relative h-full select-none overflow-hidden"
      style={{
        /*
         * The classic server wallpaper: a flat corporate gradient, no photo.
         *
         * It follows the operator's THEME even though it is a remote machine.
         * Realism would argue the server keeps its own look, but a dark slab
         * framing a light session reads as a rendering fault rather than as a
         * different computer — and the point of this pass is legibility. The
         * hue stays distinctly cooler than the host desktop, which is what
         * actually signals "you are somewhere else".
         */
        backgroundColor: light ? "#dce6f2" : "#0d2137",
        backgroundImage: light
          ? "radial-gradient(ellipse at 30% 20%, rgba(140,178,220,0.40), transparent 60%), radial-gradient(ellipse at 75% 85%, rgba(170,197,224,0.55), transparent 55%)"
          : "radial-gradient(ellipse at 30% 20%, rgba(56,110,168,0.45), transparent 60%), radial-gradient(ellipse at 75% 85%, rgba(20,60,100,0.55), transparent 55%)",
      }}
    >
      {/* Desktop watermark — every server build has one. */}
      <div className="pointer-events-none absolute bottom-14 right-4 text-right">
        <div className="text-[13px] font-semibold text-gray-500">{SERVER_OS_FULL}</div>
        {/* gray-400, not gray-600: this sits on the server WALLPAPER rather
            than on a panel, and the light wallpaper (#dce6f2) is darker than
            any surface, which pulled gray-600 down to 4.15:1. Measured. */}
        <div className="font-mono text-[10px] text-gray-400">
          {node.hostname} · {node.connection.ip}
        </div>
      </div>

      {/* Desktop icons */}
      <div className="absolute left-3 top-3 flex w-20 flex-col gap-1">
        {APPS.map((a) => (
          <button
            key={a.id}
            onDoubleClick={() => launch(a.id)}
            className="flex flex-col items-center gap-1 rounded p-1.5 text-center hover:bg-gray-500/15"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded bg-sunken/60 text-gray-200">
              <AppIcon id={a.iconId} size={17} />
            </span>
            <span className="text-[9px] leading-tight text-gray-100">{a.title}</span>
          </button>
        ))}
      </div>

      {/* Windows */}
      {wins
        .filter((w) => !w.minimized)
        .map((w) => {
          const meta = APPS.find((a) => a.id === w.app)!;
          return (
            <NestedWindow
              key={w.app}
              meta={meta}
              state={w}
              onFocus={() => focus(w.app)}
              onClose={() => close(w.app)}
              onMinimize={() => toggleMin(w.app)}
              onMaximize={() => toggleMax(w.app)}
              onMove={(dx, dy) => move(w.app, dx, dy)}
            >
              {w.app === "admin" && <AdminCenter nodeId={nodeId} />}
              {w.app === "services" && <ServicesPanel nodeId={nodeId} />}
              {w.app === "network" && <NetworkPanel nodeId={nodeId} />}
              {w.app === "events" && <EventViewer nodeId={nodeId} />}
              {w.app === "updates" && <WindowsUpdatePanel nodeId={nodeId} />}
              {w.app === "terminal" && <ServerTerminal nodeId={nodeId} />}
            </NestedWindow>
          );
        })}

      {/* Start menu */}
      {startOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-10 left-2 z-[999] w-64 overflow-hidden rounded-t border border-edge bg-surface shadow-2xl"
        >
          <div className="border-b border-edge bg-surface-2 px-3 py-2">
            <div className="text-[11px] font-semibold text-gray-100">{node.hostname}</div>
            <div className="text-[9px] text-gray-500">{SERVER_OS_FULL}</div>
          </div>
          {APPS.map((a) => (
            <button
              key={a.id}
              onClick={() => launch(a.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-300 hover:bg-info/20 hover:text-gray-100"
            >
              <AppIcon id={a.iconId} size={13} />
              {a.title}
            </button>
          ))}
        </div>
      )}

      {/* Taskbar */}
      <div className="absolute inset-x-0 bottom-0 z-[998] flex h-10 items-center gap-1 border-t border-edge bg-surface-2/95 px-1.5 backdrop-blur">
        <button
          onClick={(e) => { e.stopPropagation(); setStartOpen((v) => !v); }}
          aria-label="Start"
          className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold text-gray-200 transition ${
            startOpen ? "bg-info/25" : "hover:bg-gray-500/15"
          }`}
        >
          <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[1px]">
            <span className="bg-info" /><span className="bg-info/70" />
            <span className="bg-info/70" /><span className="bg-info" />
          </span>
          Start
        </button>

        <div className="mx-1 h-5 w-px bg-gray-500/15" />

        {wins.map((w) => {
          const meta = APPS.find((a) => a.id === w.app)!;
          return (
            <button
              key={w.app}
              onClick={() => (w.minimized ? focus(w.app) : toggleMin(w.app))}
              className={`flex h-8 max-w-[13rem] items-center gap-1.5 rounded border-b-2 px-2 text-[10px] transition ${
                w.minimized
                  ? "border-transparent text-gray-500 hover:bg-gray-500/15"
                  : "border-info bg-gray-500/15 text-gray-100"
              }`}
            >
              <AppIcon id={meta.iconId} size={12} />
              <span className="truncate">{meta.title}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-3 px-2 font-mono text-[10px] text-gray-400">
          <span title="Domain-joined">{node.domain ?? "workgroup"}</span>
          <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}

// ── Nested window chrome ────────────────────────────────────────────────────

function NestedWindow({
  meta,
  state,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  children,
}: {
  meta: AppMeta;
  state: WinState;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (dx: number, dy: number) => void;
  children: React.ReactNode;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);

  /**
   * Pointer-capture dragging: the title bar keeps receiving moves even when
   * the cursor outruns it, which is the difference between a window that
   * feels solid and one that keeps getting dropped.
   */
  function onPointerDown(e: React.PointerEvent) {
    if (state.maximized) return;
    onFocus();
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    onMove(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const style: React.CSSProperties = state.maximized
    ? { inset: 0, bottom: 40, zIndex: state.z }
    : { left: state.x, top: state.y, width: W, height: H, zIndex: state.z };

  return (
    <div
      onMouseDown={onFocus}
      style={style}
      className="absolute flex flex-col overflow-hidden rounded-sm border border-edge bg-surface shadow-2xl"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onMaximize}
        className={`flex h-7 shrink-0 items-center gap-2 border-b border-edge bg-surface-3 px-2 ${
          state.maximized ? "" : "cursor-move"
        }`}
      >
        <AppIcon id={meta.iconId} size={12} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-200">{meta.title}</span>
        <button onClick={onMinimize} aria-label="Minimize" className="px-1.5 text-gray-400 hover:text-gray-100">
          <span className="block h-px w-2.5 bg-current" />
        </button>
        <button onClick={onMaximize} aria-label="Maximize" className="px-1.5 text-gray-400 hover:text-gray-100">
          <span className="block h-2 w-2 border border-current" />
        </button>
        <button onClick={onClose} aria-label="Close" className="px-1.5 text-gray-400 hover:bg-danger hover:text-danger-on">
          <span className="block text-[11px] leading-none">&times;</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
