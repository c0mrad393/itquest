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

import { DESKTOP } from "@/lib/desktop-sim/chassis";

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
   * Portrait ATX, 100 x 125 — the 244 x 305mm board as it is actually shaped.
   *
   * Sockets are drawn FROM `BOARD_SLOTS`, the same table the drop zones derive
   * from. That is the whole point: a slot cannot be painted anywhere other
   * than where a part will land in it, because there is only one set of
   * numbers now.
   */
  // Board art height, from the same source the zones use.
  const H = DESKTOP.boardArtH;
  const slot = (id: string) => DESKTOP.slots.find((s) => s.id === id);
  const socket = slot("socket");
  const a1 = slot("dimm-a1");
  const a2 = slot("dimm-a2");
  const pcie = slot("pcie-x16");
  const m2 = slot("m2-1");

  const traces = [
    "M40 44 L40 56 L54 70 L54 96",
    "M46 44 L46 52 L62 68 L62 96",
    "M28 40 L18 50 L18 76",
    "M24 44 L12 56 L12 84",
    "M58 20 L58 6 L82 6",
    "M62 24 L62 10 L86 10",
    "M34 58 L34 74 L22 88",
    "M50 60 L50 76 L40 92",
  ];

  return (
    <g>
      <rect x="1" y="1" width="98" height={H - 2} rx="1.5" fill={PAL.boardBlue} />

      <g stroke={PAL.trace} strokeWidth="0.5" fill="none" opacity="0.9">
        {traces.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* ── Rear I/O, down the top-left edge ───────────────────────────── */}
      <rect x="3" y="3" width="9" height="6" rx="0.6" fill={PAL.steel} />
      <rect x="3" y="10" width="7" height="12" rx="0.8" fill={PAL.ioMagenta} />
      <rect x="4" y="11.4" width="5" height="9" rx="0.5" fill="#8d2455" />
      {[24, 28].map((y, i) => (
        <circle key={i} cx="6.5" cy={y} r="1.9" fill={i ? PAL.ioTeal : "#7d5aa8"} />
      ))}
      {[PAL.ioOrange, PAL.ioBlue, "#7fd06a"].map((c, i) => (
        <circle key={i} cx="6.5" cy={32 + i * 3.2} r="1.2" fill={c} />
      ))}
      {[38, 45].map((y, i) => (
        <rect key={i} x="3" y={y} width="8" height="5.5" rx="0.6" fill={PAL.steel} />
      ))}

      {/* VRM chokes beside the socket */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="16" y={9 + i * 5} width="4" height="3.2" rx="0.4" fill={PAL.ink} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx="24" cy={10.6 + i * 5} r="1.5" fill={PAL.ioTeal} />
      ))}

      {/* ── CPU socket, drawn at the shared slot ───────────────────────── */}
      {socket && (
        <g>
          <rect x={socket.x} y={socket.y} width={socket.w} height={socket.h} rx="0.8" fill={PAL.steelDark} />
          <rect x={socket.x + 1.6} y={socket.y + 1.6} width={socket.w - 3.2} height={socket.h - 3.2} rx="0.6" fill={PAL.steel} />
          <g fill={PAL.steelDark} opacity="0.75">
            {Array.from({ length: 121 }, (_, i) => (
              <circle
                key={i}
                cx={socket.x + 3.4 + (i % 11) * ((socket.w - 6.8) / 10)}
                cy={socket.y + 3.4 + Math.floor(i / 11) * ((socket.h - 6.8) / 10)}
                r="0.28"
              />
            ))}
          </g>
          {/* Retention lever */}
          <rect x={socket.x + socket.w - 1.4} y={socket.y} width="1.4" height={socket.h} rx="0.7" fill={PAL.steelDark} />
        </g>
      )}

      {/* Gold VRM heatsink, below the socket */}
      <rect x="30" y="44" width="18" height="16" rx="0.8" fill={PAL.vrmGold} />
      <g stroke={PAL.vrmGoldDark} strokeWidth="0.6">
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1="30" y1={45.5 + i * 2.2} x2="48" y2={45.5 + i * 2.2} />
        ))}
      </g>

      {/* ── DIMM slots, drawn at the shared positions ──────────────────── */}
      {[a1, a2].map((d, i) =>
        d ? (
          <g key={d.id}>
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="0.5" fill={i ? PAL.slotBlue : PAL.slotYellow} />
            <rect x={d.x} y={d.y} width={d.w} height="2.4" fill={PAL.slotWhite} />
            <rect x={d.x} y={d.y + d.h - 2.4} width={d.w} height="2.4" fill={PAL.slotWhite} />
          </g>
        ) : null,
      )}
      {/* Two more, unpopulated, to make the bank of four the reference has */}
      {[80, 86.5].map((x, i) => (
        <g key={i}>
          <rect x={x} y="8" width="4.5" height="48" rx="0.5" fill={i ? PAL.slotBlue : PAL.slotYellow} opacity="0.55" />
          <rect x={x} y="8" width="4.5" height="2.4" fill={PAL.slotWhite} />
          <rect x={x} y="53.6" width="4.5" height="2.4" fill={PAL.slotWhite} />
        </g>
      ))}

      {/* ATX 24-pin, right edge */}
      <rect x="92" y="16" width="6" height="18" rx="0.8" fill={PAL.connCream} />
      <g fill={PAL.steelDark} opacity="0.6">
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={92.8 + (i % 2) * 2.4} y={17.2 + Math.floor(i / 2) * 1.35} width="1.6" height="0.9" rx="0.2" />
        ))}
      </g>

      {/* ── M.2, drawn at its shared slot ──────────────────────────────── */}
      {m2 && (
        <g>
          <rect x={m2.x} y={m2.y} width={m2.w} height={m2.h} rx="0.5" fill={PAL.ink} />
          <rect x={m2.x} y={m2.y + m2.h * 0.3} width="2" height={m2.h * 0.4} fill={PAL.gold} />
          <circle cx={m2.x + m2.w + 1.6} cy={m2.y + m2.h / 2} r="1.1" fill={PAL.steel} />
        </g>
      )}

      {/* ── Expansion: PCIe x16 at its shared slot, PCI below ──────────── */}
      {pcie && (
        <g>
          <rect x={pcie.x} y={pcie.y} width={pcie.w} height={pcie.h} rx="0.5" fill={PAL.ink} />
          <rect x={pcie.x + 1} y={pcie.y + 1} width={pcie.w - 2} height={pcie.h - 2} rx="0.3" fill="#2a2a2a" />
        </g>
      )}
      {[86, 92, 98, 104].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="54" height="3.4" rx="0.4" fill={PAL.slotWhite} />
          <rect x="26" y={y} width="1" height="3.4" fill={PAL.boardBlue} />
        </g>
      ))}

      {/* Chipset heatsink */}
      <rect x="68" y="86" width="14" height="14" rx="0.8" fill={PAL.steel} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={69 + i * 1.9} y="87" width="0.9" height="12" fill={PAL.steelDark} />
      ))}

      {/* SATA ports, right side */}
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}-${c}`}>
            <rect x={86 + c * 6} y={62 + r * 5} width="5" height="3.2" rx="0.5" fill={PAL.sata} />
            <rect x={87 + c * 6} y={63 + r * 5} width="3" height="1.3" rx="0.3" fill="#8f1a2a" />
          </g>
        )),
      )}

      {/* Front-panel header, coin cell, caps, ICs */}
      <rect x="74" y="112" width="20" height="3.2" rx="0.5" fill="#2b2f77" />
      <circle cx="70" cy="106" r="3" fill={PAL.steel} />
      <circle cx="70" cy="106" r="2.2" fill={PAL.paper} />
      {[[26, 10], [26, 18], [26, 26], [60, 42], [60, 50], [22, 62], [64, 62], [30, 70], [86, 78]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="1.7" fill={PAL.steelDark} />
          <circle cx={cx} cy={cy} r="1.25" fill={PAL.steel} />
        </g>
      ))}
      <Chip x={88} y={4} w={8} h={8} />
      <Chip x={6} y={56} w={6} h={6} />
      <Chip x={6} y={96} w={5} h={6} />
      <Chip x={66} y={116} w={7} h={6} />
      <Chip x={84} y={100} w={6} h={6} />

      {/* Mounting holes */}
      {[[4, 4], [4, 62], [4, 121], [50, 3], [96, 3], [96, 62], [96, 121], [50, 121]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="1.6" fill={PAL.slotYellow} />
          <circle cx={cx} cy={cy} r="0.85" fill={PAL.paper} />
        </g>
      ))}

      {highlighted && <Ring x={-1} y={-1} w={102} h={H + 2} />}
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
/**
 * A DIMM as it looks ONCE SEATED — the view from above the board.
 *
 * `VectorRam` is the module lying flat on the bench, which is right for the
 * tray and wrong for the slot: a seated DIMM stands perpendicular to the board,
 * so from above you see its length, the top edge of the heat spreader, and the
 * retention clip closed at each end. Drawn at 100 x 11.28 — the seated
 * footprint's own aspect — so the shared uniform-scale transform cannot
 * distort it.
 */
export function VectorRamSeated({ highlighted }: VectorProps) {
  return (
    <g>
      {/* Retention clips, closed over the module's notched ends */}
      <rect x="0" y="0.6" width="4" height="10" rx="1" fill={PAL.slotWhite} />
      <rect x="96" y="0.6" width="4" height="10" rx="1" fill={PAL.slotWhite} />
      {/* Module body seated between them */}
      <rect x="4" y="1.4" width="92" height="8.4" rx="0.8" fill={PAL.pcbGreen} />
      {/* Heat spreader crown — the face you actually see looking down */}
      <rect x="5" y="1.9" width="90" height="6" rx="0.7" fill={PAL.slotYellow} />
      <rect x="5" y="1.9" width="90" height="2.2" rx="0.7" fill={PAL.vrmGold} opacity="0.55" />
      {/* Spreader fins, along the crown */}
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={i} x={7 + i * 4} y="2.4" width="1.6" height="5" rx="0.3" fill={PAL.vrmGoldDark} opacity="0.4" />
      ))}
      {highlighted && <Ring x={-1.5} y={-1} w={103} h={13} r={1.5} />}
    </g>
  );
}

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

/**
 * Art used only once a part is seated, where the seated view genuinely differs
 * from the loose part. Anything absent here simply keeps its bench artwork.
 */
export const SEAT_VECTOR: Record<string, (p: VectorProps) => React.ReactElement> = {
  ram1: VectorRamSeated,
  ram2: VectorRamSeated,
};
