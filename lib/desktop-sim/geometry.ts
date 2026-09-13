/**
 * ITQuest — Bench geometry
 * =========================
 * The maths that turns a `Chassis` into boxes on the canvas.
 *
 * ── ONE COORDINATE SPACE, THREE MACHINES ────────────────────────────────────
 *
 * Every function here takes the chassis it is working on. Nothing in this file
 * knows what a desktop is. That is the property that lets a laptop and a
 * server share the renderer instead of forking it, and it is enforced by the
 * signatures: there is no module-level board, case or tray left to reach for.
 *
 * ── SLOTS AND DROP ZONES ARE THE SAME NUMBERS ───────────────────────────────
 *
 * A slot is declared once, in normalised board space, and both the art and the
 * drop zone are derived from it by `boardSlotBox`. They were previously two
 * independent coordinate sets, which is why nothing was ever "wrong" and yet
 * every part landed beside its socket: the two sets were simply never the same
 * numbers.
 */

import {
  CANVAS,
  LAYER,
  SCALE,
  SPEC_MM,
  boxOf,
  centreOf,
  contains,
  distanceTo,
  mm,
  overlaps,
  rectOf,
  type Box,
} from "./geometry-primitives";
import {
  CHASSIS,
  chassisForPart,
  chassisOf,
  type BoardSlot,
  type Chassis,
  type ChassisId,
  type PartId,
} from "./chassis";

export {
  CANVAS,
  LAYER,
  SCALE,
  SPEC_MM,
  boxOf,
  centreOf,
  contains,
  distanceTo,
  mm,
  overlaps,
  rectOf,
  CHASSIS,
  chassisOf,
  chassisForPart,
};
export type { Box, BoardSlot, Chassis, ChassisId };

/** A named drop target with an explicit bounding box. */
export interface Zone {
  id: string;
  label: string;
  accepts: PartId;
  box: Box;
}

/** Normalised board space to canvas space, for one chassis. */
export function boardSlotBox(c: Chassis, s: BoardSlot): Box {
  const sx = c.board.w / 100;
  const sy = c.board.h / c.boardArtH;
  return { x: c.board.x + s.x * sx, y: c.board.y + s.y * sy, w: s.w * sx, h: s.h * sy };
}

/**
 * Every drop target on a machine: the slots on its board plus the bays in its
 * shell. Derived, so a slot is drawn exactly where its part lands.
 */
export function zonesOf(c: Chassis): Zone[] {
  return [
    ...c.bays.map((b) => ({ id: b.id, label: b.label, accepts: b.accepts, box: b.box })),
    ...c.slots.map((s) => ({ id: s.id, label: s.label, accepts: s.accepts, box: boardSlotBox(c, s) })),
  ];
}

export function zoneById(c: Chassis, id: string): Zone | undefined {
  return zonesOf(c).find((z) => z.id === id);
}

export function zoneFor(c: Chassis, partId: PartId): Zone | undefined {
  return zonesOf(c).find((z) => z.accepts === partId);
}

/** Snap radius in canvas units — the brief's 30px, in this space. */
export const SNAP_RADIUS = 60;

/**
 * The nearest zone that will accept this part, if the pointer is close enough.
 *
 * Returns null outside the radius so a drag that ends nowhere near a slot puts
 * the part back on the tray rather than teleporting it across the bench.
 */
export function snapTarget(c: Chassis, partId: PartId, p: { x: number; y: number }): Zone | null {
  const z = zoneFor(c, partId);
  if (!z) return null;
  return distanceTo(z.box, p) <= SNAP_RADIUS ? z : null;
}

// ── Part footprints ─────────────────────────────────────────────────────────

/**
 * How large each part is, in millimetres, lying on the bench.
 *
 * A part is NOT the size of its slot: a DIMM slot is 133 x 5mm but the module
 * standing in it is 133 x 31mm, and a graphics card is 270mm long hanging off
 * an 89mm connector. Conflating the two is how a GPU ends up drawn smaller
 * than the socket beside it.
 */
