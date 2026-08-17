"use client";

/**
 * ServerOS Desktop — the nested server environment (visual pass, v0.9.2)
 * ======================================================================
 * Connecting to a server drops you onto that machine's DESKTOP: wallpaper,
 * icon grid, taskbar, system tray, Start menu. The Admin Center is an
 * application you launch from it, the way Server Manager is an application on
 * a real server.
 *
 * WHY THE DESKTOP EXISTS. v0.7.0 removed it and opened the Admin Center
 * straight into the session, which was tidier and wrong. Anyone who has
 * administered a real server expects to land on a desktop and open a tool;
 * skipping that quietly taught that servers are consoles rather than computers.
 *
 * ── THE SESSION PINS ITS OWN THEME ──────────────────────────────────────────
 *
 * This surface stamps `theme-dark` and paints its own ground, and that is a
 * REVERSAL of the previous decision, which had the server follow the operator's
 * host theme so a dark slab would not frame a light session.
 *
 * The reversal is the right way round. Custom properties inherit, so a nested
 * surface that does NOT pin its tokens inherits the host's — and every child
 * applet here (Services, Network, Event Log, Update, Admin Center) is written
 * against the semantic ramp. Under a light host those applets were being handed
 * an inverted neutral ramp while sitting on a dark server ground, which is
 * precisely the white-on-white class of fault. Pinning once, here, fixes every
 * child at once and fixes any applet added later for free — the same mechanism
 * `.bg-term` uses for shells, and the same reason the boot screen, login screen
 * and landing page each pin their own.
 *
 * It is also simply more truthful: a Windows Server session looks like a
 * Windows Server session regardless of what theme the machine you are sitting
 * at happens to be using. That IS the "you are somewhere else" signal.
 *
 * ── ONE CONSOLE, MANY DOORS ─────────────────────────────────────────────────
 *
 * The Start menu lists the administrative tools an admin looks for by name —
 * directory, policy, services, DNS, event log. Several of those doors open the
 * SAME Admin Center window at a different section rather than spawning their
 * own. That keeps the v0.8.1 consolidation (the original nested desktop was bad
 * because it scattered eight single-purpose MMC windows) while still letting
 * someone find the directory by looking for the directory.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { HostAppIconId, WindowsNodeState } from "@/lib/core";
import { ADMIN_CENTER, CFP_SHORT, EDS_SHORT, SERVER_OS, SERVER_OS_FULL } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import AdminCenter, { type SectionId } from "./AdminCenter";
import ServicesPanel from "../apps-windows/ServicesPanel";
import NetworkPanel from "../apps-windows/NetworkPanel";
import EventViewer from "../apps-windows/EventViewer";
import { DnsManagerPanel, RecycleBinPanel, ThisPcPanel } from "../apps-windows/SystemPanels";
import WindowsUpdatePanel from "./WindowsUpdatePanel";
import ServerTerminal from "./ServerTerminal";

type AppId =
  | "admin"
  | "services"
  | "network"
  | "events"
  | "updates"
  | "powershell"
  | "cmd"
  | "thispc"
  | "recycle"
  | "dns";

interface AppMeta {
  id: AppId;
  title: string;
  iconId: HostAppIconId;
  /** Opened automatically on sign-in, the way Server Manager is. */
  autoStart?: boolean;
  /** Default frame. Consoles want room; shells and shell objects do not. */
  w?: number;
  h?: number;
  maximizeOnOpen?: boolean;
}

const APPS: Record<AppId, AppMeta> = {
  admin: { id: "admin", title: ADMIN_CENTER, iconId: "server", autoStart: true, maximizeOnOpen: true },
  services: { id: "services", title: "Services", iconId: "gear", w: 900, h: 540 },
  network: { id: "network", title: "Network Connections", iconId: "router", w: 720, h: 460 },
  events: { id: "events", title: "Event Viewer", iconId: "list", w: 900, h: 540 },
  updates: { id: "updates", title: "Windows Update", iconId: "shield", w: 760, h: 520 },
  powershell: { id: "powershell", title: `${SERVER_OS} PowerShell`, iconId: "terminal", w: 760, h: 440 },
  cmd: { id: "cmd", title: "Command Prompt", iconId: "code", w: 700, h: 420 },
  thispc: { id: "thispc", title: "This PC", iconId: "disk", w: 680, h: 500 },
  recycle: { id: "recycle", title: "Recycle Bin", iconId: "recycle", w: 520, h: 340 },
  dns: { id: "dns", title: "DNS Manager", iconId: "globe", w: 760, h: 500 },
};

