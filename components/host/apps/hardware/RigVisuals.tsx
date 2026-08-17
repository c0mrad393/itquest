"use client";

/**
 * Flat-vector hardware illustrations
 * ==================================
 * The presentation layer for the hardware bench. Every export here is a pure
 * function of a `Slot` or `Fastener` from `lib/hardware/rig.ts` — this file
 * reads the state machine and draws it, and holds no rules of its own.
 *
 * ── WHY SVG COMPOSITION AND NOT IMAGES ──────────────────────────────────────
 *
 * A photo-real board would be a megabyte of raster that blurs the moment the
 * window is resized, and every state (clip open, screw out, slot empty) would
 * need its own asset. Composed shapes cost a few kilobytes, stay crisp at any
 * zoom, and — the part that matters — can be DRIVEN: a clip is the same shape
 * rotated, so `fastened` maps to a transform rather than to a different file.
 *
 * ── DEPTH WITHOUT GRADIENT SOUP ─────────────────────────────────────────────
 *
 * Flat design with one consistent light source: a lighter top edge, a darker
 * bottom edge, and a single soft drop shadow on parts that sit ABOVE the board.
 * Components that are recessed INTO the board (an empty DIMM slot, a socket
 * cavity) invert that — dark at the top — which is what actually reads as a
 * hole rather than a tile.
 *
 * SVG and CSS only — no emoji, no raster assets.
 */

import type { Fastener, Slot } from "@/lib/hardware/rig";

export type BoardKind = "desktop" | "laptop" | "server";

/**
 * Canvas extents per platform, in board grid units.
 *
 * A server board is not a desktop board with more parts on it — it is wider and
 * squarer, and drawing all three at ATX proportions is precisely what made the
 * three topologies read as the same object. The slot coordinates in `rig.ts`
 * are laid out inside these bounds.
 */
export const BOARD_SIZE: Record<BoardKind, { w: number; h: number }> = {
  desktop: { w: 20, h: 11.5 },
  laptop: { w: 20, h: 12.5 },
  server: { w: 23.5, h: 11.5 },
};


/**
 * Shared paint: gradients, filters and patterns, defined once per SVG.
 *
 * Every material in this file references these by id rather than carrying its
 * own inline fill. That is not just tidiness — a `<defs>` block is resolved once
 * by the renderer and reused, where inlining a gradient per component would emit
 * one gradient object per DIMM and re-rasterise each on every state change.
 *
 * Ids are prefixed `hw-` because these live in the same document as every other
 * app's SVG; a bare id like "metal" would be claimed by whoever mounted last.
 */
export function RigDefs() {
  return (
    <defs>
      {/* Brushed metal: bright top, mid body, shadowed underside. */}
      <linearGradient id="hw-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f2f5f8" />
        <stop offset="18%" stopColor="#ccd3da" />
        <stop offset="55%" stopColor="#98a2ac" />
        <stop offset="82%" stopColor="#b6bec7" />
        <stop offset="100%" stopColor="#6d757f" />
      </linearGradient>
      {/* A tighter, colder version for heatsink fins and brackets. */}
      <linearGradient id="hw-metal-cool" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#dfe6ec" />
        <stop offset="45%" stopColor="#9aa4ae" />
        <stop offset="100%" stopColor="#69727c" />
      </linearGradient>
      {/* Specular sweep laid over metal at low opacity — the "sheen". */}
      <linearGradient id="hw-sheen" x1="0" y1="0" x2="1" y2="0.6">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
        <stop offset="60%" stopColor="#ffffff" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      {/* DIMM substrate: fibreglass green with a lit top edge. */}
      <linearGradient id="hw-pcb-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2f9463" />
        <stop offset="30%" stopColor="#1f6b45" />
        <stop offset="100%" stopColor="#124a2f" />
      </linearGradient>
      <linearGradient id="hw-pcb-red" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a33b4a" />
        <stop offset="30%" stopColor="#7c2a36" />
        <stop offset="100%" stopColor="#4d1922" />
      </linearGradient>
      {/* Black IC package: epoxy is never flat, it catches a highlight. */}
      <linearGradient id="hw-chip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a4048" />
        <stop offset="22%" stopColor="#20252c" />
        <stop offset="100%" stopColor="#0e1116" />
      </linearGradient>

      {/* Gold fingers: a repeating stripe, so contacts are individual pads. */}
      <pattern id="hw-gold" width="2.4" height="4" patternUnits="userSpaceOnUse">
        <rect width="2.4" height="4" fill="#8c6524" />
        <rect width="1.5" height="4" fill="#e8bb5a" />
        <rect width="1.5" height="1.2" fill="#f7dfa0" />
      </pattern>

      {/* Ribbon cable: fine conductor stripes under a dark laminate. */}
      <pattern id="hw-ribbon" width="3" height="6" patternUnits="userSpaceOnUse">
        <rect width="3" height="6" fill="#2b2f36" />
        <rect x="0.7" width="1.1" height="6" fill="#43494f" />
        <rect x="0.7" width="1.1" height="6" fill="#c9a86a" opacity="0.22" />
      </pattern>

      {/* Motherboard copper: fine diagonal routing under the solder mask. */}
      <pattern id="hw-traces" width="18" height="18" patternUnits="userSpaceOnUse">
        <path d="M0 18 L18 0 M-4 4 L4 -4 M14 22 L22 14" stroke="#ffffff" strokeOpacity="0.045" strokeWidth="1.6" fill="none" />
        <circle cx="4" cy="4" r="0.9" fill="#ffffff" fillOpacity="0.05" />
        <circle cx="13" cy="12" r="0.9" fill="#ffffff" fillOpacity="0.04" />
      </pattern>

      {/* Depth. Components sit above the board and cast onto it. */}
      <filter id="hw-shadow" x="-40%" y="-40%" width="190%" height="190%">
        <feDropShadow dx="0.9" dy="1.9" stdDeviation="1.5" floodColor="#000" floodOpacity="0.55" />
      </filter>
      <filter id="hw-shadow-lg" x="-40%" y="-40%" width="190%" height="190%">
        <feDropShadow dx="1.4" dy="3" stdDeviation="2.6" floodColor="#000" floodOpacity="0.6" />
      </filter>
      {/* Interactive glow, used on hover and selection. */}
      <filter id="hw-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#22d3ee" floodOpacity="0.95" />
      </filter>

      {/* Screw head: lit from the upper left, recessed drive. */}
      <radialGradient id="hw-screw" cx="0.33" cy="0.28" r="0.82">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="35%" stopColor="#c8cfd6" />
        <stop offset="72%" stopColor="#8d959e" />
        <stop offset="100%" stopColor="#545c65" />
      </radialGradient>
      {/* Copper heat pipe, round in section. */}
      <linearGradient id="hw-copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e0a071" />
        <stop offset="30%" stopColor="#b97845" />
        <stop offset="100%" stopColor="#7c4a26" />
      </linearGradient>
    </defs>
  );
}

