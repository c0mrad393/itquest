/**
 * ITQuest — Host Desktop store (Level 0 window manager + shell state)
 * ===================================================================
 * Owns presentation state for the operator's Windows-11 workstation: open
 * windows (geometry / z-order / mode), Start-menu visibility, and the host
 * profile/tray. It knows nothing about infrastructure — app bodies read the
 * domain stores themselves.
 */

"use client";

import { create } from "zustand";
import { appUnlockLevel, isAppUnlocked } from "@/lib/progression/unlocks";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { HOST_APP_REGISTRY, type HostAppIconId, type HostAppId } from "@/lib/core";
import type {
  ConnectionProtocol,
  NodeId,
} from "@/lib/core";
import {
  applyResize,
  clampPosition,
  openRect,
  rectForZone,
  type ManagedWindow,
  type SnapZone,
  type WindowRect,
} from "./windows";
import { createHostWorkstation } from "./seed";
import type { HostWorkstationState } from "@/lib/core";
import { levelForXp } from "@/lib/scenario/scoring";
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
  /** Snap a window into a half/quarter, remembering where it came from. */
  snapTo: (instanceId: string, zone: SnapZone) => void;
  /** Release a snap, restoring the floating geometry it had before. */
  unsnap: (instanceId: string) => void;

  /**
   * Deep-link target: the device an app should focus when it opens.
   *
   * SESSION-SCOPED AND ONE-SHOT. It is a navigation intent, not a fact about
   * the world — persisting "focus CAM-101" would have a restored save open the
   * Hardware Lab on a device the player has long since dealt with. The
   * receiving app consumes it and clears it.
   */
  focusTarget: { app: HostAppId; nodeId: string } | null;
  /** Open `app` already focused on `nodeId`. Respects the unlock gate. */
  openAppFocused: (app: HostAppId, nodeId: string) => void;
  clearFocusTarget: () => void;

  setStartMenu: (open: boolean) => void;
  toggleStartMenu: () => void;

  /**
   * Award XP to the operator and recompute their level. Returns the levels
   * crossed, so the caller can announce promotions and open the newly
   * unlocked tiers.
   */
  awardXp: (amount: number) => { from: number; to: number };
  /** Edit the operator's own name/avatar (Profile app). */
  setUserProfile: (patch: { displayName?: string; avatar?: string }) => void;
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

/** The windows layer: the viewport minus the taskbar. */
function desktopBounds() {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 860;
  return { w: vw, h: vh - TASKBAR_H };
}

function centeredRect(w: number, h: number, offset: number): WindowRect {
  return openRect(w, h, offset, desktopBounds());
}

export const useHostStore = create<HostStore>((set, get) => ({
  host: createHostWorkstation(),
  windows: [],
  topZ: 10,
  startMenuOpen: false,

  openApp: (appId) => {
    const meta = HOST_APP_REGISTRY[appId];

    /*
     * THE UNLOCK GATE, and the only one (polish pass).
     *
     * `openApp` previously opened anything it was handed, and six cross-app
     * CTAs call it directly — Monitor's "View licence" button jumped a level-2
     * operator straight into Procurement, which does not unlock until level 4.
     * Gating each button would have left the seventh to be written wrong.
     *
     * So the refusal lives at the one door every path goes through. Callers
     * that want to render a locked state ask `isAppUnlocked` first; callers
     * that forget get a toast naming the level instead of a bypass.
     */
    const level = get().host.user.level;
    if (!isAppUnlocked(appId, level)) {
      useNotificationStore.getState().push({
        kind: "warning",
        title: `${meta.title} is locked`,
        body: `Reach level ${appUnlockLevel(appId)} to unlock it. You are level ${level}.`,
        badge: "Locked",
      });
      set({ startMenuOpen: false });
      return;
    }

    const existing = get().windows.find(
      (w) => w.kind === "app" && w.appId === appId,
    );

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

  /*
   * Both of these now defer to the PURE rules in windows.ts, and that matters
   * more than it looks.
   *
   * This action used to clamp the whole frame inside the viewport while the
   * drag gesture in WindowFrame clamped only enough title bar to stay
   * grabbable. Two rules for one question: the gesture let the operator push a
   * window past the right edge, and the commit on pointerup yanked it back. A
   * visible snap at the end of every drag, caused entirely by the rule living
   * in two places.
   *
   * The looser rule won. "Cannot be lost off-screen" is the real requirement
   * and GRAB_MARGIN satisfies it; refusing to let a window overhang at all
   * fights an operator who is deliberately parking one half-off to see the
   * panel behind it.
   */
  move: (instanceId, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.instanceId === instanceId ? { ...w, ...clampPosition(x, y, w, desktopBounds()) } : w,
      ),
    })),

  resize: (instanceId, rect) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.instanceId !== instanceId) return w;
        // Re-run the constraints even though the gesture already applied them:
        // this action is public, and a caller that has not read windows.ts
        // should not be able to mint a 40px-wide window.
        const safe = applyResize({ x: rect.x, y: rect.y, w: w.w, h: w.h }, "se",
          rect.w - w.w, rect.h - w.h, desktopBounds());
        return { ...w, ...safe, ...clampPosition(rect.x, rect.y, safe, desktopBounds()) };
      }),
    })),

  /*
   * Snapping records `restoreRect` ONLY on the way in.
   *
   * Re-recording it on every snap would mean dragging left, then right, then
   * away restores the LEFT HALF rather than the floating window the operator
   * started with — each snap overwriting the memory of the one before. The
   * original geometry is captured once and survives any number of snaps until
   * the window floats again.
   */
  snapTo: (instanceId, zone) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.instanceId !== instanceId) return w;
        const restoreRect = w.snap || w.mode === "maximized"
          ? w.restoreRect
          : { x: w.x, y: w.y, w: w.w, h: w.h };
        return { ...w, ...rectForZone(zone, desktopBounds()), snap: zone, mode: "normal", restoreRect };
      }),
    })),

  unsnap: (instanceId) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.instanceId !== instanceId || !w.snap) return w;
        const back = w.restoreRect ?? { x: w.x, y: w.y, w: w.w, h: w.h };
        return { ...w, ...back, snap: undefined, restoreRect: undefined };
      }),
    })),

  focusTarget: null,

  openAppFocused: (app, nodeId) => {
    // Set the intent BEFORE opening, so a freshly-mounted app sees it on its
    // first render rather than flashing an unfocused list and then jumping.
    set({ focusTarget: { app, nodeId } });
    get().openApp(app);
  },

  clearFocusTarget: () => set({ focusTarget: null }),

  setStartMenu: (open) => set({ startMenuOpen: open }),
  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),

  setUserProfile: (patch) =>
    set((s) => ({ host: { ...s.host, user: { ...s.host.user, ...patch } } })),

  awardXp: (amount) => {
    const before = get().host.user.level;
    set((s) => {
      const xp = s.host.user.xp + amount;
      const level = levelForXp(xp);
      return { host: { ...s.host, user: { ...s.host.user, xp, level } } };
    });
    // Progression lives in the save slot, written by PersistenceManager. There
    // is no account to sync it to any more.
    return { from: before, to: get().host.user.level };
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
