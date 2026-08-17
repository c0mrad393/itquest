"use client";

/**
 * ITQuest Admin — shell UI state
 * ==============================
 * Sidebar collapse, persisted.
 *
 * Its own tiny store rather than local state in the layout, for one reason:
 * the header's collapse toggle and the sidebar are siblings, and lifting the
 * state to their common parent would make every page re-render on a collapse.
 * Two subscribers, nothing else touched.
 *
 * Persisted because a collapsed sidebar is a working preference — an admin who
 * wants the width back should not have to reclaim it on every navigation.
 */

import { create } from "zustand";

const KEY = "itquest-admin-sidebar";

interface AdminUiStore {
  collapsed: boolean;
  ready: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useAdminUi = create<AdminUiStore>((set, get) => ({
  collapsed: false,
  ready: false,

  hydrate: () => {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(KEY) === "1";
    } catch {
      /* default stands */
    }
    set({ collapsed, ready: true });
  },

  toggle: () => {
    const collapsed = !get().collapsed;
    try {
      localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {
      /* preference not persisted; the session still honours it */
    }
    set({ collapsed });
  },
}));