/** Board substrate palettes. Real PCBs, not neon. */
export const BOARD: Record<BoardKind, { pcb: string; pcbDark: string; trace: string; silk: string }> = {
  desktop: { pcb: "#1c5c3a", pcbDark: "#14432b", trace: "#2f7d53", silk: "#dbe7de" },
  laptop: { pcb: "#173a72", pcbDark: "#112c58", trace: "#2b5a9e", silk: "#dbe3ee" },
  server: { pcb: "#17402c", pcbDark: "#0f2c1e", trace: "#276b47", silk: "#d8e6dd" },
};

const GOLD = "#d9a441";
const GOLD_DIM = "#a87d2e";
const METAL = "#b8c0c9";
const METAL_DARK = "#7c858f";
const PLASTIC = "#1b1f26";

/**
 * The board itself: substrate, copper traces, mounting holes, silkscreen.
 *
 * Traces are drawn from a deterministic pattern rather than randomly, so the
 * board looks the same on every render — a PCB whose copper moved between
 * frames would be the most distracting thing on the screen.
 */
export function BoardSubstrate({ kind, w, h }: { kind: BoardKind; w: number; h: number }) {
  const c = BOARD[kind];
  const holes = [
    [0.03, 0.05], [0.97, 0.05], [0.03, 0.95], [0.97, 0.95], [0.5, 0.03], [0.5, 0.97],
  ];
  return (
    <g>
      <rect x="0" y="0" width={w} height={h} rx="8" fill={c.pcb} />
      {/* Copper runs — long horizontals with right-angle jogs, as real routing. */}
      <g stroke={c.trace} strokeWidth="1.1" fill="none" opacity="0.55">
        {Array.from({ length: 14 }, (_, i) => {
          const y = (h / 15) * (i + 1);
          const jog = (i % 3) * 24 + 40;
          return (
            <path key={i} d={`M6 ${y} H${jog} L${jog + 10} ${y - 7} H${w - 10}`} />
          );
        })}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={(w / 10) * (i + 1)} y1="8" x2={(w / 10) * (i + 1)} y2={h - 8} opacity="0.35" />
        ))}
      </g>
      {/* Etched copper under the solder mask, tiled rather than drawn per-run. */}
      <rect x="0" y="0" width={w} height={h} rx="8" fill="url(#hw-traces)" />
      {/* Solder-mask edge darkening: the board is not flat-lit at the rim. */}
      <rect x="0" y="0" width={w} height={h} rx="8" fill="none" stroke={c.pcbDark} strokeWidth="5" />
      {holes.map(([fx, fy], i) => (
        <g key={i}>
          <circle cx={fx * w} cy={fy * h} r="5.5" fill={c.pcbDark} />
          <circle cx={fx * w} cy={fy * h} r="3.4" fill="#0a0f14" />
          <circle cx={fx * w} cy={fy * h} r="5.5" fill="none" stroke={METAL} strokeWidth="0.8" opacity="0.5" />
        </g>
      ))}
    </g>
  );
}

// ── Slot bodies ─────────────────────────────────────────────────────────────

interface Geo { x: number; y: number; w: number; h: number }

/**
 * Draw the slot: the part if one is fitted, otherwise the empty receptacle.
 *
 * The empty state is deliberately detailed — exposed DIMM contacts, socket
 * pins, bare PCIe teeth. A slot that goes blank when you pull a part tells the
 * learner nothing; a slot that shows what the part was mating with tells them
 * what they are about to line up.
 */
