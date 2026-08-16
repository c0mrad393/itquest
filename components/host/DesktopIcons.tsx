"use client";

/**
 * ITQuest — Desktop shortcuts
 * ===========================
 * Draggable, grid-snapped app icons on the wallpaper.
 *
 * The gesture uses the SAME architecture as WindowFrame: pointer capture, the
 * transient position written straight to the element inside a rAF, and one
 * store commit on drop. Nothing here re-renders while the icon is moving.
 *
 * Where it differs is the commit: a window commits the pixels it ended on, an
 * icon commits the CELL those pixels are nearest. Snapping at commit rather
 * than during the drag means the icon tracks the cursor exactly and lands on
 * the grid — snapping live makes the icon stutter between cells and feels like
 * lag rather than magnetism. The drop target is previewed instead, so the
 * operator still knows where it will land.
 *
 * SVG icons only — no emoji.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import { HOST_APP_REGISTRY } from "@/lib/core";
import { AppIcon } from "@/components/ui/app-icons";
import {
  CELL_H,
  CELL_W,
  cellToPx,
  gridFor,
  pxToCell,
  useDesktopIconStore,
} from "@/lib/host/desktop-icons";

export default function DesktopIcons() {
  const icons = useDesktopIconStore((s) => s.icons);
  const hydrate = useDesktopIconStore((s) => s.hydrate);
  const place = useDesktopIconStore((s) => s.place);
  const openApp = useHostStore((s) => s.openApp);

  const layerRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ col: number; row: number } | null>(null);

  useEffect(() => hydrate(), [hydrate]);

  const gridOf = useCallback(() => {
    const el = layerRef.current;
    return gridFor(el?.clientWidth ?? 1440, el?.clientHeight ?? 800);
  }, []);

  return (
    <div ref={layerRef} className="absolute inset-0 z-10">
      {/* Drop preview: a hollow cell showing where the icon will land. */}
      {ghost && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-wm border border-dashed border-gray-200/40 bg-gray-100/[0.06]"
          style={{ ...cellToPx(ghost.col, ghost.row), width: CELL_W - 8, height: CELL_H - 8 }}
        />
      )}
      {icons.map((slot) => (
        <DesktopIcon
          key={slot.app}
          slot={slot}
          onOpen={() => openApp(slot.app)}
          onPreview={setGhost}
          onDrop={(col, row) => {
            const { cols, rows } = gridOf();
            place(slot.app, col, row, cols, rows);
            setGhost(null);
          }}
        />
      ))}
    </div>
  );
}

function DesktopIcon({
  slot,
  onOpen,
  onPreview,
  onDrop,
}: {
  slot: { app: string; col: number; row: number };
  onOpen: () => void;
  onPreview: (c: { col: number; row: number } | null) => void;
  onDrop: (col: number, row: number) => void;
}) {
  const meta = HOST_APP_REGISTRY[slot.app as keyof typeof HOST_APP_REGISTRY];
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; raf: number; moved: boolean } | null>(null);

  const base = cellToPx(slot.col, slot.row);

  function down(e: React.PointerEvent) {
    const origin = cellToPx(slot.col, slot.row);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: origin.x, oy: origin.y, raf: 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function movePointer(e: React.PointerEvent) {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    // A few pixels of slack, so a click with an unsteady hand is still a click.
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    d.moved = true;
    const x = d.ox + dx;
    const y = d.oy + dy;
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.zIndex = "40";
        d.raf = 0;
        onPreview(pxToCell(x, y));
      });
    }
  }

  function up(e: React.PointerEvent) {
    const d = drag.current;
    const el = ref.current;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture already lost */
    }
    if (!d.moved) {
      onOpen();
      onPreview(null);
      return;
    }
    const x = d.ox + (e.clientX - d.sx);
    const y = d.oy + (e.clientY - d.sy);
    const cell = pxToCell(x, y);
    // Clear the transient styles BEFORE the commit re-renders with the snapped
    // position, or the inline left/top would win over the new props.
    if (el) {
      el.style.left = "";
      el.style.top = "";
      el.style.zIndex = "";
    }
    onDrop(cell.col, cell.row);
  }

  if (!meta) return null;

  return (
    <button
      ref={ref}
      onPointerDown={down}
      onPointerMove={movePointer}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ left: base.x, top: base.y, width: CELL_W - 8, height: CELL_H - 8, touchAction: "none" }}
      className="group absolute flex select-none flex-col items-center justify-center gap-1.5 rounded-wm p-1 text-center transition-colors hover:bg-gray-100/10 focus-visible:bg-gray-100/15"
      title={meta.description}
    >
      <span className="desktop-glyph flex h-11 w-11 items-center justify-center rounded-wm bg-gray-900/45 text-gray-100 backdrop-blur-sm transition group-hover:bg-gray-900/60">
        <AppIcon id={meta.iconId} size={20} />
      </span>
      <span className="desktop-label line-clamp-2 px-0.5 text-[10.5px] font-medium leading-tight text-white">
        {meta.title}
      </span>
    </button>
  );
}
