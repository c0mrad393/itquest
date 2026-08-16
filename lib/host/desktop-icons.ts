"use client";

/**
 * ITQuest — Desktop icon layout
 * =============================
 * Which shortcuts sit on the desktop, and where.
 *
 * ── CELLS, NOT PIXELS ───────────────────────────────────────────────────────
 *
 * An icon's position is a grid cell — `{col, row}` — and never a pixel offset.
 * That one decision removes the entire class of bugs this feature usually
 * ships with: an icon parked at x=1780 does not vanish when the operator
 * plugs into a 1366-wide projector, because the cell is re-projected into
 * whatever grid the current viewport supports. Pixels would have to be clamped
 * on every resize, and clamping loses the arrangement permanently — two icons
 * pushed into the same corner never separate again when the window widens.
 *
 * The trade is that a cell is only meaningful alongside a column count, so the
 * layout stores the grid it was authored against and `reflow` re-packs when
 * the desktop gets narrower. Re-packing preserves ORDER, which is the part
 * people actually remember about their desktop.
 *
 * ── COLLISIONS ARE RESOLVED, NOT REFUSED ────────────────────────────────────
 *
 * Dropping an icon on an occupied cell does not bounce back to where it came
 * from — a drag that visibly undoes itself feels broken even when it is
 * "correct". The occupant is displaced to the nearest free cell instead, which
 * is what every desktop the player has used already does.
 */

import { create } from "zustand";
import type { HostAppId } from "@/lib/core";

const KEY = "itquest-desktop-icons";
const VERSION = 1;

/** Cell geometry, in pixels. Matches the icon component's own sizing. */
export const CELL_W = 92;
export const CELL_H = 96;
export const GRID_PAD = 12;

export interface IconSlot {
  app: HostAppId;
  col: number;
  row: number;
}

/**
 * What a fresh desktop looks like.
 *
 * The four an operator reaches for on day one, in the order the first-shift
 * tour introduces them — so the desktop agrees with the tutorial rather than
 * presenting a second, differently-ordered version of the same apps.
 */
export const DEFAULT_ICONS: IconSlot[] = [
  { app: "dashboard", col: 0, row: 0 },
  { app: "itsm", col: 0, row: 1 },
  { app: "gateway", col: 0, row: 2 },
  { app: "wiki", col: 0, row: 3 },
];

/** How many cells fit in a desktop of this size. */
export function gridFor(width: number, height: number) {
  return {
    cols: Math.max(1, Math.floor((width - GRID_PAD) / CELL_W)),
    rows: Math.max(1, Math.floor((height - GRID_PAD) / CELL_H)),
  };
}

/** Cell -> pixel origin. Column-major, like every desktop since 1984. */
export function cellToPx(col: number, row: number) {
  return { x: GRID_PAD + col * CELL_W, y: GRID_PAD + row * CELL_H };
}

/** Pixel -> nearest cell. Used to snap a drop. */
export function pxToCell(x: number, y: number) {
  return {
    col: Math.max(0, Math.round((x - GRID_PAD) / CELL_W)),
    row: Math.max(0, Math.round((y - GRID_PAD) / CELL_H)),
  };
}

const keyOf = (c: number, r: number) => `${c}:${r}`;

/**
 * The nearest free cell to a target, searched in rings.
 *
 * Ring order matters: a straight column-then-row scan sends a displaced icon
 * to the top of the next column, which is nowhere near where it was and reads
 * as the desktop throwing it away.
 */
function nearestFree(
  col: number,
  row: number,
  taken: Set<string>,
  cols: number,
  rows: number,
): { col: number; row: number } {
  if (!taken.has(keyOf(col, row)) && col < cols && row < rows) return { col, row };
  for (let ring = 1; ring <= Math.max(cols, rows); ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        if (!taken.has(keyOf(c, r))) return { col: c, row: r };
      }
    }
  }
  return { col, row };
}

/**
 * Place `app` at a cell, displacing whatever is already there.
 *
 * Pure, so the spec can prove the invariant that matters: no two icons ever
 * share a cell, however the drops are sequenced.
 */
