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
  const body = faulty ? "#6b2530" : "#1f6b45";
  const bodyDark = faulty ? "#4a1a22" : "#155234";

  if (vertical) {
    return (
      <g>
        <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill={body} />
        <rect x={g.x} y={g.y} width={g.w} height="1.6" fill="#2d8a5b" opacity="0.7" />
        <rect x={g.x} y={g.y + g.h - 2} width={g.w} height="2" fill={bodyDark} />
        {/* DRAM packages down the stick */}
        {Array.from({ length: chips }, (_, i) => (
          <rect
            key={i}
            x={g.x + 1.6}
            y={g.y + 5 + i * ((g.h - 14) / chips)}
            width={g.w - 3.2}
            height={(g.h - 14) / chips - 1.6}
            rx="0.6"
            fill={PLASTIC}
          />
        ))}
        {/* Gold fingers + key notch at the seating edge */}
        <rect x={g.x + 0.8} y={g.y + g.h - 4} width={g.w - 1.6} height="3" fill={GOLD} />
        <rect x={g.x + g.w * 0.4} y={g.y + g.h - 4} width="1.4" height="3" fill={bodyDark} />
        {faulty && <title>{label} — failed self-test</title>}
      </g>
    );
  }
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="1.5" fill={body} />
      <rect x={g.x} y={g.y} width={g.w} height="1.4" fill="#2d8a5b" opacity="0.7" />
      {Array.from({ length: chips }, (_, i) => (
        <rect
          key={i}
          x={g.x + 5 + i * ((g.w - 12) / chips)}
          y={g.y + 2.4}
          width={(g.w - 12) / chips - 1.6}
          height={g.h - 7}
          rx="0.6"
          fill={PLASTIC}
        />
      ))}
      <rect x={g.x + 1} y={g.y + g.h - 3.2} width={g.w - 2} height="2.6" fill={GOLD} />
      <rect x={g.x + g.w * 0.45} y={g.y + g.h - 3.2} width="1.4" height="2.6" fill={bodyDark} />
    </g>
  );
}

/** A socketed CPU under a metal ILM, or a bare soldered SoC. */
function CpuPackage({ g, label, soldered }: { g: Geo; label: string; soldered: boolean }) {
  const inset = 4;
  return (
    <g>
      {/* Socket frame */}
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="#20262f" />
      <rect x={g.x} y={g.y} width={g.w} height="1.8" fill="#39414c" />
      {/* Heat spreader */}
      <rect
        x={g.x + inset}
        y={g.y + inset}
        width={g.w - inset * 2}
        height={g.h - inset * 2}
        rx="1.5"
        fill={METAL}
      />
      <rect
        x={g.x + inset}
        y={g.y + inset}
        width={g.w - inset * 2}
        height="2"
        fill="#dfe5ea"
      />
      <rect
        x={g.x + inset}
        y={g.y + g.h - inset - 2}
        width={g.w - inset * 2}
        height="2"
        fill={METAL_DARK}
      />
      {/* Etched marking */}
      <rect
        x={g.x + g.w * 0.3}
        y={g.y + g.h * 0.42}
        width={g.w * 0.4}
        height={g.h * 0.16}
        rx="0.8"
        fill={METAL_DARK}
        opacity="0.55"
      />
      {!soldered && (
        // Retention arms: the ILM that has to be lifted before the chip moves.
        <g stroke="#8e979f" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d={`M${g.x + 2} ${g.y + g.h * 0.25} H${g.x + g.w - 2}`} />
          <path d={`M${g.x + 2} ${g.y + g.h * 0.75} H${g.x + g.w - 2}`} />
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
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="#22262e" />
      <rect x={g.x} y={g.y} width={g.w} height="1.6" fill="#333a44" />
      <circle cx={cx} cy={cy} r={r} fill="#14181e" />
      <g fill="#3a424d">
        {Array.from({ length: blades }, (_, i) => {
          const a = (i / blades) * Math.PI * 2;
          const a2 = a + 0.5;
          return (
            <path
              key={i}
              d={`M${cx} ${cy} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(a2) * r} ${cy + Math.sin(a2) * r} Z`}
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={r * 0.3} fill="#525b67" />
      <circle cx={cx} cy={cy} r={r * 0.3} fill="none" stroke="#6c7681" strokeWidth="0.6" />
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
          <rect x={cx - 1.6} y={cy - 5} width="3.2" height="10" rx="1.2" fill="#e2e6ea" />
          <rect x={cx - 1.6} y={cy - 5} width="3.2" height="3" rx="1.2" fill="#fdfefe" />
          <rect x={cx - 2.6} y={cy + 2.4} width="5.2" height="2.6" rx="1" fill="#b6bdc5" />
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
          <rect x={cx - 6} y={cy} width="12" height="3.4" rx="1" fill="#8b6a3a" />
          <rect x={cx - 6} y={cy} width="12" height="1.2" rx="0.6" fill="#b08a52" />
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
          <rect x={cx - 1.6} y={cy - 1.6} width="12" height="3.2" rx="1.4" fill="#cfd5db" />
          <rect x={cx - 1.6} y={cy - 1.6} width="12" height="1.2" rx="0.6" fill="#eef1f4" />
          <circle cx={cx} cy={cy} r="2.2" fill="#8d959d" />
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
          <circle cx={cx} cy={cy} r="3.6" fill={METAL} />
          <circle cx={cx} cy={cy} r="3.6" fill="none" stroke={METAL_DARK} strokeWidth="0.7" />
          <rect x={cx - 2.4} y={cy - 0.55} width="4.8" height="1.1" rx="0.4" fill="#5c646d" />
          <rect x={cx - 0.55} y={cy - 2.4} width="1.1" height="4.8" rx="0.4" fill="#5c646d" />
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
    return (
      <g opacity={connected ? 0.95 : 0.6}>
        <path d={d} stroke={stroke} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d={d} stroke="#00000055" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray="1.5 3" />
        <path d={d} stroke="#ffffff22" strokeWidth="1.4" fill="none" />
      </g>
    );
  }
  return (
    <g opacity={connected ? 1 : 0.65}>
      <path d={d} stroke="#00000066" strokeWidth="4.6" fill="none" strokeLinecap="round" />
      <path d={d} stroke={stroke} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d={d} stroke="#ffffff33" strokeWidth="0.9" fill="none" />
      {!connected && <circle cx={end.x} cy={end.y} r="2.6" fill={stroke} />}
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
