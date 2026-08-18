"use client";

/**
 * Flat-vector part illustrations
 * ==============================
 * Drawn to match the reference: a warm blush desk, saturated-but-soft flat
 * fills, and detail carried by SHAPE rather than by gradient.
 *
 * ── WHY THESE ARE FLATTER THAN THE OLD SET ──────────────────────────────────
 *
 * The previous library leaned on metallic gradients and drop shadows for
 * depth. The reference does almost none of that: a PCB is two greens, a fan is
 * flat grey blades on a darker disc, and what makes it read as premium is the
 * DENSITY of small components — capacitors, chips, port blocks — not lighting.
 * So these compositions spend their complexity on part count, and keep at most
 * two tonal steps per surface.
 *
 * Every component takes the same props, so the view can render any part
 * without knowing which one it is.
 */

export interface VectorProps {
  /** Drawn dimmer and without its highlight when still on the desk. */
  installed?: boolean;
  /** Snap candidate — the reference has no glow, so this is a warm outline. */
  highlighted?: boolean;
}

/* The reference palette, sampled. Named by role so a re-skin is one block. */
export const PAL = {
  desk: "#f6e7e1",
  deskEdge: "#e9d5cd",
  case: "#3b444d",
  caseDark: "#2c343b",
  caseLight: "#59636d",
  pcb: "#3f9c63",
  pcbDark: "#2f7a4c",
  pcbDeep: "#24603c",
  gold: "#e0b64a",
  metal: "#c2c9cf",
  metalDark: "#8d959d",
  slotBlack: "#23282e",
  copper: "#e07b45",
  red: "#d94f5c",
  blue: "#2f6fb5",
  cream: "#efe3d4",
  ink: "#2b3138",
} as const;

const GOLD = "#e0b64a";

/** Small helper: a scatter of surface-mount components on a board. */
function SmdField({
  x, y, w, h, seed = 1,
}: { x: number; y: number; w: number; h: number; seed?: number }) {
  // Deterministic pseudo-scatter: the board must look the same every render.
  const items = Array.from({ length: 22 }, (_, i) => {
    const r = ((i * 9301 + seed * 49297) % 233280) / 233280;
    const r2 = ((i * 4021 + seed * 21601) % 233280) / 233280;
    return {
      x: x + r * (w - 3),
      y: y + r2 * (h - 3),
      w: 1.2 + ((i + seed) % 3) * 0.9,
      h: 1 + ((i + seed) % 2) * 0.8,
      dark: (i + seed) % 3 === 0,
    };
  });
  return (
    <g>
      {items.map((it, i) => (
        <rect
          key={i}
          x={it.x} y={it.y} width={it.w} height={it.h} rx="0.3"
          fill={it.dark ? PAL.ink : PAL.pcbDeep}
          opacity={it.dark ? 0.85 : 0.6}
        />
      ))}
    </g>
  );
}

/** Electrolytic capacitors — the giveaway detail on any real board render. */
function Caps({ pts }: { pts: [number, number][] }) {
  return (
    <g>
      {pts.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="2.1" fill={PAL.metalDark} />
          <circle cx={cx} cy={cy} r="1.7" fill={PAL.metal} />
          <path d={`M${cx - 1.2} ${cy} h2.4`} stroke={PAL.metalDark} strokeWidth="0.5" />
        </g>
      ))}
    </g>
  );
}

/**
 * The motherboard.
 *
 * Drawn at 100x100 in its own space and scaled by the caller, so the slot
 * positions here stay stable no matter how large it renders.
 */