export const PART_MM: Record<PartId, { w: number; h: number }> = {
  // Desktop
  mobo: SPEC_MM.atxBoard,
  cpu: SPEC_MM.cpuPackage,
  paste: { w: 60, h: 16 },
  cooler: SPEC_MM.cooler,
  ram1: SPEC_MM.dimmModule,
  ram2: SPEC_MM.dimmModule,
  ssd: SPEC_MM.m2_2280,
  gpu: SPEC_MM.gpu,
  psu: SPEC_MM.atxPsu,
  // Laptop
  lapboard: SPEC_MM.laptopBoard,
  battery: SPEC_MM.laptopBattery,
  sodimm1: SPEC_MM.soDimm,
  sodimm2: SPEC_MM.soDimm,
  nvme: SPEC_MM.m2_2280,
  wlan: SPEC_MM.m2_2230,
  blower: SPEC_MM.blowerFan,
  heatpipe: SPEC_MM.heatpipe,
  // Server
  srvboard: SPEC_MM.eebBoard,
  cpuA: { w: 56, h: 46 },
  cpuB: { w: 56, h: 46 },
  hsA: SPEC_MM.serverHeatsink,
  hsB: SPEC_MM.serverHeatsink,
  rdimm1: SPEC_MM.rdimm,
  rdimm2: SPEC_MM.rdimm,
  rdimm3: SPEC_MM.rdimm,
  rdimm4: SPEC_MM.rdimm,
  psuA: SPEC_MM.serverPsu,
  psuB: SPEC_MM.serverPsu,
  bayA: SPEC_MM.driveCaddy,
  bayB: SPEC_MM.driveCaddy,
  baffle: SPEC_MM.airBaffle,
  riser: SPEC_MM.pcieRiser,
};

/**
 * Footprint a part occupies ONCE SEATED, where that differs from its body.
 *
 * `PART_MM` is the part lying on the bench: a DIMM is 133 x 31mm, and that is
 * exactly how it should look in the tray. But a seated DIMM does not lie down —
 * it STANDS in its slot, perpendicular to the board. Looked at from above, the
 * 31mm is height out of the board plane and what you actually see is the
 * module's 133mm length and roughly 15mm of body-plus-clips across.
 *
 * Using the flat footprint for the seat is what laid a DIMM sideways across
 * the board and pushed it out through the wall of the case.
 *
 * A SO-DIMM is absent on purpose: it lies flat in its hinged slot rather than
 * standing, which is exactly why a notebook can be 18mm thick.
 */
export const SEAT_MM: Partial<Record<PartId, { w: number; h: number }>> = {
  ram1: { w: 15, h: SPEC_MM.dimmModule.w },
  ram2: { w: 15, h: SPEC_MM.dimmModule.w },
  rdimm1: { w: 15, h: SPEC_MM.rdimm.w },
  rdimm2: { w: 15, h: SPEC_MM.rdimm.w },
  rdimm3: { w: 15, h: SPEC_MM.rdimm.w },
  rdimm4: { w: 15, h: SPEC_MM.rdimm.w },
};

/** Degrees the ARTWORK turns when seated, for parts that stand in a slot. */
export const SEAT_ROT: Partial<Record<PartId, number>> = {
  ram1: 90, ram2: 90,
  rdimm1: 90, rdimm2: 90, rdimm3: 90, rdimm4: 90,
};

/** Seated footprint, falling back to the part's own body. */
export function seatDims(partId: PartId): { w: number; h: number } {
  return SEAT_MM[partId] ?? PART_MM[partId];
}

/**
 * Where a part actually sits once installed.
 *
 * Anchored to its zone, then grown to the part's SEATED footprint. Cards hang
 * down and left from their connector; modules that stand in a slot are centred
 * on it and proud at both ends.
 */
export function seatBox(c: Chassis, partId: PartId): Box | null {
  const z = zoneFor(c, partId);
  const size = seatDims(partId);
  if (!z || !size) return null;
  const w = mm(size.w);
  const h = mm(size.h);

  // A card hangs down from its connector, which is the direction real hardware
  // hangs once seated.
  if (partId === "gpu") {
    return { x: z.box.x, y: z.box.y - h * 0.18, w, h };
  }
  // Everything else is centred on its zone — including the standing modules,
  // which is what keeps a DIMM on its own slot instead of across its neighbour.
  return {
    x: z.box.x + (z.box.w - w) / 2,
    y: z.box.y + (z.box.h - h) / 2,
    w,
    h,
  };
}

/** Where a part rests on the tray, at its own footprint. */
export function trayBox(c: Chassis, partId: PartId): Box {
  const t = c.tray[partId] ?? { x: 1200, y: 200 };
  const size = PART_MM[partId] ?? { w: 60, h: 40 };
  // Tray copies are shrunk: the bench is a workspace, and a 540-unit GPU laid
  // out at full size would crowd out everything beside it. The factor is the
  // chassis's, because how much room the column has depends on how big the
  // machine beside it is and how many parts it has.
  const s = c.trayScale;
  return { x: t.x, y: t.y, w: mm(size.w) * s, h: mm(size.h) * s };
}