export function SlotBody({ slot, g, kind }: { slot: Slot; g: Geo; kind: BoardKind }) {
  if (!slot.part) return <EmptySlot slot={slot} g={g} kind={kind} />;
  switch (slot.kind) {
    case "ram":
      return <RamModule g={g} vertical={g.h > g.w} label={slot.part.model} faulty={!!slot.part.faulty} />;
    case "cpu":
      return <CpuPackage g={g} label={slot.part.model} soldered={slot.fasteners.length === 0} />;
    case "gpu":
      return <ExpansionCard g={g} label={slot.part.model} board={kind} />;
    case "storage":
      return <DriveBody g={g} label={slot.part.model} caddy={slot.fasteners.some((f) => f.kind === "handle")} />;
    case "psu":
      return <PowerBody g={g} label={slot.part.model} block={slot.fasteners.some((f) => f.kind === "handle")} />;
    case "fan":
      return <FanBody g={g} label={slot.part.model} />;
    default:
      return null;
  }
}

function EmptySlot({ slot, g, kind }: { slot: Slot; g: Geo; kind: BoardKind }) {
  const c = BOARD[kind];
  const vertical = g.h > g.w;
  // Recessed: dark at the TOP edge, which is what reads as a cavity.
  const cavity = (
    <>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2.5" fill="#0a0d12" />
      <rect x={g.x} y={g.y} width={g.w} height={2.5} fill="#000" opacity="0.55" />
      <rect x={g.x} y={g.y + g.h - 2} width={g.w} height={2} fill={c.trace} opacity="0.5" />
    </>
  );

  if (slot.kind === "ram" || slot.kind === "gpu") {
    // Contact teeth along the long axis.
    const n = Math.max(8, Math.floor((vertical ? g.h : g.w) / 4));
    return (
      <g>
        {cavity}
        <g fill={GOLD_DIM} opacity="0.85">
          {Array.from({ length: n }, (_, i) =>
            vertical ? (
              <rect key={i} x={g.x + 2} y={g.y + 4 + i * ((g.h - 8) / n)} width={g.w - 4} height="1.4" />
            ) : (
              <rect key={i} x={g.x + 4 + i * ((g.w - 8) / n)} y={g.y + 2} width="1.4" height={g.h - 4} />
            ),
          )}
        </g>
      </g>
    );
  }

  if (slot.kind === "cpu") {
    // A land grid: the pin field you must not touch.
    const cols = 14, rows = 14;
    return (
      <g>
        {cavity}
        <rect x={g.x + 3} y={g.y + 3} width={g.w - 6} height={g.h - 6} fill="#12161d" />
        <g fill={GOLD_DIM} opacity="0.8">
          {Array.from({ length: cols * rows }, (_, i) => (
            <circle
              key={i}
              cx={g.x + 6 + (i % cols) * ((g.w - 12) / (cols - 1))}
              cy={g.y + 6 + Math.floor(i / cols) * ((g.h - 12) / (rows - 1))}
              r="0.7"
            />
          ))}
        </g>
      </g>
    );
  }

  return <g>{cavity}</g>;
}

/** A DIMM: green PCB, black DRAM packages, gold fingers, key notch. */
function RamModule({ g, vertical, label, faulty }: { g: Geo; vertical: boolean; label: string; faulty: boolean }) {
  const chips = 8;
  const body = faulty ? "url(#hw-pcb-red)" : "url(#hw-pcb-green)";
  const bodyDark = faulty ? "#4a1a22" : "#155234";

  if (vertical) {
    return (
      <g filter="url(#hw-shadow)">
        <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill={body} />
        {/* DRAM packages down the stick, each with its own lit top edge. */}
        {Array.from({ length: chips }, (_, i) => {
          const cy = g.y + 5 + i * ((g.h - 14) / chips);
          const ch = (g.h - 14) / chips - 1.6;
          return (
            <g key={i}>
              <rect x={g.x + 1.5} y={cy} width={g.w - 3} height={ch} rx="0.5" fill="url(#hw-chip)" />
              <rect x={g.x + 1.5} y={cy} width={g.w - 3} height="0.5" fill="#5a626b" opacity="0.8" />
            </g>
          );
        })}
        {/* Gold fingers: individual pads via the stripe pattern, plus the key notch. */}
        <rect x={g.x + 0.7} y={g.y + g.h - 4} width={g.w - 1.4} height="3.4" fill="url(#hw-gold)" />
        <rect x={g.x + g.w * 0.4} y={g.y + g.h - 4} width="1.5" height="3.4" fill={bodyDark} />
        {/* Silkscreen stripe along the spine */}
        <rect x={g.x + 0.8} y={g.y + 2} width={g.w - 1.6} height="0.7" fill="#cfe6d8" opacity="0.35" />
        <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill="url(#hw-sheen)" opacity="0.35" />
        {faulty && <title>{label} — failed self-test</title>}
      </g>
    );
  }
  return (
    <g filter="url(#hw-shadow)">
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill={body} />
      {Array.from({ length: chips }, (_, i) => {
        const cx = g.x + 5 + i * ((g.w - 12) / chips);
        const cw = (g.w - 12) / chips - 1.6;
        return (
          <g key={i}>
            <rect x={cx} y={g.y + 2.2} width={cw} height={g.h - 6.6} rx="0.5" fill="url(#hw-chip)" />
            <rect x={cx} y={g.y + 2.2} width={cw} height="0.5" fill="#5a626b" opacity="0.8" />
          </g>
        );
      })}
      <rect x={g.x + 1} y={g.y + g.h - 3.4} width={g.w - 2} height="2.9" fill="url(#hw-gold)" />
      <rect x={g.x + g.w * 0.45} y={g.y + g.h - 3.4} width="1.5" height="2.9" fill={bodyDark} />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill="url(#hw-sheen)" opacity="0.3" />
    </g>
  );
}

