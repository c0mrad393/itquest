/**
 * TriageOS — Desktop / Window Manager store
 * -----------------------------------------
 * Owns ONLY presentation state for the simulated RDP desktop: which app
 * windows are open, their geometry, z-order, and minimized flag.
 *
 * It deliberately knows NOTHING about the machine — every window renders an
 * "app" that reads/mutates the shared VMState via useVMStore. This keeps the
 * separation clean: desktop = chrome, VM store = system truth.
 */

"use client";

import { create } from "zustand";

export type AppId = "services" | "network" | "activedirectory" | "files";

export interface WindowState {
  id: AppId;
  title: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  open: boolean;
  minimized: boolean;
}

/** Static catalog of available desktop apps (shown as desktop icons). */
export const APP_CATALOG: Record<
  AppId,
  { title: string; icon: string; w: number; h: number }
> = {
  services: { title: "Control Panel — Services", icon: "⚙", w: 460, h: 360 },
  network: { title: "Control Panel — Network Adapters", icon: "🖧", w: 460, h: 300 },
  activedirectory: { title: "Active Directory — Users", icon: "👥", w: 520, h: 380 },
  files: { title: "File Explorer", icon: "🗂", w: 560, h: 400 },
};

interface DesktopStore {
  windows: Record<AppId, WindowState>;
  topZ: number;
  open: (id: AppId) => void;
  close: (id: AppId) => void;
  focus: (id: AppId) => void;
  toggleMinimize: (id: AppId) => void;
  move: (id: AppId, x: number, y: number) => void;
}

function seedWindows(): Record<AppId, WindowState> {
  const ids = Object.keys(APP_CATALOG) as AppId[];
  const out = {} as Record<AppId, WindowState>;
  ids.forEach((id, i) => {
    const meta = APP_CATALOG[id];
    out[id] = {
      id,
      title: meta.title,
      icon: meta.icon,
      x: 80 + i * 40,
      y: 60 + i * 36,
      w: meta.w,
      h: meta.h,
      z: 1,
      open: false,
      minimized: false,
    };
  });
  return out;
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  windows: seedWindows(),
  topZ: 1,

  open: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: {
          ...s.windows,
          [id]: { ...s.windows[id], open: true, minimized: false, z },
        },
      };
    }),

  close: (id) =>
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], open: false } },
    })),

  focus: (id) =>
    set((s) => {
      if (!s.windows[id].open) return s;
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: { ...s.windows, [id]: { ...s.windows[id], z, minimized: false } },
      };
    }),

  toggleMinimize: (id) =>
    set((s) => ({
      windows: {
        ...s.windows,
        [id]: { ...s.windows[id], minimized: !s.windows[id].minimized },
      },
    })),

  move: (id, x, y) =>
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], x, y } },
    })),
}));
