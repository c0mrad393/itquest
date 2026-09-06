/**
 * ITQuest — Bench spatial primitives
 * ===================================
 * The parts of the coordinate system that are true for every machine: the
 * canvas, the millimetre conversion, a box and the handful of operations on
 * one, and the paint order.
 *
 * Split out from `geometry.ts` so `chassis.ts` can describe a machine in these
 * terms without importing the chassis-aware layer that reads it back — the
 * cycle that would otherwise force the three machine layouts to live inside
 * the maths that consumes them.
 */

/** The single coordinate space every machine is drawn in. */
export const CANVAS = { w: 1600, h: 1000 } as const;

/**
 * Canvas units per millimetre.
 *
 * One scale for every machine, so a 6mm screw head is the same size on a
 * laptop as on a server and the three cannot drift into private scales.
 */
export const SCALE = 2;

/** Millimetres to canvas units. The only conversion in the codebase. */
export function mm(v: number): number {
  return v * SCALE;
}

/** Shared component dimensions, in millimetres. */
export const SPEC_MM = {
  /* Desktop */
  atxBoard: { w: 244, h: 305 },
  caseInner: { w: 300, h: 420 },
  caseWall: 12,
  lgaSocket: { w: 37.5, h: 37.5 },
  /** A DIMM slot is long and thin — the detail the old sheet got most wrong. */
  dimmSlot: { w: 133, h: 5 },
  dimmModule: { w: 133, h: 31 },
  pcieX16: { w: 89, h: 4.5 },
  pcieX1: { w: 25, h: 4.5 },
  m2_2280: { w: 80, h: 22 },
  gpu: { w: 270, h: 110 },
  atxPsu: { w: 150, h: 86 },
  cooler: { w: 92, h: 92 },
  cpuPackage: { w: 37.5, h: 37.5 },
  /** A #6-32 case screw head. 12 canvas units — not the 40 it was drawn at. */
  screwHead: 6,
  standoff: 8,

  /* Laptop */
  soDimm: { w: 67.6, h: 30 },
  m2_2230: { w: 30, h: 22 },
  laptopBattery: { w: 268, h: 100 },
  laptopBoard: { w: 330, h: 92 },
  blowerFan: { w: 60, h: 60 },
  heatpipe: { w: 120, h: 12 },

  /* Server */
  eebBoard: { w: 330, h: 305 },
  rdimm: { w: 133, h: 31 },
  serverHeatsink: { w: 80, h: 80 },
  driveCaddy: { w: 120, h: 80 },
  serverPsu: { w: 120, h: 76 },
  airBaffle: { w: 290, h: 150 },
  pcieRiser: { w: 152, h: 20 },
} as const;

/** A box in canvas space. Every zone and part occupies one. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxOf(x: number, y: number, dim: { w: number; h: number }): Box {
  return { x, y, w: mm(dim.w), h: mm(dim.h) };
}

/**
 * Box to SVG rect attributes.
 *
 * A `Box` carries `w`/`h`; `<rect>` wants `width`/`height`. Spreading a Box
 * straight onto a rect therefore renders NOTHING — the element is valid, sized
 * zero, and silently invisible. That is a whole class of "why is my case not
 * drawing" bug, so the conversion lives here and is the only way to place one.
 */
export function rectOf(b: Box): { x: number; y: number; width: number; height: number } {
  return { x: b.x, y: b.y, width: b.w, height: b.h };
}

export function centreOf(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Distance from a point to a box's centre — the snap test. */
export function distanceTo(b: Box, p: { x: number; y: number }): number {
  const c = centreOf(b);
  return Math.hypot(c.x - p.x, c.y - p.y);
}

/** Do two boxes share any area? */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Is `inner` entirely within `outer`, within a hair of tolerance? */
export function contains(outer: Box, inner: Box, tol = 0.01): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

/**
 * Strict paint order.
 *
 * Rendered as sequential groups rather than via z-index, because SVG has no
 * z-index — document order IS depth, and the "broken Z-indexing" in the old
 * renderer was exactly this misunderstanding. A part cannot draw over a screw
 * unless it is in a later group.
 */
export const LAYER = {
  bench: 0,
  caseShell: 1,
  board: 2,
  installed: 3,
  cables: 4,
  fasteners: 5,
  dragging: 6,
} as const;