/** A socketed CPU under a metal ILM, or a bare soldered SoC. */
function CpuPackage({ g, label, soldered }: { g: Geo; label: string; soldered: boolean }) {
  const inset = 4.2;
  const ihsX = g.x + inset;
  const ihsY = g.y + inset;
  const ihsW = g.w - inset * 2;
  const ihsH = g.h - inset * 2;
  return (
    <g filter="url(#hw-shadow-lg)">
      {/* Socket body and its plastic frame */}
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="#171b21" />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="none" stroke="#39414c" strokeWidth="1.2" />
      <rect x={g.x + 1.6} y={g.y + 1.6} width={g.w - 3.2} height={g.h - 3.2} rx="1.4" fill="#0d1116" />

      {/* Integrated heat spreader — nickel-plated copper, lit from upper left */}
      <rect x={ihsX} y={ihsY} width={ihsW} height={ihsH} rx="1.8" fill="url(#hw-metal)" />
      {/* The raised centre platform every IHS has */}
      <rect
        x={ihsX + ihsW * 0.12}
        y={ihsY + ihsH * 0.16}
        width={ihsW * 0.76}
        height={ihsH * 0.68}
        rx="1.2"
        fill="url(#hw-metal-cool)"
      />
      {/* Laser etch */}
      <rect x={ihsX + ihsW * 0.24} y={ihsY + ihsH * 0.4} width={ihsW * 0.52} height="1.5" rx="0.6" fill="#6b737c" opacity="0.75" />
      <rect x={ihsX + ihsW * 0.3} y={ihsY + ihsH * 0.56} width={ihsW * 0.4} height="1.1" rx="0.5" fill="#6b737c" opacity="0.5" />
      {/* Specular sweep across the lid */}
      <rect x={ihsX} y={ihsY} width={ihsW} height={ihsH} rx="1.8" fill="url(#hw-sheen)" />

      {!soldered && (
        /*
         * The independent loading mechanism: a hinged frame with a cam lever.
         * Drawn as real geometry rather than two lines, because this is the
         * thing a learner has to recognise and lift before the chip moves.
         */
        <g>
          <rect
            x={g.x + 0.8}
            y={g.y + 0.8}
            width={g.w - 1.6}
            height={g.h - 1.6}
            rx="1.6"
            fill="none"
            stroke="url(#hw-metal-cool)"
            strokeWidth="2.4"
          />
          {/* Cam lever down the right edge, hooked at the bottom */}
          <path
            d={`M${g.x + g.w - 2} ${g.y + 3} V${g.y + g.h - 4} q0 2.5 -2.6 2.5 h-3`}
            fill="none"
            stroke="url(#hw-metal)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx={g.x + g.w - 2} cy={g.y + 3} r="1.5" fill="url(#hw-screw)" />
        </g>
      )}
      <title>{label}</title>
    </g>
  );
}

/** A PCIe card: PCB, blower shroud, fan, and an I/O bracket. */
function ExpansionCard({ g, label, board }: { g: Geo; label: string; board: BoardKind }) {
  const c = BOARD[board];
  const fanR = Math.min(g.h * 0.36, g.w * 0.12);
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill="#1a1d24" />
      <rect x={g.x} y={g.y} width={g.w} height="1.6" fill="#2c313a" />
      {/* Shroud */}
      <rect x={g.x + 2} y={g.y + 1.6} width={g.w - 16} height={g.h - 5} rx="1.2" fill="#23272f" />
      {[0.28, 0.62].map((f, i) => (
        <g key={i}>
          <circle cx={g.x + g.w * f} cy={g.y + g.h * 0.5} r={fanR} fill="#12151a" />
          <circle cx={g.x + g.w * f} cy={g.y + g.h * 0.5} r={fanR * 0.62} fill="#2b313a" />
          <circle cx={g.x + g.w * f} cy={g.y + g.h * 0.5} r={fanR * 0.16} fill="#4a525d" />
        </g>
      ))}
      {/* Gold edge connector along the bottom */}
      <rect x={g.x + 6} y={g.y + g.h - 2.4} width={g.w * 0.55} height="2" fill={GOLD} />
      {/* I/O bracket at the right */}
      <rect x={g.x + g.w - 5} y={g.y - 1} width="4" height={g.h + 2} rx="0.8" fill={METAL} />
      <rect x={g.x + g.w - 5} y={g.y - 1} width="4" height="1.2" fill="#e2e7ec" />
      <title>{label}</title>
      <rect x={g.x + 4} y={g.y + 3} width={g.w * 0.2} height="2" fill={c.silk} opacity="0.25" />
    </g>
  );
}

