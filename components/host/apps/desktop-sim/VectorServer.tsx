"use client";

/**
 * Server component sheet — 2U rack, lid off, front at the left
 * ============================================================
 * A server does not look like a big desktop, and the differences are the
 * whole lesson:
 *
 *   - TWO sockets with memory banks FLANKING them. A bank belongs to its
 *     socket, so the layout has to make "which CPU owns this DIMM" visible.
 *   - PASSIVE heatsinks. There is no fan on a 2U sink; a wall of chassis fans
 *     pushes air through it front to back, which is why the fin channels all
 *     run the same way and why the baffle matters.
 *   - Redundant CRPS supplies with handles and latches, because they are meant
 *     to be pulled out by hand while the machine keeps running.
 *   - Drive caddies with a latch and activity LEDs — the one thing here you
 *     are supposed to change on a live machine.
 *
 * Every part draws inside 100 x artHeight so one uniform scale places it.
 */

import { SERVER } from "@/lib/desktop-sim/chassis";
import { PAL, Ring, type VectorProps } from "./VectorShared";

/** Server tones: less colour than a consumer board, more bare metal. */
const SRV = {
  board: "#1d5230",
  boardDark: "#153d24",
  trace: "#15412681",
  alu: "#b9c0c6",
  aluDark: "#8e979e",
  aluEdge: "#6f787f",
  steel: "#7e878f",
  steelDark: "#5b636a",
  latch: "#3f4750",
  led: "#5ad06a",
  ledAmber: "#e0a53f",
  duct: "#20252b",
  ductFace: "#2c333a",
  socketGold: "#c9a23f",
} as const;

/**
 * System board — dual-socket EEB, drawn at 100 x 92.4.
 *
 * Sockets, memory banks and the riser slot all come from the chassis, the same
 * table the drop zones derive from.
 */
