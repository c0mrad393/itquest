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
import { HOST_APP_REGISTRY, type HostAppIconId, type HostAppId } from "@/lib/core";
import type {
  ConnectionProtocol,
  NodeId,
} from "@/lib/core";
import type { ManagedWindow, WindowRect } from "./windows";
import { createHostWorkstation } from "./seed";
import type { HostWorkstationState } from "@/lib/core";
import { levelForXp } from "@/lib/scenario/scoring";
import { reportProgress } from "@/lib/auth/store";
import { playCue, setAudioEnabled } from "@/lib/audio/engine";

const DESKTOP_MARGIN = 16;
const TASKBAR_H = 48;
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
  openRemote: (nodeId: NodeId, title: string, iconId: HostAppIconId, protocol: ConnectionProtocol) => void;
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

  /**
   * Award XP to the operator and recompute their level. Returns the levels
   * crossed, so the caller can announce promotions and open the newly
   * unlocked tiers.
   */
  awardXp: (amount: number) => { from: number; to: number };
  /** Credit experience to one discipline — drives the dynamic job title. */
  awardSkillXp: (track: string, amount: number) => void;
  /** Personalization: set the desktop wallpaper (persisted with the save). */
  setWallpaper: (id: string) => void;
  /** Personalization: master switch for UI sound cues (persisted). */
  setSoundEnabled: (on: boolean) => void;

  // ── Economy ──
  /** Credit the operator's IT Budget (ticket resolution). */
  awardBudget: (amount: number) => void;
  /**
   * Debit the budget for a purchase. Returns false and changes nothing when
   * the operator cannot afford it — callers must respect the result rather
   * than assuming the spend succeeded.
   */
  spendBudget: (amount: number) => boolean;
  /** Record a purchased software licence (idempotent). */
  grantLicense: (id: string) => void;
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
      iconId: meta.iconId,
      ...rect,
      z,
      mode: "normal",
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z, startMenuOpen: false }));
    playCue("open");
  },

  openRemote: (nodeId, title, iconId, protocol) => {
    const rect = centeredRect(920, 620, get().windows.length);
    const z = get().topZ + 1;
    const win: ManagedWindow = {
      instanceId: nextInstanceId(`remote-${nodeId}`),
      kind: "remote",
      nodeId,
      protocol,
      title,
      iconId,
      ...rect,
      z,
      mode: "normal",
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z, startMenuOpen: false }));
    playCue("open");
  },

  close: (instanceId) => {
    playCue("close");
    set((s) => ({ windows: s.windows.filter((w) => w.instanceId !== instanceId) }));
  },

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

  minimize: (instanceId) => {
    playCue("minimize");
    set((s) => ({
      windows: s.windows.map((w) =>
        w.instanceId === instanceId ? { ...w, mode: "minimized" } : w,
      ),
    }));
  },

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
    set((s) => {
      // Strictly contain windows within the desktop so they can't be lost
      // off-screen: clamp the top-left so the whole frame stays above the
      // taskbar and inside the viewport (or pinned to 0 if larger than it).
      const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
      const vh = typeof window !== "undefined" ? window.innerHeight : 860;
      return {
        windows: s.windows.map((w) => {
          if (w.instanceId !== instanceId) return w;
          const maxX = Math.max(0, vw - w.w);
          const maxY = Math.max(0, vh - TASKBAR_H - w.h);
          return {
            ...w,
            x: Math.min(Math.max(0, x), maxX),
            y: Math.min(Math.max(0, y), maxY),
          };
        }),
      };
    }),

  resize: (instanceId, rect) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.instanceId === instanceId ? { ...w, ...rect } : w)),
    })),

  setStartMenu: (open) => set({ startMenuOpen: open }),
  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),

  awardXp: (amount) => {
    const before = get().host.user.level;
    set((s) => {
      const xp = s.host.user.xp + amount;
      const level = levelForXp(xp);
      return { host: { ...s.host, user: { ...s.host.user, xp, level } } };
    });
    // Persist progression to the account profile (no-op for guests).
    const { xp, level } = get().host.user;
    reportProgress(xp, level);
    return { from: before, to: level };
  },

  awardSkillXp: (track, amount) =>
    set((s) => ({
      host: {
        ...s.host,
        user: {
          ...s.host.user,
          skills: { ...s.host.user.skills, [track]: (s.host.user.skills[track] ?? 0) + amount },
        },
      },
    })),

  setWallpaper: (id) => set((s) => ({ host: { ...s.host, wallpaper: id } })),

  awardBudget: (amount) =>
    set((s) => ({ host: { ...s.host, user: { ...s.host.user, budget: s.host.user.budget + amount } } })),

  spendBudget: (amount) => {
    if (get().host.user.budget < amount) return false;
    set((s) => ({ host: { ...s.host, user: { ...s.host.user, budget: s.host.user.budget - amount } } }));
    return true;
  },

  grantLicense: (id) =>
    set((s) => ({
      host: {
        ...s.host,
        licenses: s.host.licenses.includes(id) ? s.host.licenses : [...s.host.licenses, id],
      },
    })),

  setSoundEnabled: (on) => {
    // The engine holds its own flag so `playCue` stays a plain function call
    // from anywhere, without every caller reaching into the store.
    setAudioEnabled(on);
    if (on) playCue("open"); // confirm the change audibly
    set((s) => ({ host: { ...s.host, soundEnabled: on } }));
  },
}));
