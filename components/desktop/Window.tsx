"use client";

/**
 * TriageOS — Window chrome
 * ------------------------
 * A draggable, focusable window frame for the simulated desktop. Pointer-based
 * drag on the title bar; min/close controls; z-order via the desktop store.
 * Content is injected as children (the app body).
 */

import { useRef } from "react";
import { useDesktopStore, type WindowState } from "@/lib/desktop/store";

export default function Window({
  win,
  children,
}: {
  win: WindowState;
  children: React.ReactNode;
}) {
  const { focus, close, toggleMinimize, move } = useDesktopStore();
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  if (!win.open || win.minimized) return null;

  function onPointerDown(e: React.PointerEvent) {
    focus(win.id);
    dragRef.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    move(
      win.id,
      Math.max(0, e.clientX - dragRef.current.dx),
      Math.max(0, e.clientY - dragRef.current.dy),
    );
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl"
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onMouseDown={() => focus(win.id)}
    >
      {/* Title bar (drag handle) */}
      <div
        className="flex cursor-grab items-center gap-2 border-b border-edge bg-panelalt px-3 py-2 text-xs active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="text-sm">{win.icon}</span>
        <span className="select-none font-semibold text-gray-200">{win.title}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => toggleMinimize(win.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-edge hover:text-gray-100"
            aria-label="Minimize"
          >
            —
          </button>
          <button
            onClick={() => close(win.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-danger hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto term-scroll">{children}</div>
    </div>
  );
}