/** A drive: bare 2.5" body, or a hot-swap caddy with a vented face. */
function DriveBody({ g, label, caddy }: { g: Geo; label: string; caddy: boolean }) {
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.6" fill={caddy ? "#2b2f37" : "#333942"} />
      <rect x={g.x} y={g.y} width={g.w} height="1.6" fill="#454c57" />
      <rect x={g.x} y={g.y + g.h - 1.6} width={g.w} height="1.6" fill="#1d2128" />
      {caddy ? (
        // Vent slots across the caddy face.
        <g fill="#12151a">
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={g.x + 4 + i * ((g.w - 12) / 7)} y={g.y + 3} width="1.6" height={g.h - 6} rx="0.6" />
          ))}
          <circle cx={g.x + g.w - 3.5} cy={g.y + g.h / 2} r="1.2" fill="#43d17c" />
        </g>
      ) : (
        <>
          <rect x={g.x + 2.5} y={g.y + 2.5} width={g.w - 5} height={g.h - 5} rx="1" fill="#272c34" />
          <rect x={g.x + 4} y={g.y + 4} width={g.w * 0.42} height="1.6" fill="#5b636e" />
        </>
      )}
      <title>{label}</title>
    </g>
  );
}

/** ATX connector block, or a modular PSU brick. */
function PowerBody({ g, label, block }: { g: Geo; label: string; block: boolean }) {
  const cols = block ? 4 : 2;
  const rows = block ? 4 : 12;
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.6" fill={block ? "#2a2f38" : "#e8e9ec"} />
      <rect x={g.x} y={g.y} width={g.w} height="1.6" fill={block ? "#3c434e" : "#fbfbfc"} />
      <rect x={g.x} y={g.y + g.h - 1.6} width={g.w} height="1.6" fill={block ? "#1b1f26" : "#b9bcc2"} />
      {/* Pin cavities — the giveaway that this is a connector and not a box. */}
      <g fill={block ? "#12151a" : "#9aa0a8"}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <rect
            key={i}
            x={g.x + 2.4 + (i % cols) * ((g.w - 5) / cols)}
            y={g.y + 3 + Math.floor(i / cols) * ((g.h - 6) / rows)}
            width={(g.w - 5) / cols - 1.2}
            height={(g.h - 6) / rows - 1}
            rx="0.4"
          />
        ))}
      </g>
      <title>{label}</title>
    </g>
  );
}

/** A fan: frame, hub and swept blades. */
function FanBody({ g, label }: { g: Geo; label: string }) {
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const r = Math.min(g.w, g.h) / 2 - 1.5;
  const blades = 9;
  return (
    <g filter="url(#hw-shadow)">
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="#22262e" />
      {/* Heatsink fins visible under the frame corners */}
      <g stroke="url(#hw-metal-cool)" strokeWidth="0.8" opacity="0.5">
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={g.x + 2} y1={g.y + 3 + i * ((g.h - 6) / 7)} x2={g.x + g.w - 2} y2={g.y + 3 + i * ((g.h - 6) / 7)} />
        ))}
      </g>
      <rect x={g.x} y={g.y} width={g.w} height="1.6" fill="#3c444f" />
      <circle cx={cx} cy={cy} r={r} fill="#14181e" />
      {/* Swept blades with a curved trailing edge, each catching the light
          differently — a fan of identical flat wedges reads as a pie chart. */}
      {Array.from({ length: blades }, (_, i) => {
        const a = (i / blades) * Math.PI * 2;
        const a2 = a + 0.62;
        const bow = r * 0.62;
        return (
          <path
            key={i}
            d={`M${cx + Math.cos(a) * r * 0.28} ${cy + Math.sin(a) * r * 0.28}
                Q${cx + Math.cos(a + 0.3) * bow} ${cy + Math.sin(a + 0.3) * bow}
                 ${cx + Math.cos(a2) * r} ${cy + Math.sin(a2) * r}
                A${r} ${r} 0 0 0 ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r} Z`}
            fill="#39414b"
            opacity={0.72 + (i % 3) * 0.09}
          />
        );
      })}
      {/* Machined hub */}
      <circle cx={cx} cy={cy} r={r * 0.32} fill="url(#hw-metal)" />
      <circle cx={cx} cy={cy} r={r * 0.32} fill="url(#hw-sheen)" />
      <circle cx={cx} cy={cy} r={r * 0.11} fill="#4a525d" />
      <title>{label}</title>
    </g>
  );
}

// ── Fasteners ───────────────────────────────────────────────────────────────

/**
 * A physical fastener, drawn as the thing it is and animated by its state.
 *
 * `fastened` drives a TRANSFORM, not a different shape: a clip rotates open
 * about its hinge, a ZIF latch flips up, a caddy handle swings out, a screw
 * backs out and fades. One shape, one transition — which is why the CSS
 * transition reads as motion rather than as a swap.
 */