export function placeIcon(
  icons: IconSlot[],
  app: HostAppId,
  col: number,
  row: number,
  cols: number,
  rows: number,
): IconSlot[] {
  const c = Math.min(Math.max(0, col), cols - 1);
  const r = Math.min(Math.max(0, row), rows - 1);
  const others = icons.filter((i) => i.app !== app);
  const occupant = others.find((i) => i.col === c && i.row === r);

  const taken = new Set(others.filter((i) => i !== occupant).map((i) => keyOf(i.col, i.row)));
  taken.add(keyOf(c, r));

  return [
    ...others.map((i) => {
      if (i !== occupant) return i;
      // The displaced icon goes to the nearest hole, not back to the start.
      const spot = nearestFree(c, r, taken, cols, rows);
      taken.add(keyOf(spot.col, spot.row));
      return { ...i, ...spot };
    }),
    { app, col: c, row: r },
  ];
}

/**
 * Re-pack a layout into a grid that may no longer fit it.
 *
 * Order is preserved (column-major, the reading order of a desktop) and only
 * icons that fall outside the new grid move. An icon that still fits stays
 * exactly where the operator put it, which is the whole point.
 */
export function reflow(icons: IconSlot[], cols: number, rows: number): IconSlot[] {
  const sorted = [...icons].sort((a, b) => (a.col - b.col) || (a.row - b.row));
  const taken = new Set<string>();
  const out: IconSlot[] = [];
  for (const icon of sorted) {
    const fits = icon.col < cols && icon.row < rows && !taken.has(keyOf(icon.col, icon.row));
    const spot = fits ? { col: icon.col, row: icon.row } : nearestFree(0, 0, taken, cols, rows);
    taken.add(keyOf(spot.col, spot.row));
    out.push({ ...icon, ...spot });
  }
  return out;
}

/** Tidy: re-lay everything into the first column(s), reading order preserved. */
export function autoArrange(icons: IconSlot[], rows: number): IconSlot[] {
  const sorted = [...icons].sort((a, b) => (a.col - b.col) || (a.row - b.row));
  return sorted.map((icon, i) => ({
    ...icon,
    col: Math.floor(i / rows),
    row: i % rows,
  }));
}

// ── Persistence ─────────────────────────────────────────────────────────────
// Its own key, not the save: an arranged desktop is operator preference and
// must survive "start a new estate", exactly like tutorial progress.

function load(): IconSlot[] {
  if (typeof window === "undefined") return DEFAULT_ICONS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ICONS;
    const parsed = JSON.parse(raw) as { version: number; icons: IconSlot[] };
    if (parsed.version !== VERSION || !Array.isArray(parsed.icons)) return DEFAULT_ICONS;
    return parsed.icons.filter(
      (i) => i && typeof i.app === "string" && Number.isFinite(i.col) && Number.isFinite(i.row),
    );
  } catch {
    return DEFAULT_ICONS;
  }
}

function persist(icons: IconSlot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, icons }));
  } catch {
    /* not persisted; the session still honours it */
  }
}

interface DesktopIconStore {
  icons: IconSlot[];
  ready: boolean;
  hydrate: () => void;
  place: (app: HostAppId, col: number, row: number, cols: number, rows: number) => void;
  add: (app: HostAppId, cols: number, rows: number) => void;
  remove: (app: HostAppId) => void;
  tidy: (rows: number) => void;
  reset: () => void;
}

export const useDesktopIconStore = create<DesktopIconStore>((set, get) => ({
  icons: DEFAULT_ICONS,
  ready: false,

  hydrate: () => set({ icons: load(), ready: true }),

  place: (app, col, row, cols, rows) => {
    const icons = placeIcon(get().icons, app, col, row, cols, rows);
    persist(icons);
    set({ icons });
  },

  add: (app, cols, rows) => {
    if (get().icons.some((i) => i.app === app)) return;
    const taken = new Set(get().icons.map((i) => keyOf(i.col, i.row)));
    const spot = nearestFree(0, 0, taken, cols, rows);
    const icons = [...get().icons, { app, ...spot }];
    persist(icons);
    set({ icons });
  },

  remove: (app) => {
    const icons = get().icons.filter((i) => i.app !== app);
    persist(icons);
    set({ icons });
  },

  tidy: (rows) => {
    const icons = autoArrange(get().icons, rows);
    persist(icons);
    set({ icons });
  },

  reset: () => {
    persist(DEFAULT_ICONS);
    set({ icons: DEFAULT_ICONS });
  },
}));
