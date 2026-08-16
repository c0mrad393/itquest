"use client";

/**
 * ITQuest — Host window frame (DeskOS 12 style)
 * ---------------------------------------------
 * Draggable, RESIZABLE, focusable window chrome driven by the host store.
 *
 * ── HOW GEOMETRY IS TRACKED DURING A GESTURE ────────────────────────────────
 *
 * The obvious build writes the new rect into the store on every pointermove.
 * That was the previous drag implementation, and it has two problems — one
 * visible, one not:
 *
 *   1. Every store write re-renders every subscriber. This component used to
 *      call `useHostStore()` and destructure, which subscribes to the WHOLE
 *      store — so dragging one window re-rendered every other open window, and
 *      each of those re-renders an entire app body. Six windows open meant six
 *      app trees reconciled sixty times a second.
 *
 *   2. React's render is not synchronised to the pointer. Under load the
 *      window visibly lags the cursor, which reads as an imitation of a
 *      desktop rather than a desktop.
 *
 * So a gesture does NOT touch React state. It writes `left/top/width/height`
 * straight onto the element inside a rAF and commits to the store exactly
 * once, on pointerup. The store stays the source of truth for everything that
 * is not the live gesture; the gesture is a temporary visual override lasting
 * as long as the button is down.
 *
 * Two details make that safe rather than clever:
 *
 *   - Deltas are always measured from the rect captured at POINTERDOWN, never
 *     accumulated frame to frame, so a dropped frame cannot make the window
 *     drift away from the cursor.
 *   - The store commit happens BEFORE the gesture is dropped, so the element
 *     never has a frame showing the old rect after the new one was decided.
 *
 * Actions are selected one at a time (`useHostStore((s) => s.move)`) rather
 * than destructured. Zustand hands back stable function identities, so this
 * subscribes to nothing that changes and the frame re-renders only when its
 * OWN window object does.
 *
 * What geometry is LEGAL is pure and lives in lib/host/windows.ts.
 */

import { useCallback, useRef } from "react";
import { useHostStore } from "@/lib/host/store";
import {
  EDGE_CURSOR,
  applyResize,
  clampPosition,
  type ManagedWindow,
  type ResizeEdge,
  type WindowRect,
} from "@/lib/host/windows";
import { renderHostApp } from "./app-registry";
import RemoteSession from "./remote/RemoteSession";
import { AppIcon, APP_ICON_SIZE } from "@/components/ui/app-icons";

/** Every grip, with the class that positions its hit area. */
const GRIPS: { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "left-3 right-3 top-0 h-1.5 -translate-y-1/2" },
  { edge: "s", className: "left-3 right-3 bottom-0 h-1.5 translate-y-1/2" },
  { edge: "w", className: "bottom-3 left-0 top-3 w-1.5 -translate-x-1/2" },
  { edge: "e", className: "bottom-3 right-0 top-3 w-1.5 translate-x-1/2" },
  { edge: "nw", className: "left-0 top-0 h-3.5 w-3.5 -translate-x-1/3 -translate-y-1/3" },
  { edge: "ne", className: "right-0 top-0 h-3.5 w-3.5 -translate-y-1/3 translate-x-1/3" },
  { edge: "sw", className: "bottom-0 left-0 h-3.5 w-3.5 -translate-x-1/3 translate-y-1/3" },
  { edge: "se", className: "bottom-0 right-0 h-3.5 w-3.5 translate-x-1/3 translate-y-1/3" },
];

