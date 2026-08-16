/**
 * ITQuest — Host Window Manager types (Level 0)
 * ==============================================
 * The locked two-window-type model. A single window manager tracks geometry,
 * z-order, and lifecycle for BOTH:
 *   - HostAppWindow      — a Level-0 host application (ITSM, Mail, Gateway…)
 *   - RemoteSessionWindow— a Level-1 nested remote session bound to a NodeId
 *
 * Phase 2 opens only host-app windows; the remote variant is defined now so the
 * WM contract is stable when Phase 3 wires the Gateway "Connect" action.
 */

import type { HostAppIconId, HostAppId } from "@/lib/core";
import type { ConnectionProtocol, NodeId } from "@/lib/core";

export type WindowKind = "app" | "remote";
export type WindowMode = "normal" | "minimized" | "maximized";

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BaseWindow extends WindowRect {
  /** Unique per open window instance (not per app). */
  instanceId: string;
  kind: WindowKind;
  title: string;
  /** Serializable icon key resolved by `AppIcon` at render time — never JSX. */
  iconId: HostAppIconId;
  z: number;
  mode: WindowMode;
  /** Geometry to restore to when un-maximizing. */
  restoreRect?: WindowRect;
}

export interface HostAppWindow extends BaseWindow {
  kind: "app";
  appId: HostAppId;
}

export interface RemoteSessionWindow extends BaseWindow {
  kind: "remote";
  nodeId: NodeId;
  protocol: ConnectionProtocol;
}

/** Discriminated union of everything the WM can manage. Narrow on `.kind`. */
export type ManagedWindow = HostAppWindow | RemoteSessionWindow;

/* ── Geometry rules for dragging and resizing ────────────────────────────────
 *
 * Pure, so the spec can exercise every edge case without a DOM. The component
 * layer decides WHEN a gesture happens; these decide WHAT the resulting rect
 * is allowed to be.
 */

/** Below this a window stops being a window and becomes a broken layout. */
export const MIN_W = 360;
export const MIN_H = 220;
/** Keep this much of the title bar reachable, so a window can always be moved. */
export const GRAB_MARGIN = 48;

export interface Bounds {
  w: number;
  h: number;
}

/** The eight resize grips, named by the edges they move. */
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Keep a window reachable.
 *
 * Deliberately NOT "keep the window fully inside the desktop". Clamping all
 * four sides means a window can never be positioned half-off the left edge,
 * which is a normal thing to want when comparing two panels — and on a desktop
 * narrower than the window it would fight the operator on every drag. The real
 * requirement is weaker and more useful: enough title bar must remain on
 * screen to grab it again. Everything else may hang off.
 */
export function clampPosition(x: number, y: number, rect: WindowRect, bounds: Bounds) {
  return {
    x: Math.round(Math.min(Math.max(x, GRAB_MARGIN - rect.w), bounds.w - GRAB_MARGIN)),
    // The top is clamped hard at 0: a title bar dragged above the desktop is
    // unreachable in a way an off-screen left edge is not.
    y: Math.round(Math.min(Math.max(y, 0), bounds.h - GRAB_MARGIN)),
  };
}

/**
 * Resolve a resize gesture into a rect.
 *
 * `start` is the geometry when the grip was FIRST pressed, and the deltas are
 * measured from that same instant — never applied incrementally frame to
 * frame. Incremental application accumulates rounding error over a long drag
 * and, worse, drifts whenever a frame is dropped, so the window slowly
 * separates from the cursor.
 *
 * Dragging a top or left edge moves the origin as well as the size, and the
 * two must stay consistent at the minimum: when height bottoms out, `y` has to
 * stop with it or the window slides while refusing to shrink.
 */
export function applyResize(
  start: WindowRect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  bounds: Bounds,
): WindowRect {
  let { x, y, w, h } = start;

  if (edge.includes("e")) w = start.w + dx;
  if (edge.includes("s")) h = start.h + dy;
  if (edge.includes("w")) {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (edge.includes("n")) {
    h = start.h - dy;
    y = start.y + dy;
  }

  // Enforce the minimum by pinning the anchored edge, not by shifting both.
  if (w < MIN_W) {
    if (edge.includes("w")) x = start.x + start.w - MIN_W;
    w = MIN_W;
  }
  if (h < MIN_H) {
    if (edge.includes("n")) y = start.y + start.h - MIN_H;
    h = MIN_H;
  }

  // A window may not be taller or wider than the desktop it lives in; past
  // that the chrome is unreachable and maximise is the right tool anyway.
  w = Math.min(w, bounds.w);
  h = Math.min(h, bounds.h);

  // Never let a top-edge drag push the title bar off the top.
  if (y < 0) {
    if (edge.includes("n")) h = Math.max(MIN_H, start.y + start.h);
    y = 0;
  }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Cursor for each grip, so the affordance is right before the press. */
export const EDGE_CURSOR: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};
