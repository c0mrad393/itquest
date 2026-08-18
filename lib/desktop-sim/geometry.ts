/**
 * ITQuest — Spatial system for the build simulator
 * ================================================
 * ONE coordinate space, derived from real hardware dimensions.
 *
 * ── WHY MILLIMETRES ─────────────────────────────────────────────────────────
 *
 * The previous renderer drew every part inside its own 0-100 box and scaled it
 * by eye at the call site. Nothing was proportioned to anything else, so a
 * screw head came out the size of a DIMM and a GPU came out smaller than the
 * socket it plugs into. That is not a styling bug — it is the absence of a
 * shared unit.
 *
 * So every dimension in this file is stated in MILLIMETRES, taken from the
 * actual specifications (ATX is 305 x 244mm; a DIMM is 133.35mm long; an LGA
 * socket is 37.5mm square; an M.2 2280 is 80 x 22mm; a case screw head is
 * about 6mm across). `mm()` converts to canvas units through a single scale.
 * A part cannot be the wrong size relative to another part unless the real
 * hardware is, which is the property the old system lacked entirely.
 *
 * ── ONE CANVAS ──────────────────────────────────────────────────────────────
 *
 * 1600 x 1000, fixed. Everything — bench, case, board, parts on the tray, the
 * drag layer — lives in it. No CSS positioning of parts, so there is no second
 * space to keep in sync and no way for a part to be positioned relative to the
 * wrong ancestor.
 */

import type { PartId } from "./parts";

/** Canvas extents. Every coordinate in the simulator is inside this box. */
export const CANVAS = { w: 1600, h: 1000 } as const;

/**
 * Canvas units per millimetre.
 *
 * Chosen so a 305mm ATX board is 610 units wide — large enough that a 6mm
 * screw head is still 12 units and legible, small enough that the board plus
 * its case and a tray of parts fit 1600 x 1000 without scrolling.
 */
export const SCALE = 2;

/** Millimetres to canvas units. The only conversion in the codebase. */
export function mm(v: number): number {
  return v * SCALE;
}

