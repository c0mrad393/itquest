"use client";

/**
 * TriageOS — Level 0 Host Desktop (Windows 11)
 * ============================================
 * The operator's full-screen workstation shell: wallpaper, desktop icons, the
 * open host-app windows (managed by the host store), the Start menu, and the
 * taskbar. This is the root the user lands on; nested remote sessions (Phase 3)
 * open as additional windows inside this same surface.
 */

import { useHostStore } from "@/lib/host/store";
import DesktopIcons from "./DesktopIcons";
import WindowFrame from "./WindowFrame";
import Taskbar from "./Taskbar";
import StartMenu from "./StartMenu";
import TicketReconciler from "./TicketReconciler";
import SlaEngine from "./SlaEngine";
import PersistenceManager from "./PersistenceManager";

export default function HostDesktop() {
  const windows = useHostStore((s) => s.windows);

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none font-sans">
      {/* Wallpaper — Windows 11 "bloom" style gradient */}
      <div className="absolute inset-0" style={{ background: WALLPAPER }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(76,194,255,0.18),transparent_60%)]" />

      {/* Brand watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none text-[9vw] font-black tracking-tight text-white/[0.03]">
          TriageOS
        </span>
      </div>

      {/* Headless engines. PersistenceManager first: hydrate before evaluating. */}
      <PersistenceManager />
      <TicketReconciler />
      <SlaEngine />

      {/* Desktop icons */}
      <DesktopIcons />

      {/* Windows layer */}
      <div className="absolute inset-0 bottom-12">
        {windows.map((win) => (
          <WindowFrame key={win.instanceId} win={win} />
        ))}
      </div>

      {/* Start menu (renders above windows, below taskbar) */}
      <StartMenu />

      {/* Taskbar */}
      <Taskbar />
    </div>
  );
}

const WALLPAPER =
  "linear-gradient(135deg, #0a1730 0%, #0d2145 38%, #123a63 70%, #0a2a4d 100%)";
