"use client";

/**
 * Flat-vector component sheet
 * ===========================
 * Rebuilt from the reference sheet: white ground, bold saturated fills, and
 * NO gradients. Depth comes from a darker shade of the same hue on the lower
 * or inner face — the two-tone trick every flat illustration set uses — never
 * from a gradient ramp or a drop shadow.
 *
 * ── WHY THE PALETTE IS A CONTRACT ───────────────────────────────────────────
 *
 * The reference is specific: the motherboard is BLUE, not the green I had been
 * drawing; RAM is green with gold spreaders; the GPU is red over black. Those
 * are identifying colours — a builder recognises a part by its colour before
 * its shape — so they live in one exported block. Re-skinning the whole sheet
 * is editing `PAL`, not hunting fills across eight components.
 *
 * Every part draws inside a 0-100 box so the view can place it by transform
 * alone, and no component knows where on the bench it will end up.
 */

export interface VectorProps {
  installed?: boolean;
  highlighted?: boolean;
}

/** Sampled from the reference sheet. Two tones per material, flat. */
export const PAL = {
  surface: "#ffffff",
  surfaceEdge: "#e8ecf0",

  boardBlue: "#3d8ed9",
  boardBlueDark: "#2a6fb0",
  boardBlueLight: "#6fb3e8",
  socketNavy: "#1f4e79",

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

/** Chip packages: flat black rounded rects with a lighter top face. */
function Chip({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="1" fill={PAL.ink} />
      <rect x={x} y={y} width={w} height={h * 0.28} rx="1" fill={PAL.inkSoft} />
    </g>
  );
}

/** The selection ring. Flat sheets have no glow, so this is a bold outline. */
function Ring({ x, y, w, h, r = 3 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={PAL.orange} strokeWidth="3" />
  );
}

/**
 * Motherboard — blue PCB, as the reference draws it.
 *
 * Laid out to read at a glance: I/O stack top-left, socket centre, DIMM slots
 * bottom in gold, PCIe slots left in white. Those slot colours are the
 * reference's, and they are also how a builder finds a slot without labels.
 */
export function VectorMotherboard({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="2" y="4" width="96" height="92" rx="2" fill={PAL.boardBlue} />

      {/* Rear I/O connector stack, top edge */}
      <rect x="8" y="6" width="34" height="10" rx="1" fill={PAL.boardBlueDark} />
      {[10, 20, 30].map((x, i) => (
        <rect key={i} x={x} y="8" width="8" height="6" rx="0.8" fill={PAL.paper} />
      ))}
      {/* Twin D-sub ports, as on the sheet */}
      {[48, 64].map((x, i) => (
        <g key={i}>
          <rect x={x} y="5" width="13" height="9" rx="4.5" fill={PAL.boardBlueDark} />
          <rect x={x + 2} y="7" width="9" height="5" rx="2.5" fill={PAL.steel} />
        </g>
      ))}

      {/* CPU socket — navy square with a pin grid and a corner marker */}
      <rect x="56" y="26" width="26" height="26" rx="1.5" fill={PAL.socketNavy} />
      <rect x="59" y="29" width="20" height="20" rx="1" fill={PAL.boardBlueDark} />
      {Array.from({ length: 36 }, (_, i) => (
        <rect
          key={i}
          x={60.5 + (i % 6) * 3.2}
          y={30.5 + Math.floor(i / 6) * 3.2}
          width="1.8"
          height="1.8"
          rx="0.4"
          fill={PAL.socketNavy}
        />
      ))}

      {/* DIMM slots — gold, horizontal, lower half */}
      {[62, 70, 78].map((y, i) => (
        <g key={i}>
          <rect x="30" y={y} width="58" height="5" rx="1" fill={PAL.gold} />
          <rect x="32" y={y + 1.4} width="54" height="2.2" rx="0.6" fill={PAL.goldDark} />
        </g>
      ))}

      {/* PCIe slots — white, left column */}
      {[36, 44, 52].map((y, i) => (
        <rect key={i} x="6" y={y} width="34" height="4.5" rx="1" fill={PAL.paper} />
      ))}
      {/* Short slots above them */}
      {[20, 26].map((y, i) => (
        <rect key={i} x="6" y={y} width="20" height="4" rx="1" fill={PAL.boardBlueLight} />
      ))}

      {/* The red accent stripe the reference has down the middle */}
      <rect x="46" y="18" width="3.5" height="34" rx="1.7" fill={PAL.red} />

      {/* Chipset heatsink and VRM blocks */}
      <rect x="86" y="26" width="9" height="26" rx="1" fill={PAL.boardBlueLight} />
      <Chip x={60} y={16} w={12} h={7} />
      <Chip x={16} y={62} w={9} h={7} />
      <Chip x={16} y={74} w={9} h={7} />

      {/* Round capacitors, flat two-tone */}
      {[[52, 60], [58, 60], [64, 60], [88, 62]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="2.6" fill={PAL.steelDark} />
          <circle cx={cx} cy={cy} r="1.7" fill={PAL.steel} />
        </g>
      ))}
      {/* Coin cell */}
      <circle cx="30" cy="58" r="4" fill={PAL.steel} />

      {/* Power headers */}
      <rect x="88" y="72" width="7" height="14" rx="1" fill={PAL.paper} />
      <rect x="6" y="86" width="24" height="6" rx="1" fill={PAL.gold} />

      {highlighted && <Ring x={0} y={2} w={100} h={96} />}
    </g>
  );
}