/** Real dimensions, in millimetres. Sourced from the actual form factors. */
export const SPEC_MM = {
  atxBoard: { w: 305, h: 244 },
  /** Mid-tower interior, the volume the board and PSU share. */
  caseInner: { w: 360, h: 400 },
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

// ── The scene ───────────────────────────────────────────────────────────────

/** Case exterior, centred slightly left to leave a tray column on the right. */
export const CASE_OUTER: Box = {
  x: 300,
  y: 90,
  w: mm(SPEC_MM.caseInner.w + SPEC_MM.caseWall * 2),
  h: mm(SPEC_MM.caseInner.h + SPEC_MM.caseWall * 2),
};

export const CASE_INNER: Box = {
  x: CASE_OUTER.x + mm(SPEC_MM.caseWall),
  y: CASE_OUTER.y + mm(SPEC_MM.caseWall),
  w: mm(SPEC_MM.caseInner.w),
  h: mm(SPEC_MM.caseInner.h),
};

/**
 * The motherboard, mounted top-left inside the case as ATX specifies.
 *
 * Its origin is the anchor for every socket below — slots are expressed as
 * offsets from the board, so moving the board moves its sockets with it and
 * they cannot drift apart.
 */
export const BOARD: Box = {
  x: CASE_INNER.x + mm(8),
  y: CASE_INNER.y + mm(10),
  w: mm(SPEC_MM.atxBoard.w),
  h: mm(SPEC_MM.atxBoard.h),
};

/** PSU basement, below the board — where a mid-tower puts it. */
export const PSU_BAY: Box = {
  x: CASE_INNER.x + mm(6),
  y: CASE_INNER.y + CASE_INNER.h - mm(SPEC_MM.atxPsu.h) - mm(8),
  w: mm(SPEC_MM.atxPsu.w),
  h: mm(SPEC_MM.atxPsu.h),
};

/** A named drop target with an explicit bounding box. */
export interface Zone {
  id: string;
  label: string;
  box: Box;
  /**
   * Which part may land here. Typed to the union rather than `string`, so a
   * zone cannot advertise a part id that does not exist — the compiler catches
   * a renamed part instead of the slot silently accepting nothing.
   */
  accepts: PartId;
}

/**
 * Board-relative offsets, in millimetres, matching an ATX layout: socket in
 * the upper middle, DIMMs to its right, PCIe down the lower left, M.2 between
 * the expansion slots.
 */
const OFF = {
  socket: { x: 120, y: 45 },
  dimm0: { x: 195, y: 30 },
  dimmPitch: 11,
  pcie16: { x: 20, y: 150 },
  pcie1: { x: 20, y: 120 },
  m2: { x: 20, y: 185 },
} as const;

function boardZone(id: string, label: string, accepts: PartId, ox: number, oy: number, dim: { w: number; h: number }): Zone {
  return { id, label, accepts, box: boxOf(BOARD.x + mm(ox), BOARD.y + mm(oy), dim) };
}

/**
 * Every drop target in the scene, with a real bounding box.
 *
 * These are the only positions a part can occupy once installed. The view does
 * not compute placement — it reads it, which is what makes a part land ON its
 * slot rather than near it.
 */
export const ZONES: Zone[] = [
  {
    id: "board-tray",
    label: "Motherboard tray",
    accepts: "mobo",
    box: BOARD,
  },
  boardZone("socket", "LGA socket", "cpu", OFF.socket.x, OFF.socket.y, SPEC_MM.lgaSocket),
  boardZone("paste", "CPU die", "paste", OFF.socket.x + 8, OFF.socket.y + 8, { w: 21, h: 21 }),
  boardZone("cooler", "Cooler mount", "cooler", OFF.socket.x - 27, OFF.socket.y - 27, SPEC_MM.cooler),
  boardZone("dimm-a1", "DIMM A1", "ram1", OFF.dimm0.x, OFF.dimm0.y, SPEC_MM.dimmSlot),
  boardZone("dimm-a2", "DIMM A2", "ram2", OFF.dimm0.x, OFF.dimm0.y + OFF.dimmPitch, SPEC_MM.dimmSlot),
  boardZone("m2-1", "M.2 slot 1", "ssd", OFF.m2.x, OFF.m2.y, SPEC_MM.m2_2280),
  boardZone("pcie-x16", "PCIe x16", "gpu", OFF.pcie16.x, OFF.pcie16.y, SPEC_MM.pcieX16),
  { id: "psu-bay", label: "PSU bay", accepts: "psu", box: PSU_BAY },
];

export function zoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export function zoneFor(partId: PartId): Zone | undefined {
  return ZONES.find((z) => z.accepts === partId);
}

/**
 * Nine motherboard standoffs, on the ATX hole pattern.
 *
 * Real positions, so a board sits on screws that are actually under it rather
 * than on decoration scattered near it.
 */
export const STANDOFFS: { id: string; x: number; y: number }[] = [
  { id: "so-1", x: 6.35, y: 10.16 },
  { id: "so-2", x: 6.35, y: 154.94 },
  { id: "so-3", x: 6.35, y: 236.22 },
  { id: "so-4", x: 163.83, y: 10.16 },
  { id: "so-5", x: 163.83, y: 154.94 },
  { id: "so-6", x: 163.83, y: 236.22 },
  { id: "so-7", x: 288.29, y: 10.16 },
  { id: "so-8", x: 288.29, y: 154.94 },
  { id: "so-9", x: 288.29, y: 236.22 },
].map((s) => ({ id: s.id, x: BOARD.x + mm(s.x), y: BOARD.y + mm(s.y) }));

/**
 * Where uninstalled parts rest, in canvas space.
 *
 * A column to the right of the case and a row beneath it — the reference sheet
 * arranges parts on a grid, and a grid is also the only way a tray stays
 * legible as parts leave and return to it.
 */
export const TRAY: Record<PartId, { x: number; y: number; rot: number }> = {
  /*
   * A single column to the right of the case, laid out so no two footprints
   * overlap and nothing sits inside the chassis. The GPU and PSU were
   * previously placed at x=380/900 — coordinates that fall INSIDE the case,
   * so they drew on top of the very slots they were meant to be dragged into.
   * Every entry below is checked against its own trayBox extent.
   */
  mobo: { x: 1150, y: 120, rot: 0 },
  ram1: { x: 1150, y: 450, rot: 0 },
  ram2: { x: 1340, y: 450, rot: 0 },
  cpu: { x: 1150, y: 515, rot: 0 },
  paste: { x: 1230, y: 525, rot: 0 },
  cooler: { x: 1400, y: 505, rot: 0 },
  ssd: { x: 1150, y: 640, rot: 0 },
  gpu: { x: 1150, y: 710, rot: 0 },
  psu: { x: 1150, y: 870, rot: 0 },
};

/** Snap radius in canvas units — the brief's 30px, in this space. */
export const SNAP_RADIUS = 60;

/**
 * The nearest zone that will accept this part, if the pointer is close enough.
 *
 * Returns null outside the radius so a drag that ends nowhere near a slot puts
 * the part back on the tray rather than teleporting it across the bench.
 */
export function snapTarget(partId: PartId, p: { x: number; y: number }): Zone | null {
  const z = zoneFor(partId);
  if (!z) return null;
  return distanceTo(z.box, p) <= SNAP_RADIUS ? z : null;
}

// ── Part footprints ─────────────────────────────────────────────────────────

/**
 * How large each part is when seated, in millimetres.
 *
 * A part is NOT the size of its slot: a DIMM slot is 133 x 5mm but the module
 * standing in it is 133 x 31mm, and a graphics card is 270mm long hanging off
 * an 89mm connector. Conflating the two is how a GPU ends up drawn smaller
 * than the socket beside it.
 */
export const PART_MM: Record<PartId, { w: number; h: number }> = {
  mobo: SPEC_MM.atxBoard,
  cpu: SPEC_MM.cpuPackage,
  paste: { w: 60, h: 16 },
  cooler: SPEC_MM.cooler,
  ram1: SPEC_MM.dimmModule,
  ram2: SPEC_MM.dimmModule,
  ssd: SPEC_MM.m2_2280,
  gpu: SPEC_MM.gpu,
  psu: SPEC_MM.atxPsu,
};

/**
 * Where a part actually sits once installed.
 *
 * Anchored to its zone, then grown to the part's own footprint. Cards and
 * modules extend DOWN and LEFT from their connector, which is the direction
 * real hardware hangs once seated.
 */
export function seatBox(partId: PartId): Box | null {
  const z = zoneFor(partId);
  const size = PART_MM[partId];
  if (!z || !size) return null;
  const w = mm(size.w);
  const h = mm(size.h);

  // A DIMM stands proud of its slot; a card hangs below its connector.
  if (partId === "ram1" || partId === "ram2") {
    return { x: z.box.x, y: z.box.y - (h - z.box.h), w, h };
  }
  if (partId === "gpu") {
    return { x: z.box.x, y: z.box.y - h * 0.18, w, h };
  }
  // Everything else is centred on its zone.
  return {
    x: z.box.x + (z.box.w - w) / 2,
    y: z.box.y + (z.box.h - h) / 2,
    w,
    h,
  };
}

/** Where a part rests on the tray, at its own footprint. */
export function trayBox(partId: PartId): Box {
  const t = TRAY[partId] ?? { x: 1200, y: 200, rot: 0 };
  const size = PART_MM[partId] ?? { w: 60, h: 40 };
  // Tray copies are shown at 62%: the bench is a workspace, and a 540-unit GPU
  // laid out at full size would crowd out everything beside it.
  const s = 0.62;
  return { x: t.x, y: t.y, w: mm(size.w) * s, h: mm(size.h) * s };
}
