/**
 * ITQuest — Machine architectures for the hardware bench
 * ======================================================
 * Three machines, one engine. This module owns WHAT each machine is made of
 * and WHERE every piece of it lives; `parts.ts` owns how a build behaves and
 * `geometry.ts` owns the maths that turns these numbers into boxes.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The bench used to be a single hard-coded ATX desktop: the case, the board,
 * the slots and the tray were all module-level constants. Adding a laptop
 * meant either a second renderer or a pile of conditionals inside the first.
 * Both are how the previous hardware engine ended up with three topologies
 * that drifted apart until none of them matched its own spec.
 *
 * So a machine is DATA. The renderer draws whatever chassis it is handed, and
 * a new machine is a new entry here rather than a new branch in the view.
 *
 * ── THE THREE ARE DELIBERATELY NOT THE SAME SHAPE ───────────────────────────
 *
 * A laptop that is a small desktop, or a server that is a wide desktop, would
 * teach nothing. What actually differs is the WORK:
 *
 *   desktop  A tower, seen from the open side panel. Portrait board, PSU in
 *            the basement, a tower cooler, vertical DIMMs. You build it from
 *            an empty case.
 *
 *   laptop   The underside, with the base cover off. The battery dominates and
 *            has to come out FIRST — that is a real safety rule, not a
 *            difficulty gate. Memory is stacked SO-DIMMs, and the two M.2
 *            cards are deliberately different lengths, because telling a 2280
 *            from a 2230 is a thing technicians actually get wrong.
 *
 *   server   A 2U, lid off, front at the left. Two sockets with DIMM banks
 *            flanking them, an air baffle that must come off before you can
 *            reach anything, redundant PSUs, and drive caddies at the front
 *            that are the one thing here you can change while it runs.
 *
 * Millimetres throughout, converted once by `mm()`. Slot positions are in
 * NORMALISED board space (0-100 across, 0-boardArtH down) so the drawn art and
 * the drop zones cannot be two different coordinate systems — the bug that
 * made every part land beside its socket in the previous engine.
 */

import { CANVAS, SCALE, mm, type Box } from "./geometry-primitives";

export type ChassisId = "desktop" | "laptop" | "server";

/**
 * Every part across all three machines.
 *
 * One flat union rather than a union-of-unions: a part id has to survive a
 * round trip through the store, the save file and the ticket grader, and a
 * discriminated shape at that boundary buys nothing but casts.
 */
export type PartId =
  // ── Desktop (ATX tower) ──
  | "mobo" | "psu" | "cpu" | "paste" | "cooler" | "ram1" | "ram2" | "ssd" | "gpu"
  // ── Laptop (bottom cover off) ──
  | "lapboard" | "battery" | "sodimm1" | "sodimm2" | "nvme" | "wlan" | "blower" | "heatpipe"
  // ── Server (2U, lid off) ──
  | "srvboard" | "cpuA" | "cpuB" | "hsA" | "hsB"
  | "rdimm1" | "rdimm2" | "rdimm3" | "rdimm4"
  | "psuA" | "psuB" | "bayA" | "bayB" | "baffle" | "riser";

export type CableId =
  | "atx24" | "cpu8" | "pcie8"      // desktop
  | "battconn" | "fanconn"          // laptop
  | "backplane" | "psubus";         // server

