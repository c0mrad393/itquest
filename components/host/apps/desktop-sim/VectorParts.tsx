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

  boardBlue: "#2e8b46",
  boardBlueDark: "#256e38",
  boardBlueLight: "#3aa055",
  socketNavy: "#1e5c2e",
  /* Board-specific accents, sampled from the reference. */
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
  /*
   * Copper routing, drawn as real paths.
   *
   * The reference's board reads as a BOARD because traces visibly run between
   * the socket, the DIMM bank and the chipset — that routing is most of what
   * separates a motherboard illustration from a green rectangle. Fixed paths
   * rather than a scatter, so the copper does not move between renders.
   */
  const traces = [
    "M46 30 L46 46 L62 62 L62 88",
    "M52 30 L52 42 L70 60 L70 88",
    "M58 34 L58 44 L78 64 L78 88",
    "M44 52 L30 66 L30 92",
    "M40 56 L24 72 L24 92",
    "M62 26 L62 14 L86 14",
    "M66 26 L66 10 L90 10",
    "M34 44 L18 44 L18 70",
    "M50 66 L50 78 L36 92",
    "M56 68 L56 80 L44 94",
  ];

  return (
    <g>
      {/* Substrate */}
      <rect x="2" y="2" width="96" height="96" rx="1.5" fill={PAL.boardBlue} />

      {/* Copper, beneath every component */}
      <g stroke={PAL.trace} strokeWidth="0.55" fill="none" opacity="0.9">
        {traces.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* ── Rear I/O cluster, top-left ─────────────────────────────────── */}
      <rect x="4" y="4" width="9" height="7" rx="0.6" fill={PAL.steel} />
      {/* The magenta parallel port the reference makes so prominent */}
      <rect x="4" y="12" width="7" height="13" rx="0.8" fill={PAL.ioMagenta} />
      <rect x="5" y="13.5" width="5" height="10" rx="0.5" fill="#8d2455" />
      {/* PS/2 pair */}
      {[27, 31].map((y, i) => (
        <circle key={i} cx="7.5" cy={y} r="2" fill={i ? PAL.ioTeal : "#7d5aa8"} />
      ))}
      {/* Audio jacks */}
      {[PAL.ioOrange, PAL.ioBlue, "#7fd06a"].map((c, i) => (
        <circle key={i} cx="7.5" cy={35 + i * 3.4} r="1.3" fill={c} />
      ))}
      {/* USB / LAN stacks */}
      {[42, 49].map((y, i) => (
        <rect key={i} x="4" y={y} width="8" height="6" rx="0.6" fill={PAL.steel} />
      ))}

      {/* VRM chokes and MOSFETs beside the socket */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="16" y={10 + i * 5} width="4" height="3.4" rx="0.4" fill={PAL.ink} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx="23" cy={11.5 + i * 5} r="1.6" fill={PAL.ioTeal} />
      ))}

      {/* ── CPU socket ─────────────────────────────────────────────────── */}
      <rect x="30" y="8" width="22" height="22" rx="0.8" fill={PAL.steelDark} />
      <rect x="31.5" y="9.5" width="19" height="19" rx="0.6" fill={PAL.steel} />
      {/* Land grid */}
      <g fill={PAL.steelDark} opacity="0.75">
        {Array.from({ length: 100 }, (_, i) => (
          <circle key={i} cx={33.5 + (i % 10) * 1.55} cy={11.5 + Math.floor(i / 10) * 1.55} r="0.3" />
        ))}
      </g>
      {/* Retention lever down the right edge */}
      <rect x="51" y="9" width="1.6" height="21" rx="0.8" fill={PAL.steelDark} />
      <rect x="29" y="30" width="24" height="1.6" rx="0.8" fill={PAL.steelDark} />

      {/* Top heatsink strip above the socket */}
      <rect x="30" y="4" width="22" height="3.2" rx="0.5" fill={PAL.steel} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={31 + i * 2.3} y="4.4" width="1.1" height="2.4" fill={PAL.steelDark} />
      ))}

      {/* ── Gold VRM / northbridge heatsink ────────────────────────────── */}
      <rect x="34" y="34" width="20" height="20" rx="0.8" fill={PAL.vrmGold} />
      <g stroke={PAL.vrmGoldDark} strokeWidth="0.7">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="34" y1={36 + i * 2.4} x2="54" y2={36 + i * 2.4} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`v${i}`} x1={36 + i * 2.4} y1="34" x2={36 + i * 2.4} y2="54" />
        ))}
      </g>

      {/* ── DIMM bank: alternating yellow and blue, as DDR channels are ── */}
      {[
        { x: 62, c: PAL.slotWhite },
        { x: 65, c: PAL.slotYellow },
        { x: 68, c: PAL.slotBlue },
        { x: 72, c: PAL.slotWhite },
        { x: 75, c: PAL.slotYellow },
        { x: 78, c: PAL.slotBlue },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y="5" width="2.4" height="44" rx="0.4" fill={s.c} />
          <rect x={s.x} y="5" width="2.4" height="2.6" fill={PAL.slotWhite} />
          <rect x={s.x} y="46.4" width="2.4" height="2.6" fill={PAL.slotWhite} />
        </g>
      ))}

      {/* ── ATX 24-pin, right edge ─────────────────────────────────────── */}
      <rect x="84" y="18" width="7" height="20" rx="0.8" fill={PAL.connCream} />
      <g fill={PAL.steelDark} opacity="0.6">
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={85 + (i % 2) * 2.6} y={19.5 + Math.floor(i / 2) * 1.5} width="1.8" height="1" rx="0.2" />
        ))}
      </g>
      {/* IDE / floppy header below it */}
      <rect x="84" y="40" width="6" height="14" rx="0.6" fill={PAL.ink} />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="85" y={41 + i * 1.3} width="4" height="0.6" fill={PAL.steel} opacity="0.5" />
      ))}

      {/* ── Expansion slots ────────────────────────────────────────────── */}
      {/* PCIe: black, upper pair */}
      {[54, 60].map((y, i) => (
        <rect key={i} x="20" y={y} width="34" height="2.2" rx="0.4" fill={PAL.ink} />
      ))}
      {/* PCI: white, lower stack of four */}
      {[66, 73, 80, 87].map((y, i) => (
        <g key={i}>
          <rect x="16" y={y} width="40" height="3" rx="0.4" fill={PAL.slotWhite} />
          <rect x="30" y={y} width="1" height="3" fill={PAL.boardBlue} />
        </g>
      ))}

      {/* ── Chipset heatsink, silver finned ────────────────────────────── */}
      <rect x="60" y="62" width="14" height="16" rx="0.8" fill={PAL.steel} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={61 + i * 1.9} y="63" width="0.9" height="14" fill={PAL.steelDark} />
      ))}

      {/* ── SATA ports: two columns of three, red ──────────────────────── */}
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}-${c}`}>
            <rect x={78 + c * 6} y={62 + r * 5} width="5" height="3.4" rx="0.5" fill={PAL.sata} />
            <rect x={79 + c * 6} y={63 + r * 5} width="3" height="1.4" rx="0.3" fill="#8f1a2a" />
          </g>
        )),
      )}

      {/* Front-panel header, navy */}
      <rect x="72" y="80" width="20" height="3.4" rx="0.5" fill="#2b2f77" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={73 + i * 1.6} y="81" width="0.8" height="1.6" fill={PAL.steel} opacity="0.6" />
      ))}

      {/* Coin cell */}
      <circle cx="70" cy="84" r="3.2" fill={PAL.steel} />
      <circle cx="70" cy="84" r="2.4" fill={PAL.paper} />

      {/* Capacitors, scattered where the reference puts them */}
      {[
        [26, 12], [26, 20], [26, 28], [57, 12], [57, 22], [57, 32],
        [58, 58], [64, 58], [70, 58], [20, 44], [20, 50], [58, 82],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="1.9" fill={PAL.steelDark} />
          <circle cx={cx} cy={cy} r="1.4" fill={PAL.steel} />
        </g>
      ))}

      {/* Black ICs */}
      <Chip x={84} y={6} w={9} h={9} />
      <Chip x={8} y={58} w={6} h={6} />
      <Chip x={6} y={78} w={5} h={7} />
      <Chip x={62} y={88} w={8} h={7} />
      <Chip x={34} y={90} w={10} h={6} />
      <Chip x={78} y={70} w={6} h={6} />

      {/* Mounting holes, gold-ringed as on the reference */}
      {[[6, 6], [6, 50], [6, 94], [58, 4], [94, 4], [94, 50], [94, 94], [58, 94]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="1.7" fill={PAL.slotYellow} />
          <circle cx={cx} cy={cy} r="0.9" fill={PAL.paper} />
        </g>
      ))}

      {highlighted && <Ring x={0} y={0} w={100} h={100} />}
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
      {/* Green substrate with a heat spreader over the upper two-thirds */}
      <rect x="6" y="18" width="88" height="64" rx="1.5" fill={PAL.pcbGreen} />
      <rect x="6" y="18" width="88" height="40" rx="1.5" fill={PAL.slotYellow} />
      {/* Spreader ridges — the detail that stops it reading as a flat bar */}
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={9 + i * 8.6} y="21" width="4" height="34" rx="1" fill={PAL.vrmGoldDark} opacity="0.45" />
      ))}
      {/* DRAM packages below the spreader */}
      {Array.from({ length: 4 }, (_, i) => (
        <Chip key={i} x={10 + i * 21} y={60} w={17} h={12} />
      ))}
      {/* Gold fingers with the key notch */}
      <rect x="6" y="74" width="88" height="8" fill={PAL.gold} />
      <rect x="38" y="74" width="3" height="8" fill={PAL.pcbGreen} />
      {Array.from({ length: 28 }, (_, i) => (
        <rect key={i} x={7 + i * 3.1} y="74" width="1.4" height="8" fill={PAL.goldDark} opacity="0.55" />
      ))}
      {highlighted && <Ring x={2} y={14} w={96} h={72} />}
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