export function VectorMotherboard({ installed, highlighted }: VectorProps) {
  return (
    <g opacity={installed === false ? 0.96 : 1}>
      <rect x="0" y="0" width="100" height="100" rx="2" fill={PAL.pcb} />
      <rect x="0" y="0" width="100" height="100" rx="2" fill="none" stroke={PAL.pcbDeep} strokeWidth="1.6" />

      {/* Rear I/O block, top-left — colourful ports, as the reference has. */}
      <rect x="3" y="4" width="16" height="30" rx="1.5" fill={PAL.caseDark} />
      {[
        [PAL.blue, 6], [PAL.blue, 12], ["#7b52a8", 18], [PAL.cream, 24],
      ].map(([c, y], i) => (
        <rect key={i} x="5" y={Number(y)} width="12" height="4" rx="0.8" fill={String(c)} />
      ))}

      {/* CPU socket — the square with the retention frame. */}
      <rect x="33" y="36" width="24" height="24" rx="1.5" fill={PAL.pcbDeep} />
      <rect x="35" y="38" width="20" height="20" rx="1" fill={PAL.metal} />
      <rect x="37.5" y="40.5" width="15" height="15" rx="0.8" fill={PAL.metalDark} opacity="0.45" />

      {/* DIMM slots — black with a gold key line, vertical, right of socket. */}
      {[64, 69, 74, 79].map((x, i) => (
        <g key={i}>
          <rect x={x} y="20" width="3.4" height="46" rx="0.8" fill={PAL.slotBlack} />
          <rect x={x + 0.7} y="22" width="2" height="42" rx="0.4" fill={GOLD} opacity="0.5" />
        </g>
      ))}

      {/* PCIe slots along the lower half — long black, one short. */}
      {[
        { y: 70, w: 52 }, { y: 78, w: 30 }, { y: 86, w: 52 },
      ].map((s, i) => (
        <g key={i}>
          <rect x="10" y={s.y} width={s.w} height="4" rx="0.8" fill={PAL.slotBlack} />
          <rect x="11" y={s.y + 1} width={s.w - 2} height="2" rx="0.4" fill={GOLD} opacity="0.55" />
        </g>
      ))}

      {/* 24-pin and 8-pin power headers. */}
      <rect x="88" y="24" width="8" height="20" rx="1" fill={PAL.cream} />
      <rect x="60" y="4" width="14" height="7" rx="1" fill={PAL.cream} />

      {/* SATA ports — the red block every board has. */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="88" y={62 + i * 6} width="8" height="4" rx="0.8" fill={PAL.red} />
      ))}

      {/* Chipset heatsink and VRM block. */}
      <rect x="62" y="72" width="16" height="16" rx="1.5" fill={PAL.metal} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={63 + i * 2.2} y="73" width="1.2" height="14" rx="0.4" fill={PAL.metalDark} opacity="0.7" />
      ))}
      <rect x="26" y="8" width="24" height="9" rx="1.5" fill={PAL.metal} />

      <Caps pts={[[24, 30], [24, 38], [28, 46], [62, 30], [62, 40], [22, 60], [58, 66]]} />
      <SmdField x={20} y={20} w={14} h={46} seed={2} />
      <SmdField x={20} y={66} w={40} h={28} seed={5} />

      {/* Mounting holes. */}
      {[[6, 40], [6, 92], [58, 6], [94, 8], [94, 94], [58, 94]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.8" fill={PAL.cream} />
      ))}

      {highlighted && (
        <rect x="-2" y="-2" width="104" height="104" rx="3" fill="none" stroke={PAL.copper} strokeWidth="2.5" strokeDasharray="6 4" />
      )}
    </g>
  );
}

