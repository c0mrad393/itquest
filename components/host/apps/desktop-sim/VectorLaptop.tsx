"use client";

/**
 * Laptop component sheet — the underside, base cover off
 * ======================================================
 * A notebook is not a small desktop and must not draw like one. What a
 * technician actually sees with the base off is: a battery that takes up half
 * the shell, a mainboard crammed along the hinge edge, memory lying FLAT in
 * hinged slots rather than standing, and two M.2 cards of visibly different
 * lengths.
 *
 * Those differences are the teaching, so they are drawn rather than implied:
 *
 *   - The SO-DIMM is shorter than a DIMM and has its notch off-centre, which
 *     is the physical reason you cannot put desktop memory in a laptop.
 *   - The 2280 and the 2230 are drawn at their true relative lengths. Putting
 *     a WLAN card in an NVMe bay is a real service mistake, and it is only
 *     obvious when the two are the sizes they really are.
 *   - The fan is CENTRIFUGAL: a spiral housing with one offset outlet, not the
 *     axial fan a tower uses. Air comes in flat and leaves sideways, which is
 *     why the exhaust is at the hinge.
 *
 * Every part draws inside 100 x artHeight so one uniform scale places it.
 */

import { LAPTOP } from "@/lib/desktop-sim/chassis";
import { PAL, Ring, type VectorProps } from "./VectorShared";

/** Laptop-specific tones. Darker boards and more bare metal than a tower. */
const LAP = {
  board: "#1f5c33",
  boardDark: "#17462790",
  shield: "#9aa4ad",
  shieldDark: "#77828c",
  copper: "#c47b3f",
  copperDark: "#a3632f",
  cell: "#2b3138",
  cellFace: "#3a424b",
  cellSeam: "#4c555f",
  label: "#d8dde2",
  ribbon: "#c9a23f",
  ribbonDark: "#a8832c",
  antennaW: "#e8ecef",
  antennaB: "#2a2f34",
} as const;

/**
 * Mainboard — a strip along the hinge, drawn at 100 x 27.9.
 *
 * Slots come from the chassis, the same table the drop zones derive from, so a
 * bay cannot be painted anywhere other than where its card lands.
 */
