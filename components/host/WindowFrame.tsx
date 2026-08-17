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

import { useCallback, useRef, useState } from "react";
import { useHostStore } from "@/lib/host/store";
import {
  EDGE_CURSOR,
  UNSNAP_THRESHOLD,
  applyResize,
  clampPosition,
  rectForZone,
  snapZoneAt,
  type ManagedWindow,
  type ResizeEdge,
  type SnapZone,
  type WindowRect,
} from "@/lib/host/windows";
import SnapGhost from "./SnapGhost";
import SnapMenu from "./SnapMenu";
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
  const snapTo = useHostStore((s) => s.snapTo);
  const unsnap = useHostStore((s) => s.unsnap);

  /*
   * The armed zone is REACT state, unlike the gesture rect.
   *
   * The rect changes every frame and is painted straight to the element; the
   * zone changes a handful of times per drag and has to render a separate
   * ghost element. Putting it in a ref and hand-rendering the ghost would be
   * re-implementing React for four state changes.
   */
  const [zone, setZone] = useState<SnapZone | null>(null);
  const [snapMenu, setSnapMenu] = useState(false);

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
    /** Armed snap zone, mirrored here so `end` never reads stale state. */
    zone: SnapZone | null;
    /** Did a snapped window travel far enough to break out? */
    broke: boolean;
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
    gesture.current = {
      kind, edge, startX: e.clientX, startY: e.clientY, start, latest: start, raf: 0,
      zone: null, broke: false,
    };
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

    if (g.kind === "resize") {
      g.latest = applyResize(g.start, g.edge!, dx, dy, bounds);
      schedule();
      return;
    }

    /*
     * UNSNAP FIRST. A snapped window dragged away restores its floating size
     * mid-gesture, and the restored window is then re-centred under the
     * cursor — otherwise a half-screen window shrinking to 500px would leave
     * the pointer somewhere in the middle of empty space, holding an edge it
     * is no longer over.
     */
    if (win.snap && !g.broke && Math.hypot(dx, dy) > UNSNAP_THRESHOLD) {
      g.broke = true;
      const back = win.restoreRect ?? g.start;
      g.start = {
        ...back,
        x: Math.round(e.clientX - back.w / 2),
        y: Math.round(e.clientY - 18),
      };
      g.startX = e.clientX;
      g.startY = e.clientY;
      unsnap(win.instanceId);
    }

    // The pointer's own position decides the zone, not the window's corner —
    // a window dragged by the middle should snap when the CURSOR hits the edge.
    const parent = frameRef.current?.parentElement?.getBoundingClientRect();
    const localX = e.clientX - (parent?.left ?? 0);
    const localY = e.clientY - (parent?.top ?? 0);
    const next = snapZoneAt(localX, localY, bounds);
    if (next !== g.zone) {
      g.zone = next;
      setZone(next);
    }

    const from = g.broke ? g.start : g.start;
    g.latest = {
      ...from,
      ...clampPosition(from.x + (e.clientX - g.startX), from.y + (e.clientY - g.startY), from, bounds),
    };
    schedule();
  }

  function end(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.raf) cancelAnimationFrame(g.raf);
    // Commit first, then drop the gesture: the store update and the transient
    // styles describe the same rect, so the handover has no intermediate frame.
    if (g.kind === "move") {
      // An armed zone wins over the raw drop position: the operator aimed at
      // an edge, and landing the window a few pixels short of it is not what
      // they asked for.
      if (g.zone) snapTo(win.instanceId, g.zone);
      else move(win.instanceId, g.latest.x, g.latest.y);
    } else {
      resize(win.instanceId, g.latest);
    }
    gesture.current = null;
    setZone(null);
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
      /*
       * `wm-settle` animates left/top/width/height, and is applied ONLY when
       * the window is snapped or maximised and NOT mid-gesture. A transition
       * during a drag would make the frame trail the cursor by its own
       * duration — exactly the lag the rAF gesture path exists to remove.
       */
      className={`pointer-events-auto absolute flex flex-col overflow-hidden border ${
        (win.snap || maximized) && !gesture.current ? "wm-settle" : ""
      } ${
        remote
          ? "border-remote-edge bg-remote-tint shadow-remote"
          : "border-edge bg-panel shadow-2xl shadow-black/60"
      }`}
      style={{ ...rect, zIndex: win.z, borderRadius: maximized ? 0 : "var(--wm-radius)" }}
      onMouseDown={() => focus(win.instanceId)}
    >
      {/* The armed zone, previewed. Rendered inside the frame so it inherits
          the windows layer's coordinate space, and pointer-events-none so it
          never interrupts the drag that is drawing it. */}
      {zone && <SnapGhost rect={rectForZone(zone, boundsOf())} />}

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
          {/* Hovering Maximize offers the layouts, the way Windows 11 does.
              The button still maximises on click — the menu is an addition,
              not a replacement, so the familiar action never gets slower. */}
          <span
            className="relative"
            onMouseEnter={() => setSnapMenu(true)}
            onMouseLeave={() => setSnapMenu(false)}
          >
            <CtrlBtn onClick={() => toggleMaximize(win.instanceId)} label="Maximize">
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
            </CtrlBtn>
            {snapMenu && (
              <SnapMenu
                onPick={(z) => {
                  setSnapMenu(false);
                  snapTo(win.instanceId, z);
                }}
              />
            )}
          </span>
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
