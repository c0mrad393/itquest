"use client";

/**
 * Shared vocabulary for the three component sheets
 * =================================================
 * The palette, the props every part takes and the selection ring.
 *
 * These live apart from any one sheet because all three import them and the
 * sheets are collected back together in `VectorParts`. Keeping them in the
 * desktop sheet made that a cycle — VectorParts -> VectorLaptop -> VectorParts
 * — which happens to resolve at runtime only because the palette is read
 * inside function bodies. That is a property of today's code rather than a
 * guarantee, and one const moved to module scope would break it.
 */

export interface VectorProps {
  installed?: boolean;
  highlighted?: boolean;
}

/**
 * Sampled from the reference sheet. Two tones per material, flat.
 *
 * These are IDENTIFYING colours — a builder recognises a part by its colour
 * before its shape — so they are a contract, not decoration. Re-skinning the
 * whole set is editing this block, not hunting fills across three files.
 */
export const PAL = {
  surface: "#ffffff",
  surfaceEdge: "#e8ecf0",

  boardBlue: "#2e8b46",
  boardBlueDark: "#256e38",
  boardBlueLight: "#3aa055",
  socketNavy: "#1e5c2e",
  trace: "#1f5f31",
  vrmGold: "#c9a23f",
  vrmGoldDark: "#a8832c",
  slotYellow: "#e8d44d",
  slotBlue: "#2f7fd0",
  slotWhite: "#e4e7ea",
  connCream: "#efe8d8",
  sata: "#d0273b",
  ioMagenta: "#b5306e",
  ioTeal: "#3fb8c4",
  ioOrange: "#e08a3c",
  ioBlue: "#4a6fd0",

  pcbGreen: "#27ae60",
  pcbGreenDark: "#1e8e4d",

  gold: "#f2c94c",
  goldDark: "#d4a92f",
  orange: "#f2994a",
  red: "#eb5757",
  redDark: "#c94040",

  ink: "#333333",
  inkSoft: "#4f4f4f",
  steel: "#bdbdbd",
  steelDark: "#828282",
  paper: "#f2f2f2",
} as const;

/** The selection ring. Flat sheets have no glow, so this is a bold outline. */
export function Ring({ x, y, w, h, r = 3 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={PAL.orange} strokeWidth="3" />;
}