/** CPU: green substrate, silver IHS, gold corner triangle. */
export function VectorCpu({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" rx="6" fill={PAL.pcb} />
      <rect x="0" y="0" width="100" height="100" rx="6" fill="none" stroke={PAL.pcbDeep} strokeWidth="2" />
      {/* Contact pads around the rim */}
      {Array.from({ length: 11 }, (_, i) => (
        <g key={i}>
          <rect x={8 + i * 8} y="4" width="4" height="4" rx="1" fill={GOLD} />
          <rect x={8 + i * 8} y="92" width="4" height="4" rx="1" fill={GOLD} />
          <rect x="4" y={8 + i * 8} width="4" height="4" rx="1" fill={GOLD} />
          <rect x="92" y={8 + i * 8} width="4" height="4" rx="1" fill={GOLD} />
        </g>
      ))}
      {/* Heat spreader */}
      <rect x="18" y="18" width="64" height="64" rx="4" fill={PAL.metal} />
      <rect x="24" y="24" width="52" height="52" rx="3" fill={PAL.metalDark} opacity="0.35" />
      <text x="50" y="56" textAnchor="middle" fontSize="16" fill={PAL.metalDark} className="select-none font-semibold">
        CPU
      </text>
      {/* Pin-1 triangle */}
      <path d="M10 10 L22 10 L10 22 Z" fill={GOLD} />
      {highlighted && (
        <rect x="-3" y="-3" width="106" height="106" rx="8" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** A DIMM: green PCB, black chips, gold fingers, notch. */
export function VectorRam({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="0" y="26" width="100" height="48" rx="2" fill={PAL.pcb} />
      <rect x="0" y="26" width="100" height="48" rx="2" fill="none" stroke={PAL.pcbDeep} strokeWidth="1.4" />
      {/* Heat spreader band across the top half */}
      <rect x="3" y="30" width="94" height="18" rx="1.5" fill={PAL.pcbDark} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={6 + i * 11.4} y="50" width="9" height="12" rx="1" fill={PAL.ink} />
      ))}
      {/* Gold fingers with the key notch */}
      <rect x="2" y="66" width="96" height="7" fill={GOLD} />
      <rect x="38" y="66" width="4" height="7" fill={PAL.pcb} />
      {Array.from({ length: 30 }, (_, i) => (
        <rect key={i} x={3 + i * 3.2} y="66" width="1.2" height="7" fill={PAL.pcbDeep} opacity="0.35" />
      ))}
      {highlighted && (
        <rect x="-3" y="23" width="106" height="54" rx="4" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** The dual-fan GPU from the reference: shroud, two fans, backplate, bracket. */
export function VectorGpu({ highlighted }: VectorProps) {
  return (
    <g>
      {/* PCB tail and bracket */}
      <rect x="0" y="18" width="100" height="60" rx="2" fill={PAL.pcb} />
      <rect x="0" y="18" width="100" height="60" rx="2" fill="none" stroke={PAL.pcbDeep} strokeWidth="1.4" />
      {/* Shroud */}
      <rect x="22" y="20" width="76" height="52" rx="3" fill={PAL.pcbDark} />
      {/* Copper heat pipes crossing the shroud */}
      {[30, 36, 42].map((y, i) => (
        <rect key={i} x="24" y={y} width="72" height="3" rx="1.5" fill={PAL.copper} opacity="0.9" />
      ))}
      {/* Dual fans */}
      {[44, 76].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="46" r="18" fill={PAL.ink} />
          <circle cx={cx} cy="46" r="16" fill={PAL.caseDark} />
          {Array.from({ length: 9 }, (_, b) => {
            const a = (b / 9) * Math.PI * 2;
            const a2 = a + 0.55;
            return (
              <path
                key={b}
                d={`M${cx} ${46} L${cx + Math.cos(a) * 15} ${46 + Math.sin(a) * 15} A15 15 0 0 1 ${cx + Math.cos(a2) * 15} ${46 + Math.sin(a2) * 15} Z`}
                fill={PAL.caseLight}
                opacity={0.55 + (b % 3) * 0.14}
              />
            );
          })}
          <circle cx={cx} cy="46" r="5" fill={PAL.metalDark} />
        </g>
      ))}
      {/* Gold edge connector and the notch */}
      <rect x="30" y="74" width="46" height="5" fill={GOLD} />
      <rect x="44" y="74" width="3" height="5" fill={PAL.pcb} />
      {/* Rear bracket */}
      <rect x="0" y="14" width="6" height="68" rx="1" fill={PAL.metal} />
      {/* 8-pin power socket, top edge */}
      <rect x="82" y="14" width="14" height="6" rx="1" fill={PAL.cream} />
      {highlighted && (
        <rect x="-4" y="10" width="108" height="74" rx="4" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** Top-flow cooler: radial aluminium fins under a circular fan. */
export function VectorCooler({ highlighted }: VectorProps) {
  const cx = 50;
  const cy = 50;
  return (
    <g>
      {/* Fin stack — radial spokes, copper-tinted at the rim like the reference */}
      {Array.from({ length: 56 }, (_, i) => {
        const a = (i / 56) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * 22}
            y1={cy + Math.sin(a) * 22}
            x2={cx + Math.cos(a) * 48}
            y2={cy + Math.sin(a) * 48}
            stroke={i % 4 === 0 ? PAL.copper : PAL.metal}
            strokeWidth="2.4"
            opacity={i % 4 === 0 ? 0.9 : 0.75}
          />
        );
      })}
      <circle cx={cx} cy={cy} r="24" fill={PAL.caseDark} />
      {/* Fan blades */}
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const a2 = a + 0.6;
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${cx + Math.cos(a) * 22} ${cy + Math.sin(a) * 22} A22 22 0 0 1 ${cx + Math.cos(a2) * 22} ${cy + Math.sin(a2) * 22} Z`}
            fill={PAL.caseLight}
            opacity={0.5 + (i % 3) * 0.16}
          />
        );
      })}
      <circle cx={cx} cy={cy} r="8" fill={PAL.metalDark} />
      {/* Retention arms */}
      {[0, Math.PI].map((a, i) => (
        <path
          key={i}
          d={`M${cx + Math.cos(a) * 30} ${cy + Math.sin(a) * 30} a7 7 0 1 0 0.1 0`}
          fill="none"
          stroke={PAL.copper}
          strokeWidth="3"
        />
      ))}
      {highlighted && (
        <circle cx={cx} cy={cy} r="51" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** M.2 SSD: blue PCB, chips, label. */
export function VectorSsd({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="0" y="38" width="100" height="24" rx="2" fill={PAL.blue} />
      <rect x="0" y="38" width="100" height="24" rx="2" fill="none" stroke="#1d4d84" strokeWidth="1.4" />
      {[14, 38, 62].map((x, i) => (
        <rect key={i} x={x} y="43" width="18" height="14" rx="1" fill="#17406f" />
      ))}
      <rect x="4" y="43" width="8" height="14" rx="1" fill={PAL.cream} opacity="0.85" />
      {/* Gold edge connector with the M-key notch */}
      <rect x="88" y="42" width="10" height="16" fill={GOLD} />
      <rect x="88" y="49" width="10" height="2" fill={PAL.blue} />
      {highlighted && (
        <rect x="-3" y="35" width="106" height="30" rx="4" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** Thermal paste syringe. */
export function VectorPaste({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="18" y="42" width="58" height="16" rx="8" fill={PAL.cream} />
      <rect x="18" y="42" width="58" height="16" rx="8" fill="none" stroke={PAL.metalDark} strokeWidth="1.2" />
      <rect x="30" y="45" width="34" height="10" rx="5" fill={PAL.metalDark} opacity="0.35" />
      <rect x="76" y="46" width="10" height="8" rx="2" fill={PAL.metalDark} />
      <path d="M86 48 L96 50 L86 52 Z" fill={PAL.metal} />
      <rect x="8" y="44" width="10" height="12" rx="3" fill={PAL.metal} />
      {highlighted && (
        <rect x="4" y="38" width="96" height="24" rx="6" fill="none" stroke={PAL.copper} strokeWidth="3" strokeDasharray="7 5" />
      )}
    </g>
  );
}

/** Loose screws, scattered top-left as in the reference. */
export function VectorScrews() {
  const one = (cx: number, cy: number, rot: number) => (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect x={cx - 2} y={cy} width="4" height="14" rx="1.6" fill={PAL.metalDark} />
      <ellipse cx={cx} cy={cy} rx="7" ry="4.6" fill={PAL.metal} />
      <ellipse cx={cx} cy={cy} rx="7" ry="4.6" fill="none" stroke={PAL.metalDark} strokeWidth="0.8" />
      <rect x={cx - 4} y={cy - 0.7} width="8" height="1.4" rx="0.5" fill={PAL.metalDark} />
    </g>
  );
  return (
    <g className="pointer-events-none">
      {one(24, 20, -28)}
      {one(48, 14, 18)}
      {one(38, 40, 62)}
    </g>
  );
}

/** Maps a part id to its illustration, so the view stays generic. */
export const PART_VECTOR: Record<string, (p: VectorProps) => React.ReactElement> = {
  mobo: VectorMotherboard,
  cpu: VectorCpu,
  paste: VectorPaste,
  cooler: VectorCooler,
  ram1: VectorRam,
  ram2: VectorRam,
  ssd: VectorSsd,
  gpu: VectorGpu,
};