export default function WindowFrame({ win }: { win: ManagedWindow }) {
  const focus = useHostStore((s) => s.focus);
  const close = useHostStore((s) => s.close);
  const minimize = useHostStore((s) => s.minimize);
  const toggleMaximize = useHostStore((s) => s.toggleMaximize);
  const move = useHostStore((s) => s.move);
  const resize = useHostStore((s) => s.resize);

  const frameRef = useRef<HTMLDivElement>(null);
  /** Live gesture state. A ref, so updating it never renders. */
  const gesture = useRef<{
    kind: "move" | "resize";
    edge?: ResizeEdge;
    startX: number;
    startY: number;
    start: WindowRect;
    latest: WindowRect;
    raf: number;
  } | null>(null);

  const maximized = win.mode === "maximized";

  /** The desktop area a window may occupy — the windows layer, not the page. */
  const boundsOf = useCallback(() => {
    const parent = frameRef.current?.parentElement;
    return parent
      ? { w: parent.clientWidth, h: parent.clientHeight }
      : { w: window.innerWidth, h: window.innerHeight - 48 };
  }, []);

  /** Paint the transient rect. One write per frame, no React involved. */
  const paint = useCallback(() => {
    const g = gesture.current;
    const el = frameRef.current;
    if (!g || !el) return;
    el.style.left = `${g.latest.x}px`;
    el.style.top = `${g.latest.y}px`;
    el.style.width = `${g.latest.w}px`;
    el.style.height = `${g.latest.h}px`;
    g.raf = 0;
  }, []);

  const schedule = useCallback(() => {
    const g = gesture.current;
    if (!g || g.raf) return;
    g.raf = requestAnimationFrame(paint);
  }, [paint]);

  function begin(e: React.PointerEvent, kind: "move" | "resize", edge?: ResizeEdge) {
    if (maximized) return;

    /*
     * ── THE WINDOW-CONTROLS BUG, AND ITS ACTUAL CAUSE ──────────────────────
     *
     * A press that starts on a CONTROL is that control's press, not a drag.
     *
     * The controls live inside the title bar, so `pointerdown` on the close
     * button bubbles here and starts a move gesture — which calls
     * `setPointerCapture` on the TITLE BAR. Capture retargets every later
     * pointer event to the capturing element, so `pointerup` was delivered to
     * the title bar too, and a `click` only fires when down and up land on the
     * same element. The button never got one. Close, minimise and maximise
     * were all dead, in exactly the way that was reported.
     *
     * Maximised windows worked because `begin` returns above this line, so no
     * capture was ever taken. That was the tell, and I misread it last time as
     * "the grips disappear when maximised" and went after z-index — which was
     * a real but separate 3px overlap, and fixing it changed nothing here
     * because hit-testing was never what was broken. `elementFromPoint` said
     * the button was on top and it was right; the click was being destroyed
     * afterwards, by capture.
     *
     * The guard is `closest("button")` rather than a check on `e.target`
     * directly because the press usually lands on the SVG path inside the
     * button, not the button itself.
     */
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;

    e.stopPropagation();
    focus(win.instanceId);
    const start: WindowRect = { x: win.x, y: win.y, w: win.w, h: win.h };
    gesture.current = { kind, edge, startX: e.clientX, startY: e.clientY, start, latest: start, raf: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // While a gesture runs, nothing on the page should select text or light up
    // a hover state as the window sweeps across it.
    document.body.classList.add("wm-gesture");
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const bounds = boundsOf();
    g.latest =
      g.kind === "move"
        ? { ...g.start, ...clampPosition(g.start.x + dx, g.start.y + dy, g.start, bounds) }
        : applyResize(g.start, g.edge!, dx, dy, bounds);
    schedule();
  }

  function end(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.raf) cancelAnimationFrame(g.raf);
    // Commit first, then drop the gesture: the store update and the transient
    // styles describe the same rect, so the handover has no intermediate frame.
    if (g.kind === "move") move(win.instanceId, g.latest.x, g.latest.y);
    else resize(win.instanceId, g.latest);
    gesture.current = null;
    document.body.classList.remove("wm-gesture");
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture already lost — nothing to release */
    }
  }

  if (win.mode === "minimized") return null;

  // The windows layer is already inset above the taskbar (see HostDesktop), so a
  // maximized window fills it exactly — subtracting the taskbar again here is
  // what used to leave a gap along the bottom edge.
  const rect = maximized
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : { left: win.x, top: win.y, width: win.w, height: win.h };

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
      ref={frameRef}
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
        style={{ touchAction: "none" }}
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
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

        {/*
          `relative z-20` — ABOVE the resize grips, and this is a bug fix, not
          a tidy-up.

          The grips are `absolute z-10`; the title bar is a static flex child,
          so z-10 wins over all of it. Individually the overlaps look trivial —
          the `n` grip takes the top 3px of every control, `ne` takes a 14px
          square over the close button's top-right, `e` takes its right 3px —
          but the close button is the corner-most control, so the corner a user
          naturally aims for was entirely dead. Maximised windows were
          unaffected because grips do not render at all there, which is exactly
          the symptom that got reported.

          Raising the CLUSTER rather than the whole title bar is deliberate:
          the rest of the top edge should still resize, and nobody wants to
          drag a window's height from the close button.
        */}
        <div className="relative z-20 ml-auto flex items-center">
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

      {/*
        Resize grips, rendered LAST so they sit above the body — an app that
        paints to its own edge would otherwise swallow the pointer first.

        The hit areas straddle the border rather than sitting inside it. Half
        outside gives the few pixels of overshoot every real window manager
        allows, and is the difference between "grabs first time" and "grabs on
        the third try".
      */}
      {!maximized &&
        GRIPS.map(({ edge, className }) => (
          <div
            key={edge}
            role="presentation"
            aria-hidden="true"
            onPointerDown={(e) => begin(e, "resize", edge)}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            className={`absolute z-10 ${className}`}
            style={{ cursor: EDGE_CURSOR[edge], touchAction: "none" }}
          />
        ))}
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
