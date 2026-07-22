/**
 * TriageOS — Host Desktop store (Level 0 window manager + shell state)
 * ===================================================================
 * Owns presentation state for the operator's Windows-11 workstation: open
 * windows (geometry / z-order / mode), Start-menu visibility, and the host
 * profile/tray. It knows nothing about infrastructure — app bodies read the
 * domain stores themselves.
 */

"use client";

import { create } from "zustand";
import { HOST_APP_REGISTRY, type HostAppId } from "@/lib/core";
import type {
  ConnectionProtocol,
  NodeId,
} from "@/lib/core";
import type { ManagedWindow, WindowRect } from "./windows";
import { createHostWorkstation } from "./seed";
import type { HostWorkstationState } from "@/lib/core";
import { levelForXp } from "@/lib/scenario/scoring";

const DESKTOP_MARGIN = 16;
let instanceCounter = 0;
const nextInstanceId = (prefix: string) => `${prefix}-${++instanceCounter}`;

interface HostStore {
  host: HostWorkstationState;
  windows: ManagedWindow[];
  topZ: number;
  startMenuOpen: boolean;

  /** Open (or focus, if singleton + already open) a host app. */
  openApp: (appId: HostAppId) => void;
  /** Open a nested remote session window for a node (used from Phase 3). */
  openRemote: (nodeId: NodeId, title: string, icon: string, protocol: ConnectionProtocol) => void;
  close: (instanceId: string) => void;
  focus: (instanceId: string) => void;
  minimize: (instanceId: string) => void;
  toggleMaximize: (instanceId: string) => void;
  /** Click a taskbar button: minimize if focused-on-top, else focus/restore. */
  taskbarActivate: (instanceId: string) => void;
  move: (instanceId: string, x: number, y: number) => void;
  resize: (instanceId: string, rect: WindowRect) => void;

  setStartMenu: (open: boolean) => void;
  toggleStartMenu: () => void;

  /** Award XP to the operator and recompute their level. */
  awardXp: (amount: number) => void;
}

function centeredRect(w: number, h: number, offset: number): WindowRect {
  // Cascade around the viewport center (guarded for SSR).
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 860;
  const cascade = (offset % 5) * 28;
  return {
    x: Math.max(DESKTOP_MARGIN, Math.round((vw - w) / 2) + cascade - 56),
    y: Math.max(DESKTOP_MARGIN, Math.round((vh - h) / 2) + cascade - 40),
    w,
    h,
  };
}

export const useHostStore = create<HostStore>((set, get) => ({
  host: createHostWorkstation(),
  windows: [],
  topZ: 10,
  startMenuOpen: false,

  openApp: (appId) => {
    const existing = get().windows.find(
      (w) => w.kind === "app" && w.appId === appId,
    );
    const meta = HOST_APP_REGISTRY[appId];

    // Singleton apps focus their existing instance instead of duplicating.
    if (existing && meta.singleton) {
      get().focus(existing.instanceId);
      set({ startMenuOpen: false });
      return;
    }

    const rect = centeredRect(meta.defaultSize.w, meta.defaultSize.h, get().windows.length);
    const z = get().topZ + 1;
    const win: ManagedWindow = {
      instanceId: nextInstanceId(appId),
      kind: "app",
      appId,
      title: meta.title,
      icon: meta.icon,
      ...rect,
      z,
      mode: "normal",
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z, startMenuOpen: false }));
  },

  openRemote: (nodeId, title, icon, protocol) => {
    const rect = centeredRect(920, 620, get().windows.length);
    const z = get().topZ + 1;
    const win: ManagedWindow = {
      instanceId: nextInstanceId(`remote-${nodeId}`),
      kind: "remote",
      nodeId,
      protocol,
      title,
      icon,
      ...rect,
      z,
      mode: "normal",
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z, startMenuOpen: false }));
  },

  close: (instanceId) =>
    set((s) => ({ windows: s.windows.filter((w) => w.instanceId !== instanceId) })),

  focus: (instanceId) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.instanceId === instanceId
            ? { ...w, z, mode: w.mode === "minimized" ? "normal" : w.mode }
            : w,
        ),
      };
    }),

  minimize: (instanceId) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.instanceId === instanceId ? { ...w, mode: "minimized" } : w,
      ),
    })),

  toggleMaximize: (instanceId) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) => {
          if (w.instanceId !== instanceId) return w;
          if (w.mode === "maximized") {
            const r = w.restoreRect ?? { x: 80, y: 60, w: w.w, h: w.h };
            return { ...w, ...r, mode: "normal", z, restoreRect: undefined };
          }
          return {
            ...w,
            mode: "maximized",
            z,
            restoreRect: { x: w.x, y: w.y, w: w.w, h: w.h },
          };
        }),
      };
    }),

  taskbarActivate: (instanceId) =>
    set((s) => {
      const win = s.windows.find((w) => w.instanceId === instanceId);
      if (!win) return s;
      const isTop = win.z === Math.max(...s.windows.map((w) => w.z));
      // If it's focused & on top, clicking the taskbar minimizes it (Win behavior).
      if (isTop && win.mode !== "minimized") {
        return {
          windows: s.windows.map((w) =>
            w.instanceId === instanceId ? { ...w, mode: "minimized" } : w,
          ),
        } as Partial<HostStore>;
      }
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.instanceId === instanceId ? { ...w, z, mode: "normal" } : w,
        ),
      } as Partial<HostStore>;
    }),

  move: (instanceId, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.instanceId === instanceId ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w,
      ),
    })),

  resize: (instanceId, rect) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.instanceId === instanceId ? { ...w, ...rect } : w)),
    })),

  setStartMenu: (open) => set({ startMenuOpen: open }),
  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),

  awardXp: (amount) =>
    set((s) => {
      const xp = s.host.user.xp + amount;
      const level = levelForXp(xp);
      return { host: { ...s.host, user: { ...s.host.user, xp, level } } };
    }),
}));
