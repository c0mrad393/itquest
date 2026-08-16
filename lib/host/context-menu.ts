"use client";

/**
 * ITQuest — Global context menu
 * =============================
 * One menu, opened from anywhere, described by data.
 *
 * ── WHY A STORE AND NOT LOCAL STATE ─────────────────────────────────────────
 *
 * A context menu opened from local state has to be rendered by whichever
 * component owns the right-click, which means it is clipped by that
 * component's `overflow: hidden` and stacked inside its z-index. A menu opened
 * on a taskbar button would be trapped inside a 48px-tall bar. So the menu
 * renders ONCE at the desktop root and everything else just describes what it
 * should contain.
 *
 * ── AND WHY THAT COSTS NOTHING ──────────────────────────────────────────────
 *
 * This is a SEPARATE store, not a slice of the host store. Opening a menu
 * writes only here, so the only component that re-renders is the menu itself —
 * no window, no app body, no taskbar button. Putting it in `useHostStore`
 * would have re-rendered every window on every right-click, which is the same
 * over-subscription that made window dragging slow.
 *
 * Items carry their own `onSelect`, so the menu component never learns what
 * any of them mean; it renders a list and calls a function.
 */

import { create } from "zustand";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Right-aligned hint: a shortcut, a state, a count. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

/** A divider between groups. `id` exists so React keys stay stable. */
export interface ContextMenuSeparator {
  id: string;
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export function isSeparator(e: ContextMenuEntry): e is ContextMenuSeparator {
  return "separator" in e;
}

/** Estimated menu box, used to flip the anchor before the menu has measured. */
export const MENU_W = 216;
export const MENU_ITEM_H = 30;
export const MENU_SEP_H = 7;
export const MENU_PAD_Y = 8;

export function menuHeight(entries: ContextMenuEntry[]): number {
  return (
    MENU_PAD_Y * 2 +
    entries.reduce((h, e) => h + (isSeparator(e) ? MENU_SEP_H : MENU_ITEM_H), 0)
  );
}

/**
 * Keep the menu on screen.
 *
 * FLIPS before it clamps, which is the part that is easy to get wrong. A menu
 * opened near the right edge should hang to the LEFT of the cursor, the way
 * every desktop does it — clamping alone would slide it left until it fits and
 * leave the cursor sitting in the middle of the menu, over an item the
 * operator did not aim for and might now click by accident.
 *
 * Pure, so the spec can prove the menu is always fully on screen and never
 * lands under the pointer.
 */
export function placeMenu(
  x: number,
  y: number,
  entries: ContextMenuEntry[],
  vw: number,
  vh: number,
  margin = 8,
): { x: number; y: number } {
  const w = MENU_W;
  const h = menuHeight(entries);

  // Flip when there is not room on the natural side.
  let px = x + w + margin > vw ? x - w : x;
  let py = y + h + margin > vh ? y - h : y;

  // Then clamp, for the case where it fits on neither side (a menu taller than
  // the viewport, or a click in a corner of a tiny window).
  px = Math.min(Math.max(px, margin), Math.max(margin, vw - w - margin));
  py = Math.min(Math.max(py, margin), Math.max(margin, vh - h - margin));

  return { x: Math.round(px), y: Math.round(py) };
}

interface ContextMenuStore {
  open: boolean;
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  /** Labels the surface that opened it, for styling and tests. */
  source: string | null;

  openMenu: (args: { x: number; y: number; entries: ContextMenuEntry[]; source?: string }) => void;
  closeMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  open: false,
  x: 0,
  y: 0,
  entries: [],
  source: null,

  openMenu: ({ x, y, entries, source }) => {
    // Placement happens here rather than in the component so the menu's first
    // paint is already in the right place — measuring after mount would show
    // one frame at the raw cursor position, which reads as a jump.
    const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
    const vh = typeof window === "undefined" ? 900 : window.innerHeight;
    const p = placeMenu(x, y, entries, vw, vh);
    set({ open: true, x: p.x, y: p.y, entries, source: source ?? null });
  },

  closeMenu: () => set({ open: false, entries: [], source: null }),
}));

/**
 * Bind a right-click to a menu.
 *
 * Returns an `onContextMenu` handler, so a call site is one prop rather than
 * four lines of preventDefault-and-position boilerplate repeated per surface.
 */
export function useContextMenu(build: () => ContextMenuEntry[], source?: string) {
  return (e: React.MouseEvent) => {
    const entries = build();
    if (!entries.length) return;
    e.preventDefault();
    // Right-clicking a nested surface should open THAT surface's menu, not
    // also the desktop's underneath it.
    e.stopPropagation();
    useContextMenuStore.getState().openMenu({ x: e.clientX, y: e.clientY, entries, source });
  };
}
