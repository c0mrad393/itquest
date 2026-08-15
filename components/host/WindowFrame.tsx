"use client";

/**
 * TriageOS — Host window frame (DeskOS 12 style)
 * -----------------------------------------------
 * Draggable, focusable window chrome with minimize / maximize / close, driven
 * by the host store. Handles both window kinds: host-app bodies come from the
 * component registry; remote-session bodies are a Phase-3 placeholder for now.
 */

import { useRef } from "react";
import { useHostStore } from "@/lib/host/store";
import type { ManagedWindow } from "@/lib/host/windows";
import { renderHostApp } from "./app-registry";
import RemoteSession from "./remote/RemoteSession";
import { AppIcon, APP_ICON_SIZE } from "@/components/ui/app-icons";

export default function WindowFrame({ win }: { win: ManagedWindow }) {
  const { focus, close, minimize, toggleMaximize, move } = useHostStore();
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  if (win.mode === "minimized") return null;

  const maximized = win.mode === "maximized";
  // The windows layer is already inset above the taskbar (see HostDesktop), so a
  // maximized window fills it exactly — subtracting the taskbar again here is
  // what used to leave a gap along the bottom edge.
  const rect = maximized
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : { left: win.x, top: win.y, width: win.w, height: win.h };

  function onPointerDown(e: React.PointerEvent) {
    if (maximized) return; // don't drag a maximized window
    focus(win.instanceId);
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    move(win.instanceId, e.clientX - drag.current.dx, e.clientY - drag.current.dy);
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  /*
   * REMOTE WINDOWS LOOK DIFFERENT (v0.9.1). A window onto another machine gets
   * a cool blue frame and a deeper shadow, so it reads as sitting further away
   * than the host's own windows — the recognition happens in peripheral vision,
   * before any label is read. The connection banner inside says it in words;
   * this says it in shape, and the two reinforce each other.
   */
  const remote = win.kind === "remote";

  return (
    <div
      className={`pointer-events-auto absolute flex flex-col overflow-hidden border ${
        remote
          ? "border-remote-edge bg-remote-tint shadow-remote"
          : "border-edge bg-panel shadow-2xl shadow-black/60"
      }`}
      style={{ ...rect, zIndex: win.z, borderRadius: maximized ? 0 : 10 }}
      onMouseDown={() => focus(win.instanceId)}
    >
      {/* Title bar */}
      <div
        className={`flex h-9 shrink-0 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing ${
          remote ? "border-remote-edge bg-remote-bar text-remote-bar-fg" : "border-edge bg-panelalt"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => toggleMaximize(win.instanceId)}
      >
        <span className={`flex items-center ${remote ? "opacity-90" : "text-gray-400"}`}>
          <AppIcon id={win.iconId} size={APP_ICON_SIZE.titlebar} />
        </span>
        <span className={`select-none text-xs font-medium ${remote ? "" : "text-gray-200"}`}>
          {win.title}
        </span>
        {remote && (
          <span className="rounded border border-remote-bar-fg/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider opacity-85">
            {win.protocol}
          </span>
        )}

        <div className="ml-auto flex items-center">
          <CtrlBtn onClick={() => minimize(win.instanceId)} label="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor" /></svg>
          </CtrlBtn>
          <CtrlBtn onClick={() => toggleMaximize(win.instanceId)} label="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
          </CtrlBtn>
          <CtrlBtn onClick={() => close(win.instanceId)} label="Close" danger>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" /></svg>
          </CtrlBtn>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {win.kind === "app" ? renderHostApp(win.appId) : <RemoteSession win={win} />}
      </div>
    </div>
  );
}

function CtrlBtn({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      // `text-current/70` rather than a fixed grey: on a remote title bar the
      // controls inherit the banner's light-on-dark ink in BOTH themes.
      className={`flex h-9 w-11 items-center justify-center opacity-70 transition hover:opacity-100 ${
        danger ? "hover:bg-danger hover:text-danger-on" : "hover:bg-gray-500/20"
      }`}
    >
      {children}
    </button>
  );
}
