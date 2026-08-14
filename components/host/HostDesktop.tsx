"use client";

/**
 * TriageOS — Level 0 Host Desktop (DeskOS 12)
 * ============================================
 * The operator's full-screen workstation shell: wallpaper, desktop icons, the
 * open host-app windows (managed by the host store), the Start menu, and the
 * taskbar. This is the root the user lands on; nested remote sessions (Phase 3)
 * open as additional windows inside this same surface.
 */

import { useEffect, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import DesktopIcons from "./DesktopIcons";
import WindowFrame from "./WindowFrame";
import Taskbar from "./Taskbar";
import StartMenu from "./StartMenu";
import TicketReconciler from "./TicketReconciler";
import SlaEngine from "./SlaEngine";
import NetworkEngine from "./NetworkEngine";
import PersistenceManager from "./PersistenceManager";
import HardwareDispatchEngine from "./HardwareDispatchEngine";
import TelemetryEngine from "./TelemetryEngine";
import { ToastHost } from "./Notifications";
import { wallpaperById } from "@/lib/host/wallpapers";
import { applyProfileToHost, useSessionStore } from "@/lib/host/session";
import DebugPanel from "./DebugPanel";

export default function HostDesktop() {
  const windows = useHostStore((s) => s.windows);
  const paper = wallpaperById(useHostStore((s) => s.host.wallpaper));

  // Developer console handles (`sudo elevate debug`). Installed once on mount.
  // One local operator: read the save slot, then push the name and avatar
  // onto the desktop's user record.
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const hydrate = useSessionStore((s) => s.hydrate);
  const profile = useSessionStore((s) => s.profile);
  const ready = useSessionStore((s) => s.ready);
  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (ready) void applyProfileToHost(profile);
  }, [ready, profile]);

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none font-sans">
      {/* Wallpaper — chosen in Settings → Personalization, persisted with the save. */}
      <div
        className="absolute inset-0"
        style={{ background: paper.css, backgroundSize: paper.size }}
      />
      {paper.overlay !== false && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(76,194,255,0.18),transparent_60%)]" />
      )}

      {/* Brand watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[9vw] font-black tracking-tight text-white/[0.03]">
          TriageOS
        </span>
      </div>

      {/* Headless engines. PersistenceManager first: hydrate before evaluating. */}
      <PersistenceManager />
      <DebugPanel open={devToolsOpen} onClose={() => setDevToolsOpen(false)} />
      <TicketReconciler />
      <SlaEngine />
      <NetworkEngine />
      <HardwareDispatchEngine />
      <TelemetryEngine />

      {/* Desktop icons */}
      <DesktopIcons />

      {/* Windows layer */}
      {/* Windows layer. `pointer-events-none` so empty desktop space stays
          clickable (each WindowFrame re-enables events for itself) — otherwise
          this full-size div swallows every click meant for the icons below. */}
      <div className="pointer-events-none absolute inset-0 bottom-12 z-20">
        {windows.map((win) => (
          <WindowFrame key={win.instanceId} win={win} />
        ))}
      </div>

      {/* Start menu (renders above windows, below taskbar) */}
      <StartMenu />

      {/* Toast stack (above the taskbar, below nothing) */}
      <ToastHost />

      {/* Taskbar */}
      <Taskbar devToolsOpen={devToolsOpen} onToggleDevTools={() => setDevToolsOpen((v) => !v)} />
    </div>
  );
}