export function FastenerVisual({
  f,
  cx,
  cy,
  vertical,
  onClick,
}: {
  f: Fastener;
  cx: number;
  cy: number;
  vertical: boolean;
  onClick: () => void;
}) {
  const open = !f.fastened;

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer [&:hover>.hit]:opacity-100"
      role="button"
      aria-label={`${f.label} — ${f.fastened ? "engaged" : "released"}`}
    >
      {/* Generous invisible hit area; the glow appears on hover. */}
      <circle className="hit opacity-0 transition-opacity" cx={cx} cy={cy} r="8" fill="#fbbf24" fillOpacity="0.22" />

      {f.kind === "clip" && (
        <g
          style={{
            transform: `rotate(${open ? (vertical ? 38 : -38) : 0}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 180ms ease-out",
          }}
        >
          {/* Body, then the hook. When closed the hook overlaps the module's
              notch, which is what "locked in" actually looks like. */}
          <rect x={cx - 1.7} y={cy - 5} width="3.4" height="10" rx="1.3" fill="url(#hw-metal)" />
          <rect x={cx - 1.7} y={cy - 5} width="3.4" height="10" rx="1.3" fill="url(#hw-sheen)" />
          <path
            d={`M${cx - 2.8} ${cy + 2.2} h5.6 q1.3 0 1.3 1.4 v1.6 q0 1.3 -1.3 1.3 h-5.6 q-1.3 0 -1.3 -1.3 v-1.6 q0 -1.4 1.3 -1.4 z`}
            fill="url(#hw-metal-cool)"
          />
          {!open && <circle cx={cx} cy={cy + 4} r="0.9" fill="#22d3ee" opacity="0.75" />}
        </g>
      )}

      {f.kind === "zif" && (
        <g
          style={{
            transform: `rotate(${open ? -72 : 0}deg)`,
            transformOrigin: `${cx}px ${cy + 3}px`,
            transition: "transform 200ms ease-out",
          }}
        >
          <rect x={cx - 6} y={cy} width="12" height="3.4" rx="1" fill="url(#hw-copper)" />
          <rect x={cx - 6} y={cy} width="12" height="3.4" rx="1" fill="url(#hw-sheen)" opacity="0.6" />
          {/* Hinge pins at each end of the actuator */}
          <circle cx={cx - 5} cy={cy + 1.7} r="0.7" fill="#5e401f" />
          <circle cx={cx + 5} cy={cy + 1.7} r="0.7" fill="#5e401f" />
        </g>
      )}

      {f.kind === "handle" && (
        <g
          style={{
            transform: `rotate(${open ? -52 : 0}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 220ms ease-out",
          }}
        >
          <rect x={cx - 1.6} y={cy - 1.7} width="12" height="3.4" rx="1.5" fill="url(#hw-metal)" />
          <rect x={cx - 1.6} y={cy - 1.7} width="12" height="3.4" rx="1.5" fill="url(#hw-sheen)" />
          {/* Grip ribs along the handle */}
          <g fill="#7d858e" opacity="0.7">
            {Array.from({ length: 4 }, (_, i) => (
              <rect key={i} x={cx + 3 + i * 1.9} y={cy - 1} width="0.7" height="2" rx="0.3" />
            ))}
          </g>
          <circle cx={cx} cy={cy} r="2.3" fill="url(#hw-screw)" />
        </g>
      )}

      {f.kind === "screw" && (
        <g
          style={{
            transform: `rotate(${open ? 135 : 0}deg) scale(${open ? 0.72 : 1})`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 220ms ease-out, opacity 220ms ease-out",
            opacity: open ? 0.28 : 1,
          }}
        >
          {/* Seat shadow, head, then a recessed cross that is cut INTO it —
              a dark cross drawn on top reads as a sticker, not a drive. */}
          <circle cx={cx + 0.3} cy={cy + 0.6} r="3.7" fill="#000" opacity="0.45" />
          <circle cx={cx} cy={cy} r="3.7" fill="url(#hw-screw)" />
          <circle cx={cx} cy={cy} r="3.7" fill="none" stroke="#4a525b" strokeWidth="0.5" />
          <g>
            <rect x={cx - 2.5} y={cy - 0.62} width="5" height="1.24" rx="0.3" fill="#3f464f" />
            <rect x={cx - 0.62} y={cy - 2.5} width="1.24" height="5" rx="0.3" fill="#3f464f" />
            {/* Lit lower-right edge of the recess gives it depth */}
            <rect x={cx - 2.5} y={cy + 0.28} width="5" height="0.34" rx="0.2" fill="#aeb6bf" opacity="0.55" />
            <rect x={cx + 0.28} y={cy - 2.5} width="0.34" height="5" rx="0.2" fill="#aeb6bf" opacity="0.55" />
          </g>
        </g>
      )}
    </g>
  );
}

// ── Cables ──────────────────────────────────────────────────────────────────

const CABLE_TONE: Record<string, { on: string; off: string }> = {
  power: { on: "#e0b341", off: "#6b5320" },
  data: { on: "#d8455f", off: "#5f2029" },
  ribbon: { on: "#b98a4e", off: "#54402a" },
};