/** A slot drawn on the board, in normalised board space. */
export interface BoardSlot {
  id: string;
  label: string;
  accepts: PartId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A bay in the chassis itself rather than on the board, in canvas space. */
export interface ChassisBay {
  id: string;
  label: string;
  accepts: PartId;
  box: Box;
}

export interface Chassis {
  id: ChassisId;
  label: string;
  /** One line on the bench header — what you are looking at. */
  view: string;
  /** Outer shell. */
  outer: Box;
  /** Interior volume. */
  inner: Box;
  /** Where the main PCB sits. Every `slots` entry is relative to this. */
  board: Box;
  /** The board art's height when its width is normalised to 100. */
  boardArtH: number;
  slots: BoardSlot[];
  bays: ChassisBay[];
  /** Fastener positions in canvas space. */
  standoffs: { id: string; x: number; y: number }[];
  /** Where loose parts rest before they are fitted, in canvas space. */
  tray: Partial<Record<PartId, { x: number; y: number }>>;
  /** Everything this machine is made of, in the order it is built. */
  parts: PartId[];
  cables: CableId[];
}

// ────────────────────────────────────────────────────────────────────────────
// Desktop — ATX mid-tower, side panel off
// ────────────────────────────────────────────────────────────────────────────

const DESK_MM = { inner: { w: 300, h: 420 }, wall: 12, board: { w: 244, h: 305 } };

const DESK_OUTER: Box = {
  x: 300,
  y: 90,
  w: mm(DESK_MM.inner.w + DESK_MM.wall * 2),
  h: mm(DESK_MM.inner.h + DESK_MM.wall * 2),
};
const DESK_INNER: Box = {
  x: DESK_OUTER.x + mm(DESK_MM.wall),
  y: DESK_OUTER.y + mm(DESK_MM.wall),
  w: mm(DESK_MM.inner.w),
  h: mm(DESK_MM.inner.h),
};
const DESK_BOARD: Box = {
  x: DESK_INNER.x + mm(10),
  y: DESK_INNER.y + mm(8),
  w: mm(DESK_MM.board.w),
  h: mm(DESK_MM.board.h),
};

export const DESKTOP: Chassis = {
  id: "desktop",
  label: "ATX desktop",
  view: "Mid-tower, side panel off",
  outer: DESK_OUTER,
  inner: DESK_INNER,
  board: DESK_BOARD,
  boardArtH: (DESK_MM.board.h / DESK_MM.board.w) * 100,
  slots: [
    { id: "socket", label: "LGA socket", accepts: "cpu", x: 30, y: 12, w: 26, h: 26 },
    { id: "paste", label: "CPU die", accepts: "paste", x: 36, y: 18, w: 14, h: 14 },
    { id: "cooler", label: "Cooler mount", accepts: "cooler", x: 26, y: 8, w: 34, h: 34 },
    // DIMMs stand vertically down the right of the socket, as they do on a
    // board mounted in a tower.
    { id: "dimm-a1", label: "DIMM A1", accepts: "ram1", x: 66, y: 8, w: 4.5, h: 48 },
    { id: "dimm-a2", label: "DIMM A2", accepts: "ram2", x: 73, y: 8, w: 4.5, h: 48 },
    { id: "pcie-x16", label: "PCIe x16", accepts: "gpu", x: 8, y: 78, w: 62, h: 5 },
    { id: "m2-1", label: "M.2 slot 1", accepts: "ssd", x: 14, y: 68, w: 46, h: 4 },
  ],
  bays: [
    { id: "board-tray", label: "Motherboard tray", accepts: "mobo", box: DESK_BOARD },
    {
      id: "psu-bay",
      label: "PSU basement",
      accepts: "psu",
      box: {
        x: DESK_INNER.x + mm(6),
        y: DESK_INNER.y + DESK_INNER.h - mm(86) - mm(8),
        w: mm(150),
        h: mm(86),
      },
    },
  ],
  standoffs: [
    { id: "so-1", x: 10.16, y: 6.35 },
    { id: "so-2", x: 154.94, y: 6.35 },
    { id: "so-3", x: 236.22, y: 6.35 },
    { id: "so-4", x: 10.16, y: 163.83 },
    { id: "so-5", x: 154.94, y: 163.83 },
    { id: "so-6", x: 236.22, y: 163.83 },
    { id: "so-7", x: 10.16, y: 288.29 },
    { id: "so-8", x: 154.94, y: 288.29 },
    { id: "so-9", x: 236.22, y: 288.29 },
  ].map((s) => ({ id: s.id, x: DESK_BOARD.x + mm(s.x), y: DESK_BOARD.y + mm(s.y) })),
  tray: {
    mobo: { x: 1148, y: 96 },
    ram1: { x: 1148, y: 496 },
    ram2: { x: 1330, y: 496 },
    cpu: { x: 1148, y: 548 },
    paste: { x: 1210, y: 558 },
    cooler: { x: 1300, y: 540 },
    ssd: { x: 1148, y: 606 },
    gpu: { x: 1148, y: 676 },
    psu: { x: 1148, y: 838 },
  },
  parts: ["mobo", "psu", "cpu", "paste", "cooler", "ram1", "ram2", "ssd", "gpu"],
  cables: ["atx24", "cpu8", "pcie8"],
};

// ────────────────────────────────────────────────────────────────────────────
// Laptop — 15" notebook, base cover off, seen from underneath
// ────────────────────────────────────────────────────────────────────────────

const LAP_MM = { inner: { w: 358, h: 240 }, wall: 8, board: { w: 330, h: 92 } };

const LAP_OUTER: Box = {
  x: 150,
  y: 210,
  w: mm(LAP_MM.inner.w + LAP_MM.wall * 2),
  h: mm(LAP_MM.inner.h + LAP_MM.wall * 2),
};
const LAP_INNER: Box = {
  x: LAP_OUTER.x + mm(LAP_MM.wall),
  y: LAP_OUTER.y + mm(LAP_MM.wall),
  w: mm(LAP_MM.inner.w),
  h: mm(LAP_MM.inner.h),
};
/** The mainboard is a strip along the hinge edge — it does not fill the shell. */
const LAP_BOARD: Box = {
  x: LAP_INNER.x + mm(14),
  y: LAP_INNER.y + mm(10),
  w: mm(LAP_MM.board.w),
  h: mm(LAP_MM.board.h),
};

export const LAPTOP: Chassis = {
  id: "laptop",
  label: "15\" notebook",
  view: "Base cover off, seen from underneath",
  outer: LAP_OUTER,
  inner: LAP_INNER,
  board: LAP_BOARD,
  boardArtH: (LAP_MM.board.h / LAP_MM.board.w) * 100,
  /*
   * One board unit is 3.3mm. SO-DIMMs are stacked rather than side by side,
   * which is how a notebook actually fits two of them under one shield, and
   * the two M.2 cards are drawn at their true different lengths: a 2280 is
   * more than twice a 2230, and mistaking one bay for the other is a real
   * service error rather than a made-up one.
   */
  slots: [
    { id: "so-a", label: "SO-DIMM A", accepts: "sodimm1", x: 3, y: 3, w: 21, h: 9 },
    { id: "so-b", label: "SO-DIMM B", accepts: "sodimm2", x: 3, y: 15, w: 21, h: 9 },
    { id: "m2-wlan", label: "M.2 2230 (WLAN)", accepts: "wlan", x: 28, y: 3, w: 9, h: 7 },
    { id: "m2-nvme", label: "M.2 2280 (NVMe)", accepts: "nvme", x: 28, y: 17, w: 24, h: 7 },
    { id: "pipe", label: "Heatpipe run", accepts: "heatpipe", x: 42, y: 6, w: 36, h: 4 },
    { id: "fan", label: "Blower fan", accepts: "blower", x: 79, y: 4, w: 18, h: 18 },
  ],
  bays: [
    {
      id: "batt-well",
      label: "Battery well",
      accepts: "battery",
      box: {
        x: LAP_INNER.x + mm(30),
        y: LAP_INNER.y + mm(120),
        w: mm(268),
        h: mm(100),
      },
    },
    {
      id: "lap-tray",
      label: "Mainboard tray",
      accepts: "lapboard",
      box: LAP_BOARD,
    },
  ],
  // Notebooks are screwed together, not stood off. Six captive cover screws.
  standoffs: [
    { id: "ls-1", x: 12, y: 12 },
    { id: "ls-2", x: 179, y: 12 },
    { id: "ls-3", x: 346, y: 12 },
    { id: "ls-4", x: 12, y: 228 },
    { id: "ls-5", x: 179, y: 228 },
    { id: "ls-6", x: 346, y: 228 },
  ].map((s) => ({ id: s.id, x: LAP_INNER.x + mm(s.x), y: LAP_INNER.y + mm(s.y) })),
  tray: {
    lapboard: { x: 1160, y: 120 },
    battery: { x: 1160, y: 300 },
    sodimm1: { x: 1160, y: 470 },
    sodimm2: { x: 1300, y: 470 },
    nvme: { x: 1160, y: 540 },
    wlan: { x: 1330, y: 540 },
    heatpipe: { x: 1160, y: 610 },
    blower: { x: 1160, y: 680 },
  },
  parts: ["lapboard", "battery", "sodimm1", "sodimm2", "wlan", "nvme", "heatpipe", "blower"],
  cables: ["battconn", "fanconn"],
};

// ────────────────────────────────────────────────────────────────────────────
// Server — 2U rack chassis, lid off, front at the left
// ────────────────────────────────────────────────────────────────────────────

const SRV_MM = { inner: { w: 500, h: 420 }, wall: 6, board: { w: 330, h: 305 } };

const SRV_OUTER: Box = {
  x: 70,
  y: 74,
  w: mm(SRV_MM.inner.w + SRV_MM.wall * 2),
  h: mm(SRV_MM.inner.h + SRV_MM.wall * 2),
};
const SRV_INNER: Box = {
  x: SRV_OUTER.x + mm(SRV_MM.wall),
  y: SRV_OUTER.y + mm(SRV_MM.wall),
  w: mm(SRV_MM.inner.w),
  h: mm(SRV_MM.inner.h),
};
/** The EEB board sits behind the drive cage, toward the rear. */
const SRV_BOARD: Box = {
  x: SRV_INNER.x + mm(150),
  y: SRV_INNER.y + mm(58),
  w: mm(SRV_MM.board.w),
  h: mm(SRV_MM.board.h),
};

export const SERVER: Chassis = {
  id: "server",
  label: "2U rack server",
  view: "Lid off, front at the left",
  outer: SRV_OUTER,
  inner: SRV_INNER,
  board: SRV_BOARD,
  boardArtH: (SRV_MM.board.h / SRV_MM.board.w) * 100,
  /*
   * The dual-socket signature: two sockets side by side with memory banks
   * FLANKING them, rather than one bank down one edge. Populating the wrong
   * side of the wrong socket is the classic mistake this layout can teach and
   * a single-socket board physically cannot.
   */
  slots: [
    { id: "sock-a", label: "Socket 0", accepts: "cpuA", x: 24, y: 30, w: 18, h: 18 },
    { id: "sock-b", label: "Socket 1", accepts: "cpuB", x: 56, y: 30, w: 18, h: 18 },
    { id: "hs-a", label: "Heatsink 0", accepts: "hsA", x: 21, y: 27, w: 24, h: 24 },
    { id: "hs-b", label: "Heatsink 1", accepts: "hsB", x: 53, y: 27, w: 24, h: 24 },
    { id: "rd-1", label: "DIMM A0", accepts: "rdimm1", x: 6, y: 26, w: 4, h: 30 },
    { id: "rd-2", label: "DIMM A1", accepts: "rdimm2", x: 12, y: 26, w: 4, h: 30 },
    { id: "rd-3", label: "DIMM B0", accepts: "rdimm3", x: 80, y: 26, w: 4, h: 30 },
    { id: "rd-4", label: "DIMM B1", accepts: "rdimm4", x: 86, y: 26, w: 4, h: 30 },
    { id: "riser-slot", label: "PCIe riser", accepts: "riser", x: 10, y: 70, w: 46, h: 6 },
  ],
  bays: [
    { id: "srv-tray", label: "Board tray", accepts: "srvboard", box: SRV_BOARD },
    // Hot-swap caddies at the front, stacked. The one thing here you can
    // change with the machine running.
    {
      id: "bay-a",
      label: "Drive bay 0",
      accepts: "bayA",
      box: { x: SRV_INNER.x + mm(8), y: SRV_INNER.y + mm(20), w: mm(120), h: mm(80) },
    },
    {
      id: "bay-b",
      label: "Drive bay 1",
      accepts: "bayB",
      box: { x: SRV_INNER.x + mm(8), y: SRV_INNER.y + mm(112), w: mm(120), h: mm(80) },
    },
    // Redundant supplies at the rear. Either one alone will run the machine.
    {
      id: "psu-a",
      label: "PSU 0",
      accepts: "psuA",
      box: { x: SRV_INNER.x + mm(8), y: SRV_INNER.y + mm(240), w: mm(120), h: mm(76) },
    },
    {
      id: "psu-b",
      label: "PSU 1",
      accepts: "psuB",
      box: { x: SRV_INNER.x + mm(8), y: SRV_INNER.y + mm(328), w: mm(120), h: mm(76) },
    },
    // The baffle lies over the whole CPU region and has to come off first.
    {
      id: "baffle-bay",
      label: "Air baffle",
      accepts: "baffle",
      box: {
        x: SRV_BOARD.x + mm(20),
        y: SRV_BOARD.y + mm(60),
        w: mm(290),
        h: mm(150),
      },
    },
  ],
  standoffs: [
    { id: "ss-1", x: 12, y: 12 },
    { id: "ss-2", x: 165, y: 12 },
    { id: "ss-3", x: 318, y: 12 },
    { id: "ss-4", x: 12, y: 152 },
    { id: "ss-5", x: 318, y: 152 },
    { id: "ss-6", x: 12, y: 293 },
    { id: "ss-7", x: 165, y: 293 },
    { id: "ss-8", x: 318, y: 293 },
  ].map((s) => ({ id: s.id, x: SRV_BOARD.x + mm(s.x), y: SRV_BOARD.y + mm(s.y) })),
  tray: {
    srvboard: { x: 1180, y: 60 },
    cpuA: { x: 1180, y: 420 },
    cpuB: { x: 1250, y: 420 },
    hsA: { x: 1180, y: 490 },
    hsB: { x: 1330, y: 490 },
    rdimm1: { x: 1180, y: 630 },
    rdimm2: { x: 1290, y: 630 },
    rdimm3: { x: 1400, y: 630 },
    rdimm4: { x: 1510, y: 630 },
    riser: { x: 1180, y: 700 },
    bayA: { x: 1180, y: 760 },
    bayB: { x: 1330, y: 760 },
    psuA: { x: 1180, y: 860 },
    psuB: { x: 1330, y: 860 },
    baffle: { x: 1180, y: 940 },
  },
  parts: [
    "srvboard", "cpuA", "cpuB", "hsA", "hsB",
    "rdimm1", "rdimm2", "rdimm3", "rdimm4",
    "riser", "bayA", "bayB", "psuA", "psuB", "baffle",
  ],
  cables: ["backplane", "psubus"],
};

export const CHASSIS: Record<ChassisId, Chassis> = {
  desktop: DESKTOP,
  laptop: LAPTOP,
  server: SERVER,
};

export function chassisOf(id: ChassisId): Chassis {
  return CHASSIS[id];
}

/** Which machine a part belongs to. One part is only ever on one machine. */
export function chassisForPart(id: PartId): Chassis | null {
  for (const c of Object.values(CHASSIS)) if (c.parts.includes(id)) return c;
  return null;
}

export { CANVAS, SCALE, mm };
export type { Box };