/** CPU — small green package with a silver lid and a gold corner mark. */
export function VectorCpu({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="18" y="18" width="64" height="64" rx="3" fill={PAL.pcbGreen} />
      <rect x="18" y="18" width="64" height="64" rx="3" fill="none" stroke={PAL.pcbGreenDark} strokeWidth="2" />
      <rect x="28" y="28" width="44" height="44" rx="2" fill={PAL.steel} />
      <rect x="28" y="28" width="44" height="12" rx="2" fill={PAL.paper} />
      <rect x="36" y="46" width="28" height="4" rx="1" fill={PAL.steelDark} />
      <path d="M22 22 L32 22 L22 32 Z" fill={PAL.gold} />
      {highlighted && <Ring x={14} y={14} w={72} h={72} />}
    </g>
  );
}

/**
 * RAM — green PCB with a gold heat spreader, drawn vertical as on the sheet.
 */
export function VectorRam({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="34" y="4" width="32" height="92" rx="2" fill={PAL.pcbGreen} />
      {/* Gold spreader rails down both edges */}
      <rect x="34" y="4" width="32" height="8" rx="2" fill={PAL.gold} />
      <rect x="34" y="76" width="32" height="8" fill={PAL.gold} />
      {/* Black memory packages */}
      {[18, 32, 46, 60].map((y, i) => (
        <Chip key={i} x={38} y={y} w={24} h={10} />
      ))}
      {/* Gold contact fingers along the bottom with the key notch */}
      <rect x="34" y="88" width="32" height="8" fill={PAL.gold} />
      <rect x="46" y="88" width="3" height="8" fill={PAL.pcbGreen} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={35 + i * 2.6} y="88" width="1.2" height="8" fill={PAL.goldDark} />
      ))}
      {highlighted && <Ring x={30} y={0} w={40} h={100} />}
    </g>
  );
}

/**
 * GPU — red shroud over black, twin dark fans, as the reference draws it.
 */
export function VectorGpu({ highlighted }: VectorProps) {
  return (
    <g>
      {/* Green PCB tail and gold edge connector */}
      <rect x="8" y="30" width="88" height="44" rx="2" fill={PAL.pcbGreen} />
      <rect x="20" y="72" width="52" height="6" fill={PAL.gold} />
      <rect x="40" y="72" width="3" height="6" fill={PAL.pcbGreen} />

      {/* Black body with the red shroud over it */}
      <rect x="8" y="26" width="88" height="42" rx="3" fill={PAL.ink} />
      <rect x="8" y="26" width="88" height="14" rx="3" fill={PAL.red} />
      {/* Red cooling louvres down the right */}
      {[44, 50, 56, 62].map((y, i) => (
        <rect key={i} x="74" y={y} width="20" height="3.5" rx="1.5" fill={PAL.red} />
      ))}

      {/* Twin fans */}
      {[30, 58].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="50" r="13" fill={PAL.inkSoft} />
          <circle cx={cx} cy="50" r="11" fill={PAL.ink} />
          {Array.from({ length: 7 }, (_, b) => {
            const a = (b / 7) * Math.PI * 2;
            const a2 = a + 0.7;
            return (
              <path
                key={b}
                d={`M${cx} 50 L${cx + Math.cos(a) * 10.5} ${50 + Math.sin(a) * 10.5} A10.5 10.5 0 0 1 ${cx + Math.cos(a2) * 10.5} ${50 + Math.sin(a2) * 10.5} Z`}
                fill={PAL.inkSoft}
              />
            );
          })}
          <circle cx={cx} cy="50" r="3.4" fill={PAL.steelDark} />
        </g>
      ))}

      {/* Rear bracket */}
      <rect x="2" y="22" width="6" height="52" rx="1" fill={PAL.steel} />
      {highlighted && <Ring x={0} y={20} w={100} h={60} />}
    </g>
  );
}

/**
 * CPU cooler — silver finned block with a black fan on top, as on the sheet.
 */
export function VectorCooler({ highlighted }: VectorProps) {
  return (
    <g>
      {/* Fin stack: flat vertical bars, two tones */}
      <rect x="14" y="20" width="72" height="60" rx="2" fill={PAL.steel} />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={16 + i * 5} y="22" width="2.4" height="56" fill={PAL.steelDark} opacity="0.55" />
      ))}
      {/* Fan */}
      <rect x="26" y="28" width="48" height="48" rx="3" fill={PAL.ink} />
      <circle cx="50" cy="52" r="20" fill={PAL.inkSoft} />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        const a2 = a + 0.72;
        return (
          <path
            key={i}
            d={`M50 52 L${50 + Math.cos(a) * 19} ${52 + Math.sin(a) * 19} A19 19 0 0 1 ${50 + Math.cos(a2) * 19} ${52 + Math.sin(a2) * 19} Z`}
            fill={PAL.ink}
          />
        );
      })}
      <circle cx="50" cy="52" r="6" fill={PAL.steelDark} />
      {/* Corner mounting holes */}
      {[[30, 32], [70, 32], [30, 72], [70, 72]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.4" fill={PAL.steelDark} />
      ))}
      {highlighted && <Ring x={10} y={16} w={80} h={68} />}
    </g>
  );
}

