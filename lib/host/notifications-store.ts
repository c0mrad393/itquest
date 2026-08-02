"use client";

/**
 * TriageOS — Notification centre
 * ==============================
 * Windows-style toasts plus the Action Center history behind them. Toasts are
 * transient (auto-dismiss); the history persists for the session so the player
 * can review what they accomplished.
 */

import { create } from "zustand";

export type NotificationKind = "success" | "info" | "warning";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** e.g. "+420 XP" — rendered as a highlighted chip. */
  badge?: string;
  at: number;
  read: boolean;
}

interface NotificationState {
  /** Full history, newest first (Action Center). */
  items: AppNotification[];
  /** Ids currently showing as toasts. */
  toasts: string[];
  push: (n: Omit<AppNotification, "id" | "at" | "read">) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

let seq = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  toasts: [],

  push: (n) => {
    const id = `ntf-${Date.now()}-${++seq}`;
    const entry: AppNotification = { ...n, id, at: Date.now(), read: false };
    set((s) => ({ items: [entry, ...s.items].slice(0, 50), toasts: [...s.toasts, id] }));
    // Auto-dismiss the toast; the entry stays in the Action Center.
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t !== id) })), 6000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t !== id) })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
  clear: () => set({ items: [], toasts: [] }),
}));

export function unreadCount(items: AppNotification[]): number {
  return items.filter((i) => !i.read).length;
}