/**
 * The desktop icon grid, in the order a server actually arranges it: the shell
 * objects first, then the tools you were brought here to use.
 */
const DESKTOP_ICONS: AppId[] = ["thispc", "recycle", "network", "admin", "powershell", "cmd"];

interface Shortcut {
  label: string;
  iconId: HostAppIconId;
  target: AppId;
  /** For Admin-Center-backed tools: which section to land on. */
  section?: SectionId;
  /** Offered only when the host genuinely provides it. */
  when?: (node: WindowsNodeState) => boolean;
}

/**
 * Administrative Tools.
 *
 * Named for what an admin would look for, gated on what the host actually
 * runs. A DNS Manager entry on a box with no DNS role, or a directory entry on
 * a member server, would be a door onto an empty room — and the estate already
 * derives those capabilities, so the gate costs nothing.
 */
const ADMIN_TOOLS: Shortcut[] = [
  { label: "Server Manager", iconId: "server", target: "admin", section: "overview" },
  {
    label: `${EDS_SHORT} Users & Computers`,
    iconId: "users",
    target: "admin",
    section: "directory",
    when: (n) => !!n.activeDirectory,
  },
  { label: "DNS Manager", iconId: "globe", target: "dns", when: (n) => !!n.services?.DNS },
  {
    label: `${CFP_SHORT} Policy Management`,
    iconId: "shield",
    target: "admin",
    section: "policies",
    when: (n) => !!n.activeDirectory,
  },
  { label: "Services", iconId: "gear", target: "services" },
  { label: "Network Connections", iconId: "router", target: "network" },
  { label: "Event Viewer", iconId: "list", target: "events" },
  { label: "Windows Update", iconId: "shield", target: "updates" },
  { label: `${SERVER_OS} PowerShell`, iconId: "terminal", target: "powershell" },
];

interface WinState {
  app: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

/** Taskbar height, in px. Windows may not be dragged under it. */
const TASKBAR_H = 40;

/*
 * Clock formatting, pinned to en-GB to match the host taskbar.
 *
 * Not cosmetic pedantry: the session's tray clock sits a few pixels above the
 * host's, and leaving this to the ambient locale rendered "09:49 PM" directly
 * over "21:49" on the same screen. Two clocks disagreeing about the time is
 * read as a bug, and on a simulator about diagnosing systems it is the wrong
 * thing to make someone wonder about.
 */
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ServerOsDesktop({
  nodeId,
  onDisconnect,
}: {
  nodeId: string;
  /**
   * Ends the RDP session. Supplied by RemoteSession, which owns the host window
   * this desktop is painted inside — the desktop cannot close its own frame any
   * more than a real session can close the mstsc window around it.
   */
  onDisconnect?: () => void;
}) {
  /*
   * Narrowed with a discriminant check below rather than asserted with `as`.
   * The estate's node map is a union, and an assertion here would compile
   * happily against a Linux node and fail at the first `.services` read.
   */
  const raw = useInfraStore((s) => s.infra.nodes[nodeId]);
  const node = raw?.os === "windows" ? raw : undefined;
  const reboot = useInfraStore((s) => s.rebootNode);

  const [wins, setWins] = useState<WinState[]>([]);
  const [topZ, setTopZ] = useState(10);
  const [startOpen, setStartOpen] = useState(false);
  const [selected, setSelected] = useState<AppId | null>(null);
  const [tray, setTray] = useState<"clock" | "network" | "health" | null>(null);
  /** Bumped on every shortcut so the Admin Center re-honours a repeat click. */
  const [sectionReq, setSectionReq] = useState<{ section?: SectionId; nonce: number }>({ nonce: 0 });
  const [now, setNow] = useState(() => new Date());

  // Ticks every 30s: the tray clock shows hours and minutes, so a faster tick
  // would re-render the whole desktop to change nothing.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const launch = useCallback(
    (app: AppId, section?: SectionId) => {
      setStartOpen(false);
      setTray(null);
      if (section) setSectionReq((r) => ({ section, nonce: r.nonce + 1 }));
      setTopZ((z) => z + 1);
      setWins((ws) => {
        const existing = ws.find((w) => w.app === app);
        if (existing) {
          return ws.map((w) => (w.app === app ? { ...w, minimized: false, z: topZ + 1 } : w));
        }
        const meta = APPS[app];
        // Cascade so a second window is not hidden exactly behind the first.
        const offset = (ws.length % 6) * 24;
        return [
          ...ws,
          {
            app,
            x: 56 + offset,
            y: 28 + offset,
            w: meta.w ?? 860,
            h: meta.h ?? 520,
            z: topZ + 1,
            minimized: false,
            maximized: !!meta.maximizeOnOpen,
          },
        ];
      });
    },
    [topZ],
  );

