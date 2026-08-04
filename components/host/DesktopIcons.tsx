"use client";

/**
 * TriageOS — Desktop icons
 * ------------------------
 * Snap-to-grid icon field for apps flagged `showOnDesktop`. Icons flow down a
 * fixed-height row grid and wrap into a new column when they run out of
 * vertical space — like a real desktop, so nothing is ever clipped.
 *
 * Single-click selects, double-click launches. Sits at z-10: below the windows
 * layer (z-20) but above the wallpaper, and the windows layer is
 * pointer-events-none so clicks reach these icons on empty desktop.
 */

import { useEffect, useState } from "react";
import { visibleApps, type HostAppId } from "@/lib/core";
import { useHostStore } from "@/lib/host/store";
import { useGodMode } from "@/lib/host/god-mode";
import { AppIcon, APP_ICON_SIZE } from "@/components/ui/app-icons";

const CELL_H = 92; // px per grid row
const TASKBAR_H = 48;
const PAD = 16;

export default function DesktopIcons() {
  const openApp = useHostStore((s) => s.openApp);
  const godMode = useGodMode();
  const level = useHostStore((s) => s.host.user.level);
  const [selected, setSelected] = useState<HostAppId | null>(null);
  const [rows, setRows] = useState(6);

  // Recompute how many icons fit per column so the grid always snaps cleanly.
  useEffect(() => {
    const calc = () =>
      setRows(Math.max(3, Math.floor((window.innerHeight - TASKBAR_H - PAD * 2) / CELL_H)));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const desktopApps = visibleApps(godMode, level).filter((a) => a.showOnDesktop);

  return (
    <div
      className="absolute left-2 top-2 z-10 grid grid-flow-col justify-start gap-x-1"
      style={{ gridTemplateRows: `repeat(${rows}, ${CELL_H}px)` }}
      onClick={() => setSelected(null)}
    >
      {desktopApps.map((app) => (
        <button
          key={app.id}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(app.id);
          }}
          onDoubleClick={() => openApp(app.id)}
          title={`${app.title} — double-click to open`}
          className={`flex w-20 flex-col items-center justify-start gap-1 rounded p-2 text-center transition ${
            selected === app.id ? "bg-info/25 ring-1 ring-info/40" : "hover:bg-white/10"
          }`}
        >
          {/* Tile behind the stroke glyph: SVG strokes need a backdrop to stay
              legible over arbitrary wallpapers, where the old emoji did not. */}
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-gray-100 shadow-sm backdrop-blur-sm">
            <AppIcon id={app.iconId} size={APP_ICON_SIZE.desktop} />
          </span>
          <span className="line-clamp-2 text-[10px] leading-tight text-gray-100 drop-shadow">
            {app.title}
          </span>
        </button>
      ))}
    </div>
  );
}