export function VectorServerBoard({ highlighted }: VectorProps) {
  const H = SERVER.boardArtH;
  const slot = (id: string) => SERVER.slots.find((s) => s.id === id);
  const sockets = [slot("sock-a"), slot("sock-b")];
  const dimms = [slot("rd-1"), slot("rd-2"), slot("rd-3"), slot("rd-4")];
  const riser = slot("riser-slot");

  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.5" fill={SRV.board} />
      <g stroke={SRV.trace} strokeWidth="0.4" fill="none">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M4 ${8 + i * 6} L96 ${8 + i * 6}`} />
        ))}
        <path d="M50 6 L50 88" />
      </g>

      {/* Sockets: rectangular LGA with a gold contact field and two levers */}
      {sockets.map((s) =>
        s ? (
          <g key={s.id}>
            <rect x={s.x - 1.5} y={s.y - 1.5} width={s.w + 3} height={s.h + 3} rx="1" fill={SRV.steelDark} />
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="0.6" fill={SRV.steel} />
            <rect x={s.x + 2} y={s.y + 2} width={s.w - 4} height={s.h - 4} rx="0.4" fill={SRV.socketGold} opacity="0.28" />
            <g fill={SRV.steelDark} opacity="0.65">
              {Array.from({ length: 100 }, (_, i) => (
                <circle
                  key={i}
                  cx={s.x + 3 + (i % 10) * ((s.w - 6) / 9)}
                  cy={s.y + 3 + Math.floor(i / 10) * ((s.h - 6) / 9)}
                  r="0.3"
                />
              ))}
            </g>
            {/* Two retention levers — a server socket has one at each side */}
            <rect x={s.x - 2.4} y={s.y + 1} width="1.6" height={s.h - 2} rx="0.7" fill={SRV.aluDark} />
            <rect x={s.x + s.w + 0.8} y={s.y + 1} width="1.6" height={s.h - 2} rx="0.7" fill={SRV.aluDark} />
          </g>
        ) : null,
      )}

      {/* Memory banks. Alternating latch colours mark channel pairs. */}
      {dimms.map((d, i) =>
        d ? (
          <g key={d.id}>
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="0.4" fill={PAL.ink} opacity="0.75" />
            <rect x={d.x} y={d.y} width={d.w} height="2" rx="0.4" fill={i % 2 ? PAL.slotWhite : SRV.socketGold} />
            <rect x={d.x} y={d.y + d.h - 2} width={d.w} height="2" rx="0.4" fill={i % 2 ? PAL.slotWhite : SRV.socketGold} />
          </g>
        ) : null,
      )}

      {/* VRM banks above each socket — a server has a lot of them */}
      {[16, 48].map((x, b) =>
        Array.from({ length: 8 }, (_, i) => (
          <rect key={`${b}-${i}`} x={x + i * 3.4} y="14" width="2.6" height="6" rx="0.4" fill={PAL.ink} />
        )),
      )}

      {/* Chipset under a low heatsink */}
      <rect x="44" y="62" width="14" height="12" rx="0.8" fill={SRV.aluDark} />
      <g stroke={SRV.alu} strokeWidth="0.8">
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1={45.5 + i * 2.2} y1="63" x2={45.5 + i * 2.2} y2="73" />
        ))}
      </g>

      {/* Riser slot */}
      {riser && (
        <g>
          <rect x={riser.x} y={riser.y} width={riser.w} height={riser.h} rx="0.5" fill={PAL.ink} opacity="0.8" />
          <rect x={riser.x} y={riser.y} width={riser.w} height="1.6" rx="0.5" fill={PAL.slotWhite} opacity="0.6" />
        </g>
      )}

      {/* Backplane header, front edge */}
      <rect x="4" y="84" width="20" height="5" rx="0.6" fill={PAL.connCream} />
      <g fill={SRV.steelDark} opacity="0.6">
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={5 + i * 1.6} y="85" width="0.9" height="3" rx="0.2" />
        ))}
      </g>

      {highlighted && <Ring x={-1} y={-1} w={102} h={H + 2} r={2} />}
    </g>
  );
}

/** Server CPU — 56 x 46mm. Rectangular, not the square a desktop LGA is. */
export function VectorServerCpu({ highlighted }: VectorProps) {
  const H = (46 / 56) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="2" fill={SRV.steelDark} />
      {/* Integrated heat spreader */}
      <rect x="6" y="7" width="88" height={H - 14} rx="1.5" fill={SRV.alu} />
      <rect x="6" y="7" width="88" height="7" rx="1.5" fill="#cfd5da" />
      {/* Laser-etched part line */}
      <rect x="20" y={H / 2 - 4} width="60" height="2.4" rx="1" fill={SRV.aluDark} opacity="0.7" />
      <rect x="28" y={H / 2 + 1} width="44" height="1.8" rx="0.9" fill={SRV.aluDark} opacity="0.5" />
      {/* Substrate edge and the pin-1 chamfer */}
      <path d={`M0 8 L8 0 L0 0 Z`} fill={SRV.socketGold} />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={3} />}
    </g>
  );
}

/**
 * 2U passive heatsink — 80 x 80mm.
 *
 * No fan. The fins all run front-to-back because the chassis wall of fans
 * blows straight through them, which is also why a missing baffle costs you
 * the airflow rather than merely looking untidy.
 */
export function VectorServerHeatsink({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" rx="2" fill={SRV.aluEdge} />
      <rect x="2" y="2" width="96" height="96" rx="1.5" fill={SRV.aluDark} />
      {/* Fin stack — dense, all one direction */}
      <g stroke={SRV.alu} strokeWidth="2.1">
        {Array.from({ length: 22 }, (_, i) => (
          <line key={i} x1={5 + i * 4.3} y1="5" x2={5 + i * 4.3} y2="95" />
        ))}
      </g>
      {/* Base plate visible through the middle channel */}
      <rect x="0" y="44" width="100" height="12" fill={SRV.aluEdge} opacity="0.55" />
      {/* Four captive screws on their springs */}
      {[[6, 6], [94, 6], [6, 94], [94, 94]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="6" fill={SRV.steelDark} />
          <circle cx={cx} cy={cy} r="3.4" fill={SRV.steel} />
          <rect x={cx - 2.6} y={cy - 0.7} width="5.2" height="1.4" rx="0.6" fill={SRV.steelDark} />
        </g>
      ))}
      {highlighted && <Ring x={-2} y={-2} w={104} h={104} r={3} />}
    </g>
  );
}

/**
 * Registered DIMM — 133 x 31mm.
 *
 * Same length as a desktop module, but the register chip in the middle of the
 * board and the extra rank of packages are what make it registered — and what
 * make it refuse to work in the desktop board next to it on the bench.
 */
export function VectorRdimm({ highlighted }: VectorProps) {
  const H = (31 / 133) * 100;
  return (
    <g>
      <rect x="0" y="1" width="100" height={H - 1} rx="1" fill={SRV.board} />
      {/* Nine packages a side, the ECC rank included */}
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <rect x={2.5 + i * 10.8} y="4" width="8.6" height="10" rx="0.6" fill={PAL.ink} />
          <rect x={2.5 + i * 10.8} y="4" width="8.6" height="2.6" rx="0.6" fill={PAL.inkSoft} />
        </g>
      ))}
      {/* The register, dead centre — the identifying feature */}
      <rect x="43" y="15" width="14" height="4.6" rx="0.5" fill={SRV.socketGold} />
      {/* Gold fingers and the key notch */}
      <rect x="1" y={H - 3.4} width="98" height="3.4" fill={PAL.gold} />
      <rect x="44" y={H - 3.4} width="2" height="3.4" fill={SRV.board} />
      <g fill={PAL.goldDark} opacity="0.5">
        {Array.from({ length: 42 }, (_, i) => (
          <rect key={i} x={2 + i * 2.3} y={H - 3.4} width="1" height="3.4" />
        ))}
      </g>
      {highlighted && <Ring x={-2} y={-1} w={104} h={H + 3} r={2} />}
    </g>
  );
}

/** A seated RDIMM, seen from above: the crown between two closed latches. */
export function VectorRdimmSeated({ highlighted }: VectorProps) {
  return (
    <g>
      <rect x="0" y="0.6" width="4" height="10" rx="1" fill={PAL.slotWhite} />
      <rect x="96" y="0.6" width="4" height="10" rx="1" fill={PAL.slotWhite} />
      <rect x="4" y="1.4" width="92" height="8.4" rx="0.8" fill={SRV.board} />
      <rect x="5" y="2.2" width="90" height="5.4" rx="0.6" fill={PAL.ink} />
      {Array.from({ length: 18 }, (_, i) => (
        <rect key={i} x={7 + i * 4.9} y="2.8" width="2.6" height="4.2" rx="0.3" fill={PAL.inkSoft} opacity="0.8" />
      ))}
      <rect x="44" y="2.4" width="9" height="5" rx="0.5" fill={SRV.socketGold} opacity="0.9" />
      {highlighted && <Ring x={-1.5} y={-1} w={103} h={13} r={1.5} />}
    </g>
  );
}

/**
 * CRPS power supply — 120 x 76mm.
 *
 * Drawn as the module you actually hold: a handle, a release latch, a status
 * LED and a fan grille. It is meant to look pullable, because on this machine
 * it is.
 */
export function VectorServerPsu({ highlighted }: VectorProps) {
  const H = (76 / 120) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.5" fill={SRV.steelDark} />
      <rect x="1.5" y="1.5" width="97" height={H - 3} rx="1" fill={SRV.steel} />
      {/* Fan grille — the exhaust end */}
      <circle cx="34" cy={H / 2} r="22" fill={SRV.latch} />
      <circle cx="34" cy={H / 2} r="19" fill={PAL.ink} />
      <g stroke={SRV.steel} strokeWidth="1.2" opacity="0.75" fill="none">
        {Array.from({ length: 5 }, (_, i) => (
          <circle key={i} cx="34" cy={H / 2} r={4 + i * 3.6} />
        ))}
      </g>
      {/* Handle */}
      <rect x="64" y={H / 2 - 13} width="8" height="26" rx="2.5" fill={SRV.latch} />
      <rect x="66" y={H / 2 - 10} width="4" height="20" rx="2" fill={SRV.steelDark} />
      {/* Release latch, brightly coloured because it is meant to be found */}
      <rect x="76" y={H / 2 - 5} width="14" height="10" rx="1.5" fill={SRV.ledAmber} />
      {/* Status LED and IEC inlet */}
      <circle cx="93" cy="9" r="3" fill={SRV.led} />
      <rect x="84" y={H - 18} width="13" height="12" rx="1" fill={PAL.ink} />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={2.5} />}
    </g>
  );
}

/**
 * Hot-swap drive caddy — 120 x 80mm.
 *
 * The latch arm, the two LEDs and the vented face are what say "pull me while
 * it runs". Nothing else on this machine gets to look like that.
 */
export function VectorDriveCaddy({ highlighted }: VectorProps) {
  const H = (80 / 120) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="1.5" fill={SRV.steelDark} />
      <rect x="1.5" y="1.5" width="97" height={H - 3} rx="1" fill={SRV.steel} />
      {/* Vent slots across the face */}
      <g fill={SRV.latch} opacity="0.85">
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x="22" y={7 + i * 7} width="54" height="3.6" rx="1.8" />
        ))}
      </g>
      {/* Latch arm down the left edge, with its release button */}
      <rect x="4" y="4" width="12" height={H - 8} rx="2" fill={SRV.latch} />
      <rect x="6.5" y="9" width="7" height={H - 18} rx="1.5" fill={SRV.steelDark} />
      <rect x="5.5" y={H - 13} width="9" height="8" rx="1.5" fill={SRV.ledAmber} />
      {/* Activity and status LEDs */}
      <circle cx="90" cy="12" r="3.4" fill={SRV.led} />
      <circle cx="90" cy="24" r="3.4" fill={SRV.ledAmber} opacity="0.55" />
      {/* Drive label */}
      <rect x="24" y={H - 15} width="40" height="8" rx="1" fill={PAL.paper} opacity="0.75" />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={2.5} />}
    </g>
  );
}

/**
 * Air baffle — 290 x 150mm.
 *
 * Moulded plastic ducting with cut-outs over each heatsink. Drawn
 * semi-transparent so the parts it covers stay readable underneath: on the
 * bench you need to see that it is ON, not lose the machine behind it.
 */
export function VectorAirBaffle({ highlighted }: VectorProps) {
  const H = (150 / 290) * 100;
  return (
    <g opacity="0.82">
      <rect x="0" y="0" width="100" height={H} rx="2" fill={SRV.duct} opacity="0.55" />
      <rect x="2" y="2" width="96" height={H - 4} rx="1.5" fill={SRV.ductFace} opacity="0.5" />
      {/* Two chimneys over the heatsinks */}
      {[18, 56].map((x, i) => (
        <g key={i}>
          <rect x={x} y="8" width="26" height={H - 16} rx="2" fill="none" stroke={SRV.duct} strokeWidth="2" />
          <rect x={x + 3} y="11" width="20" height={H - 22} rx="1.5" fill={PAL.ink} opacity="0.18" />
        </g>
      ))}
      {/* Moulding ribs */}
      <g stroke={SRV.duct} strokeWidth="1" opacity="0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1="4" y1={6 + i * 8} x2="14" y2={6 + i * 8} />
        ))}
      </g>
      {/* Finger tabs — where you actually lift it */}
      <rect x="44" y="1" width="12" height="4" rx="1.5" fill={SRV.steelDark} />
      <rect x="44" y={H - 5} width="12" height="4" rx="1.5" fill={SRV.steelDark} />
      {highlighted && <Ring x={-2} y={-2} w={104} h={H + 4} r={3} />}
    </g>
  );
}

/** PCIe riser — 152 x 20mm. A card edge that turns the slot on its side. */
export function VectorRiser({ highlighted }: VectorProps) {
  const H = (20 / 152) * 100;
  return (
    <g>
      <rect x="0" y="0" width="100" height={H} rx="0.8" fill={SRV.board} />
      {/* Two slots facing up, where the cards go */}
      {[10, 54].map((x, i) => (
        <g key={i}>
          <rect x={x} y="1.5" width="36" height="3.4" rx="0.6" fill={PAL.ink} />
          <rect x={x} y="1.5" width="36" height="1.2" rx="0.6" fill={PAL.slotWhite} opacity="0.55" />
        </g>
      ))}
      {/* Bracket rail */}
      <rect x="0" y={H - 2.4} width="100" height="2.4" fill={SRV.aluDark} />
      {/* The edge connector that plugs into the board */}
      <rect x="26" y={H - 4.6} width="46" height="2.4" fill={PAL.gold} />
      {highlighted && <Ring x={-1.5} y={-1.5} w={103} h={H + 3} r={1.5} />}
    </g>
  );
}

export const SERVER_VECTOR = {
  srvboard: VectorServerBoard,
  cpuA: VectorServerCpu,
  cpuB: VectorServerCpu,
  hsA: VectorServerHeatsink,
  hsB: VectorServerHeatsink,
  rdimm1: VectorRdimm,
  rdimm2: VectorRdimm,
  rdimm3: VectorRdimm,
  rdimm4: VectorRdimm,
  psuA: VectorServerPsu,
  psuB: VectorServerPsu,
  bayA: VectorDriveCaddy,
  bayB: VectorDriveCaddy,
  baffle: VectorAirBaffle,
  riser: VectorRiser,
} as const;

export const SERVER_SEAT_VECTOR = {
  rdimm1: VectorRdimmSeated,
  rdimm2: VectorRdimmSeated,
  rdimm3: VectorRdimmSeated,
  rdimm4: VectorRdimmSeated,
} as const;