/**
 * The height each part's artwork occupies when its width is normalised to 100.
 *
 * This is the fix for stretched parts. Art was drawn in a square 0-100 box and
 * then scaled by `(box.w/100, box.h/100)` — two DIFFERENT factors — so a DIMM
 * whose slot is 266 x 62 was squashed 2.7x wide and 0.6x tall. Every part was
 * distorted, and no amount of redrawing helps while the transform is
 * non-uniform.
 */
export function artHeight(partId: PartId, seated = false): number {
  const d = seated ? seatDims(partId) : PART_MM[partId];
  // A seated part whose art turns a quarter is still DRAWN lengthwise, so its
  // artboard aspect is the seated footprint transposed back to the drawn axis.
  const turned = seated && (SEAT_ROT[partId] ?? 0) % 180 !== 0;
  return turned ? (d.w / d.h) * 100 : (d.h / d.w) * 100;
}

/**
 * Where a part's art lands, preserving aspect.
 *
 * Returns a complete SVG transform. Art is always drawn in a 100 x artHeight
 * box and placed with ONE uniform scale — two different factors is what
 * stretched every part before, and it is the thing this function exists to
 * make impossible.
 *
 * When a part turns to meet its slot, the art rotates about the seat's centre.
 * The scale then comes from the seat's SHORT axis against the artboard height,
 * because a quarter turn swaps which axis the art's width spans.
 */
export function artTransform(partId: PartId, box: Box, seated = false): string {
  const rot = seated ? SEAT_ROT[partId] ?? 0 : 0;
  const artH = artHeight(partId, seated);

  if (rot % 360 === 0) {
    const scale = box.w / 100;
    const h = artH * scale;
    // Vertically centred on the seat, so a tall part straddles a thin slot the
    // way a real module stands proud of the connector it sits in.
    return `translate(${box.x} ${box.y + (box.h - h) / 2}) scale(${scale})`;
  }

  const scale = box.w / artH;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Right-to-left: centre the artboard on the origin, scale, turn, then move
  // the origin to the seat's centre.
  return `translate(${cx} ${cy}) rotate(${rot}) scale(${scale}) translate(-50 ${-artH / 2})`;
}

// ── Tray labels ─────────────────────────────────────────────────────────────

/** The tray scale the label constants were originally drawn against. */
const LABEL_REFERENCE_SCALE = 0.62;

/**
 * How a part's name is drawn under it on the tray.
 *
 * These were fixed numbers — 15px, 18 units below the art — chosen against the
 * desktop's 0.62 tray and then inherited unchanged by the server's 0.42 one.
 * The server carries fifteen parts to the desktop's nine, so its tray is
 * packed tighter, and a label that did not shrink with it collided twice
 * over: sideways into the neighbour's name ("Heatsink 0" and "Heatsink 1" run
 * together at a 77-unit pitch), and downwards onto the artwork of the row
 * below, because 18 units of gap is most of the distance between two rows of
 * DIMMs.
 *
 * The parts themselves never overlapped — `trayScale` was added to guarantee
 * that and the specs check it. The labels were simply not part of that
 * guarantee, so they were free to land anywhere.
 *
 * The tray is ONE drawing at ONE scale and its labels belong to it, so they
 * scale with it. The floor is where the text stops being readable at all,
 * which no amount of packing justifies crossing.
 */
export const LABEL_MIN_SIZE = 10;

export function trayLabel(c: Chassis): { fontSize: number; gap: number } {
  const k = c.trayScale / LABEL_REFERENCE_SCALE;
  return {
    fontSize: Math.max(LABEL_MIN_SIZE, Math.round(15 * k)),
    gap: Math.max(8, Math.round(18 * k)),
  };
}

/**
 * The box a tray label occupies, for collision checks.
 *
 * The width is an ESTIMATE — SVG text cannot be measured without a document —
 * and it is deliberately a generous one. A specification that assumes labels
 * are narrower than they are would pass while they overlap on screen, which is
 * the exact failure this exists to catch.
 */
export const LABEL_CHAR_W = 0.62;

export function trayLabelBox(c: Chassis, partId: PartId, label: string): Box {
  const b = trayBox(c, partId);
  const { fontSize, gap } = trayLabel(c);
  const w = label.length * fontSize * LABEL_CHAR_W;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h + gap - fontSize, w, h: fontSize };
}
