/**
 * TriageOS — Host Window Manager types (Level 0)
 * ==============================================
 * The locked two-window-type model. A single window manager tracks geometry,
 * z-order, and lifecycle for BOTH:
 *   - HostAppWindow      — a Level-0 host application (ITSM, Mail, Gateway…)
 *   - RemoteSessionWindow— a Level-1 nested remote session bound to a NodeId
 *
 * Phase 2 opens only host-app windows; the remote variant is defined now so the
 * WM contract is stable when Phase 3 wires the Gateway "Connect" action.
 */

import type { HostAppId } from "@/lib/core";
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
  icon: string;
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
