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
    "M46 24.0 L46 36.8 L62 49.6 L62 70.4",
    "M52 24.0 L52 33.6 L70 48.0 L70 70.4",
    "M58 27.2 L58 35.2 L78 51.2 L78 70.4",
    "M44 41.6 L30 52.8 L30 73.6",
    "M40 44.8 L24 57.6 L24 73.6",
    "M62 20.8 L62 11.2 L86 11.2",
    "M66 20.8 L66 8.0 L90 8.0",
    "M34 35.2 L18 35.2 L18 56.0",
    "M50 52.8 L50 62.4 L36 73.6",
    "M56 54.4 L56 64.0 L44 75.2",
  ];

  return (
    <g>
      {/* Substrate */}
      <rect x="2" y="1.6" width="96" height="76.8" rx="1.5" fill={PAL.boardBlue} />

      {/* Copper, beneath every component */}
      <g stroke={PAL.trace} strokeWidth="0.55" fill="none" opacity="0.9">
        {traces.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* ── Rear I/O cluster, top-left ─────────────────────────────────── */}
      <rect x="4" y="3.2" width="9" height="5.6" rx="0.6" fill={PAL.steel} />
      {/* The magenta parallel port the reference makes so prominent */}
      <rect x="4" y="9.6" width="7" height="10.4" rx="0.8" fill={PAL.ioMagenta} />
      <rect x="5" y="10.8" width="5" height="8.0" rx="0.5" fill="#8d2455" />
      {/* PS/2 pair */}
      {[27, 31].map((y, i) => (
        <circle key={i} cx="7.5" cy={y * 0.8} r="2" fill={i ? PAL.ioTeal : "#7d5aa8"} />
      ))}
      {/* Audio jacks */}
      {[PAL.ioOrange, PAL.ioBlue, "#7fd06a"].map((c, i) => (
        <circle key={i} cx="7.5" cy={(35 + i * 3.4) * 0.8} r="1.3" fill={c} />
      ))}
      {/* USB / LAN stacks */}
      {[42, 49].map((yy, i) => (
        <rect key={i} x="4" y={yy * 0.8} width="8" height="4.8" rx="0.6" fill={PAL.steel} />
      ))}

      {/* VRM chokes and MOSFETs beside the socket */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="16" y={(10 + i * 5) * 0.8} width="4" height="2.72" rx="0.4" fill={PAL.ink} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx="23" cy={(11.5 + i * 5) * 0.8} r="1.6" fill={PAL.ioTeal} />
      ))}

      {/* ── CPU socket ─────────────────────────────────────────────────── */}
      <rect x="30" y="6.4" width="22" height="17.6" rx="0.8" fill={PAL.steelDark} />
      <rect x="31.5" y="7.6" width="19" height="15.2" rx="0.6" fill={PAL.steel} />
      {/* Land grid */}
      <g fill={PAL.steelDark} opacity="0.75">
        {Array.from({ length: 100 }, (_, i) => (
          <circle key={i} cx={33.5 + (i % 10) * 1.55} cy={(11.5 + Math.floor(i / 10) * 1.55) * 0.8} r="0.3" />
        ))}
      </g>
      {/* Retention lever down the right edge */}
      <rect x="51" y="7.2" width="1.6" height="16.8" rx="0.8" fill={PAL.steelDark} />
      <rect x="29" y="24.0" width="24" height="1.28" rx="0.8" fill={PAL.steelDark} />

      {/* Top heatsink strip above the socket */}
      <rect x="30" y="3.2" width="22" height="2.56" rx="0.5" fill={PAL.steel} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={31 + i * 2.3} y="3.52" width="1.1" height="1.92" fill={PAL.steelDark} />
      ))}

      {/* ── Gold VRM / northbridge heatsink ────────────────────────────── */}
      <rect x="34" y="27.2" width="20" height="16.0" rx="0.8" fill={PAL.vrmGold} />
      <g stroke={PAL.vrmGoldDark} strokeWidth="0.7">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="34" y1={(36 + i * 2.4) * 0.8} x2="54" y2={(36 + i * 2.4) * 0.8} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`v${i}`} x1={36 + i * 2.4} y1="27.2" x2={36 + i * 2.4} y2="43.2" />
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
          <rect x={s.x} y="4.0" width="2.4" height="35.2" rx="0.4" fill={s.c} />
          <rect x={s.x} y="4.0" width="2.4" height="2.08" fill={PAL.slotWhite} />
          <rect x={s.x} y="37.12" width="2.4" height="2.08" fill={PAL.slotWhite} />
        </g>
      ))}

      {/* ── ATX 24-pin, right edge ─────────────────────────────────────── */}
      <rect x="84" y="14.4" width="7" height="16.0" rx="0.8" fill={PAL.connCream} />
      <g fill={PAL.steelDark} opacity="0.6">
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={85 + (i % 2) * 2.6} y={(19.5 + Math.floor(i / 2) * 1.5) * 0.8} width="1.8" height="0.8" rx="0.2" />
        ))}
      </g>
      {/* IDE / floppy header below it */}
      <rect x="84" y="32.0" width="6" height="11.2" rx="0.6" fill={PAL.ink} />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="85" y={(41 + i * 1.3) * 0.8} width="4" height="0.48" fill={PAL.steel} opacity="0.5" />
      ))}

      {/* ── Expansion slots ────────────────────────────────────────────── */}
      {/* PCIe: black, upper pair */}
      {[54, 60].map((yy, i) => (
        <rect key={i} x="20" y={yy * 0.8} width="34" height="1.76" rx="0.4" fill={PAL.ink} />
      ))}
      {/* PCI: white, lower stack of four */}
      {[66, 73, 80, 87].map((yy, i) => (
        <g key={i}>
          <rect x="16" y={yy * 0.8} width="40" height="2.4" rx="0.4" fill={PAL.slotWhite} />
          <rect x="30" y={yy * 0.8} width="1" height="2.4" fill={PAL.boardBlue} />
        </g>
      ))}

      {/* ── Chipset heatsink, silver finned ────────────────────────────── */}
      <rect x="60" y="49.6" width="14" height="12.8" rx="0.8" fill={PAL.steel} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={61 + i * 1.9} y="50.4" width="0.9" height="11.2" fill={PAL.steelDark} />
      ))}

      {/* ── SATA ports: two columns of three, red ──────────────────────── */}
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}-${c}`}>
            <rect x={78 + c * 6} y={(62 + r * 5) * 0.8} width="5" height="2.72" rx="0.5" fill={PAL.sata} />
            <rect x={79 + c * 6} y={(63 + r * 5) * 0.8} width="3" height="1.12" rx="0.3" fill="#8f1a2a" />
          </g>
        )),
      )}

      {/* Front-panel header, navy */}
      <rect x="72" y="64.0" width="20" height="2.72" rx="0.5" fill="#2b2f77" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={73 + i * 1.6} y="64.8" width="0.8" height="1.28" fill={PAL.steel} opacity="0.6" />
      ))}

      {/* Coin cell */}
      <circle cx="70" cy="67.2" r="3.2" fill={PAL.steel} />
      <circle cx="70" cy="67.2" r="2.4" fill={PAL.paper} />

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

      {highlighted && <Ring x={-1} y={-1} w={102} h={82} />}
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
  // Drawn at 100 x 23.3 — a DIMM's real 133 x 31mm proportion. Drawing it
  // square and letting the view squash it is what made it look stretched.
  return (
    <g>
      <rect x="0" y="1" width="100" height="21" rx="1" fill={PAL.pcbGreen} />
      {/* Heat spreader over the upper two-thirds */}
      <rect x="1" y="1.6" width="98" height="12" rx="1" fill={PAL.slotYellow} />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={3 + i * 6.9} y="2.6" width="2.6" height="10" rx="0.6" fill={PAL.vrmGoldDark} opacity="0.45" />
      ))}
      {/* DRAM packages along the exposed strip */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={3 + i * 12.2} y="14" width="9.4" height="4.4" rx="0.5" fill={PAL.ink} />
      ))}
      {/* Gold fingers and the key notch */}
      <rect x="1" y="19" width="98" height="3" fill={PAL.gold} />
      <rect x="36" y="19" width="2" height="3" fill={PAL.pcbGreen} />
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={2 + i * 2.45} y="19" width="1.1" height="3" fill={PAL.goldDark} opacity="0.5" />
      ))}
      {highlighted && <Ring x={-2} y={-1} w={104} h={25} r={2} />}
    </g>
  );
}

/**
 * GPU — red shroud over black, twin dark fans, as the reference draws it.
 */
export function VectorGpu({ highlighted }: VectorProps) {
  // 100 x 40.7 — a 270 x 110mm card. Long and low, not the square block the
  // old art assumed.
  return (
    <g>
      {/* PCB and gold edge connector */}
      <rect x="4" y="6" width="96" height="28" rx="1" fill={PAL.pcbGreen} />
      <rect x="16" y="33" width="42" height="3" fill={PAL.gold} />
      <rect x="30" y="33" width="1.8" height="3" fill={PAL.pcbGreen} />
      {/* Matte black shroud */}
      <rect x="12" y="4" width="88" height="26" rx="1.5" fill={PAL.ink} />
      <rect x="12" y="4" width="88" height="5" rx="1.5" fill={PAL.inkSoft} />
      {/* Copper heat pipes visible through the shroud gap */}
      {[10.5, 13].map((y, i) => (
        <rect key={i} x="16" y={y} width="80" height="1.6" rx="0.8" fill={PAL.orange} opacity="0.85" />
      ))}
      {/* Triple fans, as a modern card has */}
      {[28, 55, 82].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="19" r="10" fill={PAL.inkSoft} />
          <circle cx={cx} cy="19" r="8.6" fill="#15181c" />
          {Array.from({ length: 8 }, (_, b) => {
            const a = (b / 8) * Math.PI * 2;
            const a2 = a + 0.62;
            return (
              <path
                key={b}
                d={`M${cx} 19 L${cx + Math.cos(a) * 8.2} ${19 + Math.sin(a) * 8.2} A8.2 8.2 0 0 1 ${cx + Math.cos(a2) * 8.2} ${19 + Math.sin(a2) * 8.2} Z`}
                fill={PAL.inkSoft}
                opacity={0.55 + (b % 3) * 0.15}
              />
            );
          })}
          <circle cx={cx} cy="19" r="2.6" fill={PAL.steelDark} />
        </g>
      ))}
      {/* Twin sleeved 8-pin PCIe sockets on the top edge */}
      {[62, 80].map((x, i) => (
        <g key={i}>
          <rect x={x} y="2" width="14" height="4.5" rx="1" fill={PAL.inkSoft} />
          {Array.from({ length: 4 }, (_, p) => (
            <rect key={p} x={x + 1.4 + p * 3.1} y="3" width="2" height="2.5" rx="0.4" fill={PAL.steel} />
          ))}
        </g>
      ))}
      {/* RGB accent strip and rear bracket */}
      <rect x="16" y="27" width="30" height="1.8" rx="0.9" fill={PAL.boardBlueLight} opacity="0.9" />
      <rect x="0" y="2" width="5" height="34" rx="1" fill={PAL.steel} />
      {highlighted && <Ring x={-2} y={0} w={104} h={41} r={2} />}
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
  // 100 x 27.5 — an M.2 2280 is a long thin stick, not a card.
  return (
    <g>
      <rect x="0" y="6" width="100" height="15" rx="1" fill={PAL.boardBlue} />
      {/* Controller and NAND packages */}
      {[10, 34, 58].map((x, i) => (
        <rect key={i} x={x} y="9" width="20" height="9" rx="0.8" fill={PAL.ink} />
      ))}
      <rect x="82" y="9" width="12" height="9" rx="0.8" fill={PAL.paper} opacity="0.85" />
      {/* Gold edge connector with the M-key notch */}
      <rect x="0" y="8" width="7" height="11" fill={PAL.gold} />
      <rect x="0" y="12.6" width="7" height="1.6" fill={PAL.boardBlue} />
      {highlighted && <Ring x={-2} y={4} w={104} h={19} r={2} />}
    </g>
  );
}

/**
 * PSU — grey box, circular fan grille, and the yellow/orange/red cable
 * bundle the reference makes such a feature of.
 */
export function VectorPsu({ highlighted }: VectorProps) {
  // 100 x 57.3 — a 150 x 86mm ATX unit.
  return (
    <g>
      <rect x="0" y="2" width="76" height="53" rx="2" fill={PAL.inkSoft} />
      <rect x="0" y="2" width="76" height="6" rx="2" fill={PAL.steelDark} />
      {/* Intake fan */}
      <circle cx="34" cy="30" r="19" fill={PAL.ink} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M34 30 L${34 + Math.cos(a) * 17} ${30 + Math.sin(a) * 17} A17 17 0 0 1 ${34 + Math.cos(a + 0.62) * 17} ${30 + Math.sin(a + 0.62) * 17} Z`}
            fill={PAL.steelDark}
            opacity="0.5"
          />
        );
      })}
      <circle cx="34" cy="30" r="5" fill={PAL.steel} />
      {/* Modular output ports — where the sleeved cables plug in */}
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => (
          <rect key={`${r}-${c}`} x={58 + c * 8} y={12 + r * 12} width="6" height="8" rx="1" fill={PAL.ink} />
        )),
      )}
      {/* IEC socket and rocker */}
      <rect x="4" y="14" width="11" height="9" rx="1" fill={PAL.ink} />
      <rect x="4" y="27" width="11" height="5" rx="1" fill={PAL.steelDark} />
      {highlighted && <Ring x={-2} y={0} w={104} h={58} r={3} />}
    </g>
  );
}

/** Thermal paste — kept simple, the sheet has no syringe so this is a tube. */
export function VectorPaste({ highlighted }: VectorProps) {
  return (
    <g>
      {/* 100 x 26.7 — a paste tube is long and slim. */}
      <rect x="2" y="8" width="66" height="12" rx="6" fill={PAL.paper} />
      <rect x="2" y="8" width="66" height="4" rx="2" fill={PAL.steel} />
      <rect x="14" y="11" width="34" height="6" rx="3" fill={PAL.red} />
      <rect x="68" y="10" width="10" height="8" rx="1.5" fill={PAL.steelDark} />
      <path d="M78 12 L92 14 L78 16 Z" fill={PAL.steel} />
      {highlighted && <Ring x={-1} y={5} w={100} h={18} r={9} />}
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