/**
 * A cable as an actual routed run.
 *
 * Ribbons are drawn flat and wide with fold lines; round cables get a highlight
 * down the middle. Disconnected ones stop short of their header and go slack,
 * because a cable that merely changes colour when unplugged does not read as
 * unplugged.
 */
export function CableRun({
  from,
  to,
  kind,
  connected,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: string;
  connected: boolean;
}) {
  const tone = CABLE_TONE[kind] ?? CABLE_TONE.power;
  const stroke = connected ? tone.on : tone.off;
  // Detached cables fall short and sag — the visual language of "not seated".
  const end = connected ? to : { x: from.x + (to.x - from.x) * 0.55, y: from.y + (to.y - from.y) * 0.55 + 14 };
  const midX = (from.x + end.x) / 2;
  const d = `M${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;

  if (kind === "ribbon") {
    /*
     * A flex cable is a flat laminate, not a wire. Drawn as a wide stroked band
     * filled with the conductor pattern, so the individual traces read at any
     * zoom — a single fat stroke just looks like a thick rope.
     */
    return (
      <g opacity={connected ? 1 : 0.62} filter={connected ? "url(#hw-shadow)" : undefined}>
        <path d={d} stroke="#12151a" strokeWidth="9" fill="none" strokeLinecap="butt" />
        <path d={d} stroke="url(#hw-ribbon)" strokeWidth="7.6" fill="none" strokeLinecap="butt" />
        {/* Fold sheen along the top edge of the band */}
        <path d={d} stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1.2" fill="none" />
        {!connected && <circle cx={end.x} cy={end.y} r="3" fill="#2b2f36" stroke="#7f1d1d" strokeWidth="1.2" />}
      </g>
    );
  }
  /*
   * Power leads are BUNDLES: a black sheath stroke, the insulated colour on top
   * of it, and a fine specular line. Three stacked strokes cost nothing and are
   * the difference between a wire and a line.
   */
  return (
    <g opacity={connected ? 1 : 0.7}>
      <path d={d} stroke="#05070a" strokeWidth="6.2" fill="none" strokeLinecap="round" />
      <path d={d} stroke="#161a20" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d={d} stroke={stroke} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d={d} stroke="#ffffff" strokeOpacity="0.28" strokeWidth="0.8" fill="none" />
      {!connected && (
        <g>
          {/* A bare connector shell, dangling. */}
          <rect x={end.x - 3} y={end.y - 2} width="6" height="4" rx="1.2" fill="#2a2f38" stroke={stroke} strokeWidth="1" />
        </g>
      )}
    </g>
  );
}

/**
 * Chassis furniture: the non-interactive structure a board sits in.
 *
 * Heat pipes, heatsink retention frames and the I/O shield are not slots — you
 * do not click them and the store has never heard of them — but leaving them
 * out is why the three platforms looked alike. They are drawn beneath the parts
 * and are `pointer-events-none` throughout, so they cannot swallow a click
 * meant for a screw.
 */
export function ChassisFurniture({ kind, u }: { kind: BoardKind; u: number }) {
  if (kind === "laptop") {
    // Copper pipes run from the central SoC out to both blowers, with a flat
    // vapour plate over the die — the defining feature of a gaming chassis.
    const pipe = (d: string, w: number) => (
      <path d={d} stroke="#b97845" strokeWidth={w} fill="none" strokeLinecap="round" />
    );
    return (
      <g className="pointer-events-none">
        {pipe(`M${4.4 * u} ${2.4 * u} C ${6.5 * u} ${2.2 * u}, ${7 * u} ${2.6 * u}, ${9.9 * u} ${2.6 * u}`, 9)}
        {pipe(`M${15.6 * u} ${2.4 * u} C ${13.5 * u} ${2.2 * u}, ${13 * u} ${3.2 * u}, ${10.2 * u} ${3.2 * u}`, 9)}
        {/* Highlight along the top of each pipe: copper is round, not flat. */}
        {pipe(`M${4.4 * u} ${2.2 * u} C ${6.5 * u} ${2 * u}, ${7 * u} ${2.4 * u}, ${9.9 * u} ${2.4 * u}`, 2)}
        <g opacity="0.55">
          {pipe(`M${15.6 * u} ${2.2 * u} C ${13.5 * u} ${2 * u}, ${13 * u} ${3 * u}, ${10.2 * u} ${3 * u}`, 2)}
        </g>
        {/* Vapour plate over the SoC */}
        <rect x={7.9 * u} y={1.2 * u} width={4.2 * u} height={3.8 * u} rx="4" fill="#c98a52" opacity="0.35" />
        {/* Chassis rails top and bottom */}
        <rect x={0.3 * u} y={0.3 * u} width={19.4 * u} height={11.9 * u} rx="10" fill="none" stroke="#2a3446" strokeWidth="3" />
      </g>
    );
  }

  if (kind === "server") {
    // Massive heatsink retention frames around both sockets, plus the drive
    // cage divider that separates the front bays from the board.
    const frame = (x: number, y: number) => (
      <g>
        <rect
          x={(x - 0.9) * u} y={(y - 0.9) * u}
          width={5.2 * u} height={5.2 * u} rx="3"
          fill="none" stroke="#8d959f" strokeWidth="2.4" opacity="0.75"
        />
        {[[x - 0.9, y - 0.9], [x + 4.3, y - 0.9], [x - 0.9, y + 4.3], [x + 4.3, y + 4.3]].map(([cx, cy], i) => (
          <circle key={i} cx={cx * u} cy={cy * u} r="3.4" fill="#6f7883" />
        ))}
      </g>
    );
    return (
      <g className="pointer-events-none">
        {frame(6.5, 3.6)}
        {frame(14.6, 3.6)}
        {/* Front drive cage */}
        <rect x={0.4 * u} y={0.4 * u} width={3.2 * u} height={9.2 * u} rx="4" fill="#10241a" stroke="#2b4d3a" strokeWidth="2" />
        {/* PSU bay divider */}
        <rect x={20.1 * u} y={0.4 * u} width={3 * u} height={6 * u} rx="4" fill="#10241a" stroke="#2b4d3a" strokeWidth="2" />
      </g>
    );
  }

  // Desktop: the rear I/O shield cluster, top-left, as ATX specifies.
  return (
    <g className="pointer-events-none">
      <rect x={0.6 * u} y={0.5 * u} width={4.6 * u} height={1.5 * u} rx="2" fill="#242a33" stroke="#3c444f" strokeWidth="1.2" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={(0.95 + i * 0.72) * u} y={0.8 * u} width={0.5 * u} height={0.9 * u} rx="1.5" fill="#0d1117" />
      ))}
      <text x={0.7 * u} y={2.5 * u} fontSize="6" fill="#dbe7de" opacity="0.4" className="select-none font-mono">
        REAR I/O
      </text>
    </g>
  );
}

/**
 * A zoomed vector of the selected part, for the inspector.
 *
 * Reuses the same body components at a larger scale rather than drawing a
 * second set of illustrations — one definition per part, so the panel can never
 * show something the board does not.
 */
export function PartPortrait({ slot, kind }: { slot: Slot; kind: BoardKind }) {
  const W = 150;
  const H = 84;
  const pad = 12;
  const vertical = slot.h > slot.w;
  // Fit the part to the portrait box, keeping its orientation.
  const g: Geo = vertical
    ? { x: W / 2 - 13, y: pad, w: 26, h: H - pad * 2 }
    : { x: pad, y: H / 2 - 15, w: W - pad * 2, h: 30 };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-edge bg-[#0a0f16]">
      <rect x="0" y="0" width={W} height={H} fill="#0a0f16" />
      <SlotBody slot={slot} g={g} kind={kind} />
    </svg>
  );
}


// ── Workbench furniture ─────────────────────────────────────────────────────

/**
 * The chassis the board is mounted into.
 *
 * Drawn as a frame AROUND the board rather than behind it, so the motherboard
 * area stays exactly where the topology coordinates put it — the case is set
 * dressing for the build, not a new coordinate system to re-lay everything in.
 */
export function ChassisFrame({ w, h }: { w: number; h: number }) {
  const m = 10;
  return (
    <g className="pointer-events-none">
      {/* Case shell */}
      <rect x={-m} y={-m} width={w + m * 2} height={h + m * 2} rx="12" fill="#191d24" />
      <rect x={-m} y={-m} width={w + m * 2} height={h + m * 2} rx="12" fill="none" stroke="#2f353e" strokeWidth="2" />
      {/* Lit top rail and shadowed floor, so the tray reads as a box */}
      <rect x={-m} y={-m} width={w + m * 2} height="3" rx="1.5" fill="#3d444e" />
      <rect x={-m} y={h + m - 3} width={w + m * 2} height="3" rx="1.5" fill="#0d1116" />
      {/* Motherboard standoffs at the mounting points */}
      {[[0.03, 0.05], [0.97, 0.05], [0.03, 0.95], [0.97, 0.95]].map(([fx, fy], i) => (
        <circle key={i} cx={fx * w} cy={fy * h} r="7" fill="none" stroke="#4a525c" strokeWidth="1.4" opacity="0.6" />
      ))}
      {/* Rear I/O cut-out and expansion slot covers down the right edge */}
      <rect x={w + 1} y={6} width={m - 2} height={h * 0.16} rx="2" fill="#0b0e13" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={w + 2} y={h * 0.42 + i * (h * 0.085)} width={m - 4} height={h * 0.055} rx="1" fill="#252b33" />
      ))}
    </g>
  );
}

/** A screwdriver resting on the bench. Set dressing, and a mode affordance. */
export function ScrewdriverIcon({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 14" width={size * 1.8} height={size * 0.42} aria-hidden>
      <rect x="0" y="3.6" width="22" height="6.8" rx="3.4" fill="#c2410c" />
      <rect x="0" y="3.6" width="22" height="2.4" rx="1.2" fill="#ea580c" />
      <rect x="22" y="5.4" width="4" height="3.2" fill="#6b7280" />
      <rect x="26" y="5.9" width="26" height="2.2" rx="1" fill="url(#hw-metal)" />
      <rect x="52" y="4.9" width="7" height="4.2" rx="0.8" fill="url(#hw-metal-cool)" />
    </svg>
  );
}
