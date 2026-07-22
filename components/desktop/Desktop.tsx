"use client";

/**
 * TriageOS — Simulated Remote Desktop (RDP/AnyDesk-style)
 * ------------------------------------------------------
 * The GUI workspace: desktop icons launch app windows, a taskbar shows open
 * windows, and every app operates on the shared VMState. This is the visual
 * twin of the CLI — the same machine, a different interface.
 */

import { APP_CATALOG, useDesktopStore, type AppId } from "@/lib/desktop/store";
import Window from "./Window";
import ServicesApp from "./apps/ServicesApp";
import NetworkApp from "./apps/NetworkApp";
import ActiveDirectoryApp from "./apps/ActiveDirectoryApp";
import FilesApp from "./apps/FilesApp";

const APP_BODIES: Record<AppId, React.ComponentType> = {
  services: ServicesApp,
  network: NetworkApp,
  activedirectory: ActiveDirectoryApp,
  files: FilesApp,
};

const ICON_ORDER: AppId[] = ["services", "network", "activedirectory", "files"];

export default function Desktop() {
  const windows = useDesktopStore((s) => s.windows);
  const open = useDesktopStore((s) => s.open);
  const focus = useDesktopStore((s) => s.focus);
  const toggleMinimize = useDesktopStore((s) => s.toggleMinimize);

  const openWindows = Object.values(windows).filter((w) => w.open);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-edge bg-gradient-to-br from-[#0b1220] to-[#111a2e]">
      {/* Wallpaper watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[120px] font-black text-white/[0.02]">web-01</span>
      </div>

      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-edge/60 bg-black/30 px-3 py-1.5 text-[11px] text-gray-400">
        <span className="text-info">◈</span>
        <span>Remote Session — okhare@web-01 (10.20.4.11)</span>
        <span className="ml-auto rounded bg-panel px-2 py-0.5 uppercase tracking-wider text-info">
          GUI
        </span>
      </div>

      {/* Desktop surface */}
      <div className="relative min-h-0 flex-1">
        {/* Icons */}
        <div className="absolute left-3 top-3 flex flex-col gap-3">
          {ICON_ORDER.map((id) => (
            <button
              key={id}
              onDoubleClick={() => open(id)}
              onClick={() => open(id)}
              className="flex w-20 flex-col items-center gap-1 rounded p-2 text-center hover:bg-white/5"
            >
              <span className="text-2xl">{APP_CATALOG[id].icon}</span>
              <span className="text-[10px] leading-tight text-gray-300">
                {shortName(id)}
              </span>
            </button>
          ))}
        </div>

        {/* Windows */}
        {openWindows.map((win) => {
          const Body = APP_BODIES[win.id];
          return (
            <Window key={win.id} win={win}>
              <Body />
            </Window>
          );
        })}
      </div>

      {/* Taskbar */}
      <div className="flex items-center gap-2 border-t border-edge/60 bg-black/40 px-3 py-1.5">
        <span className="text-xs text-gray-500">Start</span>
        <div className="mx-2 h-4 w-px bg-edge" />
        {openWindows.length === 0 && (
          <span className="text-[11px] text-gray-600">No open windows — double-click an icon</span>
        )}
        {openWindows.map((w) => (
          <button
            key={w.id}
            onClick={() => (w.minimized ? focus(w.id) : toggleMinimize(w.id))}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
              w.minimized
                ? "border-edge text-gray-500"
                : "border-info/40 bg-info/10 text-info"
            }`}
          >
            <span>{w.icon}</span>
            <span>{shortName(w.id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function shortName(id: AppId): string {
  return {
    services: "Services",
    network: "Network",
    activedirectory: "AD Users",
    files: "Files",
  }[id];
}