/** M.2 / SSD — dark body with a white label, as the sheet draws it. */
export function VectorSsd({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="24" y="12" width="52" height="76" rx="3" fill={PAL.inkSoft} />
      <rect x="24" y="12" width="52" height="10" rx="3" fill={PAL.ink} />
      {/* White label with text rules */}
      <rect x="30" y="30" width="40" height="42" rx="2" fill={PAL.paper} />
      {[36, 44, 52, 60].map((y, i) => (
        <rect key={i} x="34" y={y} width={i === 0 ? 28 : 32} height="3" rx="1.5" fill={PAL.steel} />
      ))}
      {/* Gold connector tab at the top */}
      <rect x="38" y="6" width="24" height="7" rx="1" fill={PAL.gold} />
      {highlighted && <Ring x={20} y={2} w={60} h={92} />}
    </g>
  );
}

/**
 * PSU — grey box, circular fan grille, and the yellow/orange/red cable
 * bundle the reference makes such a feature of.
 */
export function VectorPsu({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="6" y="24" width="62" height="52" rx="3" fill={PAL.steel} />
      <rect x="6" y="24" width="62" height="8" rx="3" fill={PAL.paper} />
      {/* Fan grille */}
      <circle cx="44" cy="50" r="17" fill={PAL.steelDark} />
      <circle cx="44" cy="50" r="14" fill={PAL.paper} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M44 50 L${44 + Math.cos(a) * 13} ${50 + Math.sin(a) * 13} A13 13 0 0 1 ${44 + Math.cos(a + 0.6) * 13} ${50 + Math.sin(a + 0.6) * 13} Z`}
            fill={PAL.steel}
          />
        );
      })}
      {/* IEC socket and switch */}
      <rect x="12" y="40" width="14" height="11" rx="1.5" fill={PAL.ink} />
      <rect x="12" y="56" width="14" height="6" rx="1" fill={PAL.steelDark} />

      {/* Cable bundle sweeping right — the sheet's signature detail */}
      {[
        { c: PAL.gold, o: 0 },
        { c: PAL.orange, o: 5 },
        { c: PAL.red, o: 10 },
      ].map((w, i) => (
        <path
          key={i}
          d={`M68 ${40 + w.o} C 84 ${40 + w.o}, 92 ${58 + w.o}, 80 ${72 + w.o}`}
          stroke={w.c}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {/* Connector heads on the bundle */}
      <rect x="74" y="76" width="14" height="8" rx="1.5" fill={PAL.paper} />
      {highlighted && <Ring x={2} y={20} w={96} h={70} />}
    </g>
  );
}

/** Thermal paste — kept simple, the sheet has no syringe so this is a tube. */
export function VectorPaste({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="20" y="42" width="54" height="16" rx="8" fill={PAL.paper} />
      <rect x="20" y="42" width="54" height="6" rx="3" fill={PAL.steel} />
      <rect x="30" y="46" width="26" height="8" rx="4" fill={PAL.red} />
      <rect x="74" y="45" width="9" height="10" rx="1.5" fill={PAL.steelDark} />
      <path d="M83 47 L92 50 L83 53 Z" fill={PAL.steel} />
      {highlighted && <Ring x={16} y={38} w={80} h={24} r={12} />}
    </g>
  );
}

/** Loose mounting screws, drawn flat with a two-tone head. */
export function VectorScrews() {
  const one = (cx: number, cy: number, rot: number) => (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect x={cx - 2} y={cy} width="4" height="13" rx="1.5" fill={PAL.steelDark} />
      <circle cx={cx} cy={cy} r="6" fill={PAL.steel} />
      <circle cx={cx} cy={cy} r="6" fill={PAL.paper} opacity="0.5" />
      <rect x={cx - 3.4} y={cy - 0.8} width="6.8" height="1.6" rx="0.6" fill={PAL.steelDark} />
    </g>
  );
  return (
    <g className="pointer-events-none">
      {one(20, 18, -25)}
      {one(46, 12, 20)}
      {one(34, 40, 65)}
    </g>
  );
}

/** Part id → illustration, so the view never switches on a part type. */
export const PART_VECTOR: Record<string, (p: VectorProps) => React.ReactElement> = {
  mobo: VectorMotherboard,
  cpu: VectorCpu,
  paste: VectorPaste,
  cooler: VectorCooler,
  ram1: VectorRam,
  ram2: VectorRam,
  ssd: VectorSsd,
  gpu: VectorGpu,
  psu: VectorPsu,
};