  // Server Manager opens itself on connect, which is what a real server does.
  useEffect(() => {
    const auto = Object.values(APPS).find((a) => a.autoStart);
    if (auto) launch(auto.id);
    // Once per session — relaunching on every render would fight the operator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Server health, derived rather than stored.
   *
   * An automatic service that is not running is the alert a real admin cares
   * about — it means the machine came up wrong, or something stopped it. A
   * Manual service sitting stopped is normal and must not raise a badge, which
   * is why the startup type is part of the test rather than just the status.
   */
  const alerts = useMemo(() => {
    if (!node) return [] as string[];
    const out: string[] = [];
    const dead = Object.values(node.services ?? {}).filter(
      (s) =>
        (s.startupType === "Automatic" || s.startupType === "AutomaticDelayed") &&
        s.status !== "Running",
    );
    for (const s of dead) out.push(`${s.displayName} is not running`);
    const down = (node.network?.interfaces ?? []).filter((i) => !i.up);
    for (const i of down) out.push(`Adapter ${i.name} is disabled`);
    if (node.health.status === "critical") out.push("Host health is critical");
    else if (node.health.status === "degraded") out.push("Host health is degraded");
    if (node.health.diskUsedPct >= 90) out.push(`System drive is ${node.health.diskUsedPct}% full`);
    return out;
  }, [node]);

  if (!node) {
    return (
      <div className="theme-dark flex h-full items-center justify-center bg-surface text-[11px] text-gray-600">
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

  /** Topmost non-minimized window — the one the taskbar shows as active. */
  const activeApp = wins
    .filter((w) => !w.minimized)
    .reduce<WinState | null>((best, w) => (!best || w.z > best.z ? w : best), null)?.app;

  const clearSurface = () => {
    setStartOpen(false);
    setSelected(null);
    setTray(null);
  };

  const powerAction = (kind: "disconnect" | "restart" | "logoff") => {
    setStartOpen(false);
    if (kind === "restart") reboot(nodeId);
    // Every one of the three ends the session. They differ in what they leave
    // behind on the server, not in what happens to this window: disconnect
    // leaves the session running, log off tears it down, restart bounces the
    // machine — and in all three cases the RDP client goes away.
    onDisconnect?.();
  };

  return (
    <div
      onClick={clearSurface}
      className="theme-dark relative h-full select-none overflow-hidden"
      style={{
        /*
         * The server wallpaper, drawn in CSS rather than shipped as an image:
         * a deep slate-blue ground with a broad cool sweep off the upper left
         * and a colder pool bottom-right. It is flat, corporate and quiet,
         * which is what a server build's wallpaper is for — the desktop is a
         * place to launch a tool from, not a thing to look at.
         */
        backgroundColor: "#0a1a2b",
        backgroundImage: [
          "radial-gradient(120% 90% at 22% 8%, rgba(72,132,196,0.42), transparent 58%)",
          "radial-gradient(90% 80% at 84% 92%, rgba(16,52,92,0.75), transparent 60%)",
          "linear-gradient(160deg, rgba(10,30,52,0.35) 0%, rgba(6,16,30,0.85) 100%)",
        ].join(","),
      }}
    >
      {/* Faint diagonal rule — the "flow" a server build's wallpaper carries. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(104deg, transparent 38%, rgba(120,180,240,0.10) 44%, rgba(120,180,240,0.02) 47%, transparent 52%)",
        }}
      />

      {/* Desktop watermark — every server build has one. */}
      <div className="pointer-events-none absolute bottom-14 right-5 text-right">
        <div className="text-[13px] font-semibold text-slate-300/85">{SERVER_OS_FULL}</div>
        <div className="font-mono text-[10px] text-slate-400/70">
          {node.hostname} · {node.connection.ip}
          {node.isDomainController && " · Domain Controller"}
        </div>
      </div>

      {/* ── Desktop icon grid ─────────────────────────────────────────────── */}
      <div
        className="absolute left-2 top-2 grid gap-0.5"
        style={{ gridTemplateColumns: "5.25rem", gridAutoRows: "min-content" }}
      >
        {DESKTOP_ICONS.map((id) => {
          const a = APPS[id];
          const isSel = selected === id;
          return (
            <button
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(id);
                setTray(null);
                setStartOpen(false);
              }}
              onDoubleClick={() => launch(id)}
              /*
               * Single click selects, double click opens — the Windows
               * convention, and the reason a single click here must NOT launch.
               */
              className={`group flex w-[5.25rem] flex-col items-center gap-1 rounded-sm border p-1.5 text-center transition-colors ${
                isSel
                  ? "border-sky-400/60 bg-sky-400/25"
                  : "border-transparent hover:border-sky-300/25 hover:bg-sky-300/10"
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-sm text-slate-100 drop-shadow">
                <AppIcon id={a.iconId} size={22} />
              </span>
              <span
                className="text-[10px] font-medium leading-tight text-slate-50"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
              >
                {a.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Windows ───────────────────────────────────────────────────────── */}
      {wins
        .filter((w) => !w.minimized)
        .map((w) => (
          <NestedWindow
            key={w.app}
            meta={APPS[w.app]}
            state={w}
            active={activeApp === w.app}
            onFocus={() => focus(w.app)}
            onClose={() => close(w.app)}
            onMinimize={() => toggleMin(w.app)}
            onMaximize={() => toggleMax(w.app)}
            onMove={(dx, dy) => move(w.app, dx, dy)}
          >
            {w.app === "admin" && (
              <AdminCenter
                nodeId={nodeId}
                requestedSection={sectionReq.section}
                sectionNonce={sectionReq.nonce}
              />
            )}
            {w.app === "services" && <ServicesPanel nodeId={nodeId} />}
            {w.app === "network" && <NetworkPanel nodeId={nodeId} />}
            {w.app === "events" && <EventViewer nodeId={nodeId} />}
            {w.app === "updates" && <WindowsUpdatePanel nodeId={nodeId} />}
            {w.app === "powershell" && <ServerTerminal nodeId={nodeId} shell="powershell" />}
            {w.app === "cmd" && <ServerTerminal nodeId={nodeId} shell="cmd" />}
            {w.app === "thispc" && <ThisPcPanel nodeId={nodeId} />}
            {w.app === "recycle" && <RecycleBinPanel />}
            {w.app === "dns" && <DnsManagerPanel nodeId={nodeId} />}
          </NestedWindow>
        ))}

      {/* ── Start menu ────────────────────────────────────────────────────── */}
      {startOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-10 left-1.5 z-[1000] flex w-[19rem] flex-col overflow-hidden rounded-t-md border border-slate-600/50 bg-slate-900/97 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center gap-2.5 border-b border-slate-700/70 bg-slate-800/70 px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-sky-500/20 text-sky-300">
              <AppIcon id="server" size={17} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-slate-100">{node.hostname}</div>
              <div className="truncate text-[10px] text-slate-400">
                {node.domain ?? "WORKGROUP"} · {SERVER_OS_FULL}
              </div>
            </div>
          </div>

          <div className="max-h-[19rem] overflow-y-auto term-scroll py-1.5">
            <div className="px-3 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Administrative Tools
            </div>
            {ADMIN_TOOLS.filter((t) => !t.when || t.when(node)).map((t) => (
              <button
                key={t.label}
                onClick={() => launch(t.target, t.section)}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[11px] text-slate-300 transition-colors hover:bg-sky-500/20 hover:text-slate-50"
              >
                <AppIcon id={t.iconId} size={14} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700/70 bg-slate-800/50 py-1.5">
            <div className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Session
            </div>
            {(
              [
                { kind: "disconnect", label: "Disconnect RDP Session", icon: "plug" },
                { kind: "logoff", label: "Log Off", icon: "power" },
                { kind: "restart", label: "Restart Server", icon: "activity" },
              ] as const
            ).map((p) => (
              <button
                key={p.kind}
                onClick={() => powerAction(p.kind)}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[11px] text-slate-300 transition-colors hover:bg-sky-500/20 hover:text-slate-50"
              >
                <AppIcon id={p.icon} size={14} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tray flyouts ──────────────────────────────────────────────────── */}
      {tray === "clock" && (
        <TrayFlyout onClick={(e) => e.stopPropagation()}>
          <CalendarFlyout now={now} />
        </TrayFlyout>
      )}
      {tray === "network" && (
        <TrayFlyout onClick={(e) => e.stopPropagation()}>
          <NetworkFlyout node={node} onOpen={() => launch("network")} />
        </TrayFlyout>
      )}
      {tray === "health" && (
        <TrayFlyout onClick={(e) => e.stopPropagation()}>
          <HealthFlyout alerts={alerts} onOpen={() => launch("services")} />
        </TrayFlyout>
      )}

      {/* ── Taskbar ───────────────────────────────────────────────────────── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 z-[999] flex items-center gap-1 border-t border-slate-700/60 bg-slate-900/95 px-1.5 backdrop-blur"
        style={{ height: TASKBAR_H }}
      >
        <button
          onClick={() => {
            setStartOpen((v) => !v);
            setTray(null);
          }}
          aria-label="Start"
          aria-expanded={startOpen}
          className={`flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11px] font-semibold text-slate-200 transition-colors ${
            startOpen ? "bg-sky-500/30" : "hover:bg-slate-100/10"
          }`}
        >
          <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[1.5px]">
            <span className="rounded-[1px] bg-sky-400" />
            <span className="rounded-[1px] bg-sky-400/75" />
            <span className="rounded-[1px] bg-sky-400/75" />
            <span className="rounded-[1px] bg-sky-400" />
          </span>
          Start
        </button>

        <div className="mx-1 h-5 w-px bg-slate-100/10" />

        {wins.map((w) => (
          <TaskButton
            key={w.app}
            meta={APPS[w.app]}
            minimized={w.minimized}
            active={activeApp === w.app}
            onClick={() => (w.minimized || activeApp !== w.app ? focus(w.app) : toggleMin(w.app))}
          />
        ))}

        {/* ── System tray ─────────────────────────────────────────────────── */}
        <div className="ml-auto flex items-center gap-0.5 pl-2">
          <TrayButton
            label="Network"
            active={tray === "network"}
            onClick={() => setTray((t) => (t === "network" ? null : "network"))}
            title={`${node.connection.ip} · ${
              (node.network?.interfaces ?? []).some((i) => i.up) ? "Connected" : "No connection"
            }`}
          >
            <span
              className={
                (node.network?.interfaces ?? []).some((i) => i.up) ? "text-slate-300" : "text-amber-400"
              }
            >
              <AppIcon id="router" size={14} />
            </span>
          </TrayButton>

          <TrayButton
            label="Server health"
            active={tray === "health"}
            onClick={() => setTray((t) => (t === "health" ? null : "health"))}
            title={alerts.length ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}` : "No alerts"}
          >
            <span className="relative">
              <span className={alerts.length ? "text-amber-400" : "text-slate-300"}>
                <AppIcon id={alerts.length ? "alert" : "check"} size={14} />
              </span>
              {alerts.length > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-amber-500 px-[3px] text-[8px] font-bold leading-none text-slate-950">
                  {alerts.length > 9 ? "9+" : alerts.length}
                </span>
              )}
            </span>
          </TrayButton>

          <button
            onClick={() => setTray((t) => (t === "clock" ? null : "clock"))}
            aria-label="Date and time"
            className={`ml-0.5 rounded-sm px-2 py-1 text-right leading-tight transition-colors ${
              tray === "clock" ? "bg-sky-500/25" : "hover:bg-slate-100/10"
            }`}
          >
            <div className="font-mono text-[10px] text-slate-200">{fmtTime(now)}</div>
            <div className="font-mono text-[9px] text-slate-400">{fmtDate(now)}</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Taskbar button ──────────────────────────────────────────────────────────

/**
 * A running application.
 *
 * The underline is the state indicator, exactly as Windows uses it: full and
 * bright for the focused window, dim and short for a running-but-background
 * one, absent when minimized. Hovering raises a preview card, which is the
 * only way to tell two consoles apart when the labels truncate.
 */
function TaskButton({
  meta,
  minimized,
  active,
  onClick,
}: {
  meta: AppMeta;
  minimized: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={meta.title}
        className={`relative flex h-8 max-w-[12rem] items-center gap-1.5 rounded-sm px-2.5 text-[10px] transition-colors ${
          active
            ? "bg-slate-100/15 text-slate-50"
            : minimized
              ? "text-slate-400 hover:bg-slate-100/10"
              : "text-slate-200 hover:bg-slate-100/10"
        }`}
      >
        <AppIcon id={meta.iconId} size={13} />
        <span className="truncate">{meta.title}</span>
        <span
          aria-hidden
          className={`absolute inset-x-0 bottom-0 mx-auto h-[2px] rounded-full transition-all ${
            minimized ? "w-0 bg-transparent" : active ? "w-3/5 bg-sky-400" : "w-2 bg-slate-400/70"
          }`}
        />
      </button>

      {hover && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-[1001] mb-2 w-44 -translate-x-1/2 rounded-md border border-slate-600/60 bg-slate-900/97 p-2 shadow-2xl">
          <div className="flex items-center gap-1.5">
            <AppIcon id={meta.iconId} size={12} />
            <span className="truncate text-[10px] font-medium text-slate-100">{meta.title}</span>
          </div>
          <div className="mt-1.5 flex h-14 items-center justify-center rounded-sm border border-slate-700/70 bg-slate-800/60 text-[9px] text-slate-500">
            {minimized ? "Minimized" : active ? "Active window" : "Running"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tray plumbing ───────────────────────────────────────────────────────────

function TrayButton({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`rounded-sm px-1.5 py-1.5 transition-colors ${
        active ? "bg-sky-500/25" : "hover:bg-slate-100/10"
      }`}
    >
      {children}
    </button>
  );
}

function TrayFlyout({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="absolute bottom-10 right-1.5 z-[1000] w-[17rem] overflow-hidden rounded-md border border-slate-600/50 bg-slate-900/97 shadow-2xl backdrop-blur"
    >
      {children}
    </div>
  );
}

function FlyoutHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-700/70 bg-slate-800/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

/** Month grid for the tray clock. Pure date arithmetic — no calendar model. */
function CalendarFlyout({ now }: { now: Date }) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first, which is what every European locale expects and what the rest
  // of this simulator's date formatting already implies.
  const lead = (first.getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <>
      <FlyoutHead>
        {now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
      </FlyoutHead>
      <div className="p-3">
        <div className="mb-2 text-center">
          <div className="font-mono text-[20px] leading-none text-slate-100">{fmtTime(now)}</div>
          <div className="mt-1 text-[10px] text-slate-400">
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-[2px] text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="py-1 text-[9px] font-semibold text-slate-500">
              {d}
            </div>
          ))}
          {cells.map((d, i) => (
            <div
              key={i}
              className={`rounded-sm py-1 text-[10px] ${
                d === today
                  ? "bg-sky-500/80 font-semibold text-slate-950"
                  : d
                    ? "text-slate-300"
                    : "text-transparent"
              }`}
            >
              {d ?? "0"}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NetworkFlyout({ node, onOpen }: { node: WindowsNodeState; onOpen: () => void }) {
  const ifaces = node.network?.interfaces ?? [];
  return (
    <>
      <FlyoutHead>Network</FlyoutHead>
      <div className="p-3">
        {ifaces.length === 0 && <div className="text-[11px] text-slate-500">No adapters present.</div>}
        {ifaces.map((i) => (
          <div key={i.name} className="mb-2 last:mb-0">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${i.up ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="truncate text-[11px] font-medium text-slate-100">{i.name}</span>
              <span className="ml-auto text-[10px] text-slate-400">
                {i.up ? "Connected" : "Disabled"}
              </span>
            </div>
            <div className="mt-0.5 pl-3.5 font-mono text-[10px] text-slate-400">
              {i.up ? i.ipv4 || "no address" : "—"}
            </div>
          </div>
        ))}
        <div className="mt-2 border-t border-slate-700/70 pt-2 font-mono text-[10px] text-slate-400">
          DNS {node.network?.dnsServers?.join(", ") || "not configured"}
        </div>
        <button
          onClick={onOpen}
          className="mt-2 w-full rounded-sm border border-slate-600/60 px-2 py-1.5 text-[10px] text-slate-200 transition-colors hover:bg-sky-500/20"
        >
          Open Network Connections
        </button>
      </div>
    </>
  );
}

function HealthFlyout({ alerts, onOpen }: { alerts: string[]; onOpen: () => void }) {
  return (
    <>
      <FlyoutHead>Server health</FlyoutHead>
      <div className="p-3">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="text-emerald-400">
              <AppIcon id="check" size={13} />
            </span>
            No alerts. All automatic services are running.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a} className="flex items-start gap-2 text-[11px] leading-snug text-slate-200">
                <span className="mt-[1px] shrink-0 text-amber-400">
                  <AppIcon id="alert" size={12} />
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
        {alerts.length > 0 && (
          <button
            onClick={onOpen}
            className="mt-3 w-full rounded-sm border border-slate-600/60 px-2 py-1.5 text-[10px] text-slate-200 transition-colors hover:bg-sky-500/20"
          >
            Open Services
          </button>
        )}
      </div>
    </>
  );
}

// ── Nested window chrome ────────────────────────────────────────────────────

function NestedWindow({
  meta,
  state,
  active,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  children,
}: {
  meta: AppMeta;
  state: WinState;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (dx: number, dy: number) => void;
  children: React.ReactNode;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);

  /**
   * Pointer-capture dragging: the title bar keeps receiving moves even when the
   * cursor outruns it, which is the difference between a window that feels
   * solid and one that keeps getting dropped.
   *
   * The button guard is load-bearing and was learned the hard way on the HOST
   * window manager: `setPointerCapture` retargets the subsequent pointerup to
   * the captured element, and a `click` only fires when down and up land on the
   * same element — so capturing here would make Close, Minimize and Maximize
   * completely unclickable while looking perfectly fine.
   */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onFocus();
    if (e.target instanceof HTMLElement && e.target.closest("button")) return;
    if (state.maximized) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onMove(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const style: React.CSSProperties = state.maximized
    ? { inset: 0, bottom: TASKBAR_H, zIndex: state.z }
    : { left: state.x, top: state.y, width: state.w, height: state.h, zIndex: state.z };

  return (
    <div
      onMouseDown={onFocus}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={`absolute flex flex-col overflow-hidden rounded-sm border bg-surface transition-shadow ${
        active
          ? "border-slate-500/70 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)]"
          : "border-slate-700/60 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.7)]"
      }`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onMaximize}
        /*
         * The title bar is the one piece of chrome every nested applet shares,
         * so it is styled HERE rather than by each panel — a Services window and
         * an Event Viewer window must be recognisably the same OS.
         */
        className={`flex h-8 shrink-0 items-center gap-2 border-b border-slate-700/60 px-2 ${
          active ? "bg-slate-800" : "bg-slate-800/60"
        } ${state.maximized ? "" : "cursor-move"}`}
      >
        <span className={active ? "text-sky-300" : "text-slate-500"}>
          <AppIcon id={meta.iconId} size={13} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${
            active ? "text-slate-100" : "text-slate-400"
          }`}
        >
          {meta.title}
        </span>

        {/* Native-metric caption buttons: 46x32 hit areas, hover fills, red close. */}
        <button
          onClick={onMinimize}
          aria-label="Minimize"
          className="flex h-8 w-11 items-center justify-center text-slate-300 transition-colors hover:bg-slate-100/15"
        >
          <span className="block h-px w-2.5 bg-current" />
        </button>
        <button
          onClick={onMaximize}
          aria-label={state.maximized ? "Restore" : "Maximize"}
          className="flex h-8 w-11 items-center justify-center text-slate-300 transition-colors hover:bg-slate-100/15"
        >
          {state.maximized ? (
            <span className="relative block h-2.5 w-2.5">
              <span className="absolute bottom-0 left-0 block h-2 w-2 border border-current" />
              <span className="absolute right-0 top-0 block h-2 w-2 border-r border-t border-current" />
            </span>
          ) : (
            <span className="block h-2.5 w-2.5 border border-current" />
          )}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-11 items-center justify-center text-slate-300 transition-colors hover:bg-[#c42b1c] hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.1" fill="none" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