export function VectorLapBoard({ highlighted }: VectorProps) {
  const H = LAPTOP.boardArtH;
  const slot = (id: string) => LAPTOP.slots.find((s) => s.id === id);
  const soA = slot("so-a");
  const soB = slot("so-b");
  const wlan = slot("m2-wlan");
  const nvme = slot("m2-nvme");

  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.2" fill={LAP.board} />
      {/* Ground pours and trace bundles — dense, the way a laptop board is. */}
      <g stroke={LAP.boardDark} strokeWidth="0.35" fill="none" opacity="0.9">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${8 + i * 10} 2 L${8 + i * 10} ${H - 2}`} />
        ))}
        <path d={`M2 ${H / 2} L98 ${H / 2}`} />
      </g>

      {/* Soldered-down CPU under its shield can, left of centre */}
      <rect x="41" y="7" width="16" height="13" rx="0.8" fill={LAP.shieldDark} />
      <rect x="42" y="8" width="14" height="11" rx="0.6" fill={LAP.shield} />
      <g stroke={LAP.shieldDark} strokeWidth="0.4">
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1="43" y1={9.6 + i * 2} x2="55" y2={9.6 + i * 2} />
        ))}
      </g>

      {/* SO-DIMM slots — hinged, so they are drawn as open trays, not columns */}
      {[soA, soB].map((d, i) =>
        d ? (
          <g key={d.id}>
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="0.6" fill={PAL.ink} opacity="0.55" />
            {/* Retention arms down each long side — the clips that snap over */}
            <rect x={d.x} y={d.y} width={d.w} height="1.1" rx="0.5" fill={LAP.shield} />
            <rect x={d.x} y={d.y + d.h - 1.1} width={d.w} height="1.1" rx="0.5" fill={LAP.shield} />
            <rect x={d.x - 0.9} y={d.y + 1.4} width="1.4" height={d.h - 2.8} rx="0.6" fill={LAP.shieldDark} />
            <rect x={d.x + d.w - 0.5} y={d.y + 1.4} width="1.4" height={d.h - 2.8} rx="0.6" fill={LAP.shieldDark} />
            {/* Contact comb along the seating edge */}
            <g fill={PAL.gold} opacity={i ? 0.5 : 0.65}>
              {Array.from({ length: 26 }, (_, k) => (
                <rect key={k} x={d.x + 1 + k * ((d.w - 2) / 26)} y={d.y + d.h - 2.2} width="0.4" height="1.1" />
              ))}
            </g>
          </g>
        ) : null,
      )}

      {/* M.2 bays. Two lengths, drawn at the lengths they actually are. */}
      {[wlan, nvme].map((m) =>
        m ? (
          <g key={m.id}>
            <rect x={m.x} y={m.y} width={m.w} height={m.h} rx="0.4" fill={PAL.ink} opacity="0.4" />
            {/* Socket at the near end, standoff post at the far end */}
            <rect x={m.x} y={m.y} width="1.6" height={m.h} rx="0.5" fill={PAL.ink} />
            <g fill={PAL.gold} opacity="0.7">
              {Array.from({ length: 9 }, (_, k) => (
                <rect key={k} x={m.x + 0.3} y={m.y + 0.7 + k * ((m.h - 1.4) / 9)} width="1" height="0.35" />
              ))}
            </g>
            <circle cx={m.x + m.w - 0.8} cy={m.y + m.h / 2} r="0.8" fill={LAP.shieldDark} />
          </g>
        ) : null,
      )}

      {/* Battery connector — the plug you pull FIRST, so it is unmissable */}
      <rect x="60" y={H - 6.5} width="9" height="4" rx="0.7" fill={LAP.ribbon} />
      <g fill={LAP.ribbonDark}>
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={60.8 + i * 1.4} y={H - 6} width="0.7" height="3" rx="0.2" />
        ))}
      </g>

      {/* Keyboard and trackpad ZIF ribbons along the front edge */}
      {[14, 26].map((x, i) => (
        <g key={i}>
          <rect x={x} y={H - 4.2} width="8" height="2.6" rx="0.4" fill={PAL.paper} opacity="0.85" />
          <rect x={x} y={H - 4.2} width="8" height="0.8" rx="0.4" fill={LAP.shieldDark} />
        </g>
      ))}

      {/* Coin cell for the RTC */}
      <circle cx="90" cy={H / 2} r="3.2" fill={LAP.shield} />
      <circle cx="90" cy={H / 2} r="2.2" fill={LAP.shieldDark} />

      {highlighted && <Ring x={-1} y={-1} w={102} h={H + 2} r={2} />}
    </g>
  );
}

/**
 * Battery — 268 x 100mm, drawn at 100 x 37.3.
 *
 * Four pouch cells in a moulded frame with the connector on a short pigtail.
 * The cells are drawn as separate blocks because that is what makes a swollen
 * battery recognisable, and swelling is the single most common reason one of
 * these gets replaced.
 */
export function VectorBattery({ highlighted }: VectorProps) {
  const H = (100 / 268) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="2" fill={LAP.cell} />
      <rect x="1.2" y="1.2" width="97.6" height={H - 2.4} rx="1.4" fill={LAP.cellFace} />
      {/* Four pouch cells, seams between them */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={3 + i * 23.6} y="4" width="21.6" height={H - 8} rx="1" fill={LAP.cell} />
          <rect x={3 + i * 23.6} y="4" width="21.6" height="2.6" rx="1" fill={LAP.cellSeam} />
        </g>
      ))}
      {/* Capacity label */}
      <rect x="30" y={H / 2 - 4} width="40" height="8" rx="1" fill={LAP.label} opacity="0.9" />
      <g fill={LAP.cell} opacity="0.75">
        <rect x="33" y={H / 2 - 2.2} width="20" height="1.5" rx="0.6" />
        <rect x="33" y={H / 2 + 0.4} width="13" height="1.2" rx="0.5" />
      </g>
      {/* Pigtail and connector, top-right */}
      <path
        d={`M88 3 C94 3, 96 -1, 99 -1`}
        stroke={LAP.ribbon}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="93" y="-3.4" width="7" height="3.4" rx="0.6" fill={LAP.ribbon} />
      {highlighted && <Ring x={-1.5} y={-4.5} w={103} h={H + 6} r={2.5} />}
    </g>
  );
}

/**
 * SO-DIMM — 67.6 x 30mm, drawn at 100 x 44.4.
 *
 * Half the length of a desktop DIMM and with the key notch well off centre.
 * Bare packages, no heat spreader: a laptop module has nowhere to put one.
 */
export function VectorSoDimm({ highlighted }: VectorProps) {
  const H = (30 / 67.6) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.5" fill={PAL.pcbGreen} />
      <rect x="0" y="0" width="100" height={H} rx="1.5" fill={PAL.pcbGreenDark} opacity="0.22" />
      {/* Two rows of DRAM packages */}
      {[0, 1].map((r) =>
        Array.from({ length: 4 }, (_, i) => (
          <g key={`${r}-${i}`}>
            <rect x={7 + i * 22} y={6 + r * 16} width="17" height="11" rx="0.8" fill={PAL.ink} />
            <rect x={7 + i * 22} y={6 + r * 16} width="17" height="3" rx="0.8" fill={PAL.inkSoft} />
          </g>
        )),
      )}
      {/* SPD chip */}
      <rect x="86" y="18" width="8" height="6" rx="0.6" fill={PAL.inkSoft} />
      {/* Gold fingers along the seating edge, with the OFF-CENTRE key notch */}
      <rect x="2" y={H - 5} width="96" height="5" fill={PAL.gold} />
      <rect x="36" y={H - 5} width="2.6" height="5" fill={PAL.pcbGreen} />
      <g fill={PAL.goldDark} opacity="0.5">
        {Array.from({ length: 44 }, (_, i) => (
          <rect key={i} x={3 + i * 2.15} y={H - 5} width="0.9" height="5" />
        ))}
      </g>
      {/* Side notches the retention clips drop into */}
      <circle cx="1.5" cy={H / 2} r="2" fill={PAL.surface} opacity="0.9" />
      <circle cx="98.5" cy={H / 2} r="2" fill={PAL.surface} opacity="0.9" />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={2} />}
    </g>
  );
}

/** M.2 2280 NVMe — 80 x 22mm. Controller, DRAM and two NAND packages. */
export function VectorNvme({ highlighted }: VectorProps) {
  const H = (22 / 80) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.2" fill={PAL.pcbGreen} />
      <rect x="9" y="4" width="18" height="19" rx="1" fill={PAL.ink} />
      <rect x="9" y="4" width="18" height="5" rx="1" fill={PAL.inkSoft} />
      <rect x="31" y="6" width="12" height="15" rx="0.8" fill={PAL.inkSoft} />
      {[47, 71].map((x, i) => (
        <g key={i}>
          <rect x={x} y="4" width="22" height="19" rx="1" fill={PAL.ink} />
          <rect x={x} y="4" width="22" height="5" rx="1" fill={PAL.inkSoft} />
        </g>
      ))}
      {/* Edge connector with the M-key notch */}
      <rect x="0" y="5" width="5" height={H - 10} fill={PAL.gold} />
      <rect x="0" y="14.5" width="5" height="2" fill={PAL.pcbGreen} />
      {/* Mounting half-moon at the far end */}
      <circle cx="98" cy={H / 2} r="2.6" fill={PAL.surface} opacity="0.85" />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={2} />}
    </g>
  );
}

/**
 * M.2 2230 WLAN — 30 x 22mm, so the artboard is nearly square.
 *
 * Two u.FL antenna sockets with their pigtails are the giveaway: a storage
 * card has none, and that is how you tell the two bays apart at a glance.
 */
export function VectorWlan({ highlighted }: VectorProps) {
  const H = (22 / 30) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="2.5" fill={PAL.pcbGreen} />
      {/* Shield can over the radio */}
      <rect x="20" y="10" width="58" height="42" rx="2" fill={LAP.shield} />
      <rect x="20" y="10" width="58" height="10" rx="2" fill={LAP.shieldDark} />
      <g stroke={LAP.shieldDark} strokeWidth="1" opacity="0.7">
        {Array.from({ length: 4 }, (_, i) => (
          <line key={i} x1="24" y1={26 + i * 6} x2="74" y2={26 + i * 6} />
        ))}
      </g>
      {/* u.FL sockets and pigtails — white main, black aux */}
      <circle cx="30" cy="62" r="6" fill={LAP.shieldDark} />
      <circle cx="30" cy="62" r="2.6" fill={PAL.ink} />
      <circle cx="68" cy="62" r="6" fill={LAP.shieldDark} />
      <circle cx="68" cy="62" r="2.6" fill={PAL.ink} />
      <path d="M30 62 C14 62, 8 74, -6 74" stroke={LAP.antennaW} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M68 62 C84 62, 92 74, 106 74" stroke={LAP.antennaB} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Edge connector, A/E key */}
      <rect x="8" y="0" width={84} height="6" fill={PAL.gold} />
      <rect x="40" y="0" width="4" height="6" fill={PAL.pcbGreen} />
      <circle cx="50" cy={H - 5} r="4" fill={PAL.surface} opacity="0.85" />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={3} />}
    </g>
  );
}

/**
 * Blower fan — 60 x 60mm, centrifugal.
 *
 * Drawn as a volute: a spiral housing that widens toward one offset outlet.
 * That is the whole difference from a tower's axial fan, and it is why the
 * exhaust vent on a notebook is at the side rather than the top.
 */
export function VectorBlower({ highlighted }: VectorProps) {
  const blades = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2;
    const r0 = 17;
    const r1 = 36;
    // Backward-curved: the tip trails the root, which is what a blower uses.
    const skew = 0.42;
    return `M${50 + Math.cos(a) * r0} ${46 + Math.sin(a) * r0} Q${50 + Math.cos(a + skew / 2) * ((r0 + r1) / 2)} ${
      46 + Math.sin(a + skew / 2) * ((r0 + r1) / 2)
    }, ${50 + Math.cos(a + skew) * r1} ${46 + Math.sin(a + skew) * r1}`;
  });
  return (
    <g>
      {/* Volute: round over the impeller, drawn out to the outlet at the right */}
      <path
        d="M50 4 A42 42 0 1 1 49.6 4 Z M92 34 L100 34 L100 58 L88 58"
        fill={LAP.shieldDark}
      />
      <circle cx="50" cy="46" r="42" fill={LAP.shieldDark} />
      <rect x="86" y="32" width="14" height="26" rx="1.5" fill={LAP.shieldDark} />
      <circle cx="50" cy="46" r="39" fill={PAL.ink} />
      <g stroke={LAP.shield} strokeWidth="1.6" fill="none" opacity="0.85" strokeLinecap="round">
        {blades.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* Hub and motor */}
      <circle cx="50" cy="46" r="16" fill={LAP.shield} />
      <circle cx="50" cy="46" r="10" fill={LAP.shieldDark} />
      <circle cx="50" cy="46" r="3" fill={PAL.ink} />
      {/* Outlet mouth, where the heatpipe fin stack sits */}
      <rect x="88" y="34" width="12" height="22" rx="1" fill={PAL.ink} />
      <g stroke={LAP.copper} strokeWidth="1.1">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="89" y1={35.5 + i * 2.6} x2="99" y2={35.5 + i * 2.6} />
        ))}
      </g>
      {/* Fan header pigtail */}
      <path d="M18 78 C10 84, 6 92, -2 92" stroke={PAL.steelDark} strokeWidth="3" fill="none" strokeLinecap="round" />
      {highlighted && <Ring x={-2} y={-2} w={104} h={104} r={4} />}
    </g>
  );
}

/**
 * Heatpipe — 120 x 12mm.
 *
 * Flattened copper with a fin stack at the exhaust end. Flat, not round: a
 * notebook has no vertical room, and flattening a pipe is exactly the
 * compromise that makes a thin laptop possible.
 */
export function VectorHeatpipe({ highlighted }: VectorProps) {
  const H = (12 / 120) * 100;
  return (
    <g>
      {/* Cold plate over the CPU, left end */}
      <rect x="0" y="0" width="17" height={H} rx="1" fill={LAP.copperDark} />
      <rect x="1" y="1" width="15" height={H - 2} rx="0.8" fill={LAP.copper} />
      {/* The pipe itself */}
      <rect x="15" y={H * 0.28} width="60" height={H * 0.44} rx={H * 0.22} fill={LAP.copper} />
      <rect x="15" y={H * 0.28} width="60" height={H * 0.16} rx={H * 0.08} fill="#d9964f" opacity="0.8" />
      {/* Fin stack at the outlet */}
      <rect x="74" y="0" width="26" height={H} rx="0.6" fill={LAP.copperDark} opacity="0.45" />
      <g stroke={LAP.copper} strokeWidth="0.7">
        {Array.from({ length: 17 }, (_, i) => (
          <line key={i} x1={75 + i * 1.5} y1="0.6" x2={75 + i * 1.5} y2={H - 0.6} />
        ))}
      </g>
      {highlighted && <Ring x={-1.5} y={-1.5} w={103} h={H + 3} r={1.5} />}
    </g>
  );
}

export const LAPTOP_VECTOR = {
  lapboard: VectorLapBoard,
  battery: VectorBattery,
  sodimm1: VectorSoDimm,
  sodimm2: VectorSoDimm,
  nvme: VectorNvme,
  wlan: VectorWlan,
  blower: VectorBlower,
  heatpipe: VectorHeatpipe,
} as const;
