/**
 * TriageOS — Server rack & network infrastructure models
 * ======================================================
 * The physical layer (what is mounted in which U, what is cabled to what,
 * what is powered) plus the logical layer (switch VLANs / interfaces, server
 * addressing and services). Lives inside InfrastructureState so rack work is
 * persisted and so the TicketReconciler re-evaluates win-conditions whenever
 * the operator racks, cables, powers or configures something.
 */

import type { RackDeviceKind } from "./inventory";

export const RACK_SIZE_U = 24;

// ── Datacentre physics (v0.3.1) ─────────────────────────────────────────────
//
// DESIGN NOTE — why temperature is DERIVED, not ticked.
// A rack's thermal state is a pure function of what is mounted, what is
// powered, and what cooling is fitted. Storing a "current temperature" that
// eases toward a target would mean writing to `infra` every couple of seconds,
// which (a) bloats every autosave and (b) re-runs all 134 win-conditions on a
// timer, since the reconciler subscribes to infra. The same reasoning that put
// Monitor telemetry in a session store keeps thermal maths as a pure
// calculation here: one function, called by the UI and by ticket
// win-conditions, so what the player reads is exactly what is graded.
//
// The one genuinely LATCHED bit of state is the breaker: once it trips it
// stays tripped until the operator resets it, which is how a real breaker
// behaves and gives the overload a consequence that outlives the cause.

/** Power distribution unit feeding the rack. */
export interface PduSpec {
  id: string;
  label: string;
  volts: number;
  amps: number;
  /** Continuous load ceiling. Breakers trip above this. */
  maxWatts: number;
}

export const PDU_SPECS: PduSpec[] = [
  { id: "pdu-20a", label: "Standard 120V / 20A", volts: 120, amps: 20, maxWatts: 2400 },
  { id: "pdu-30a", label: "High-density 208V / 30A", volts: 208, amps: 30, maxWatts: 6240 },
];

export function pduSpec(id: string): PduSpec {
  return PDU_SPECS.find((p) => p.id === id) ?? PDU_SPECS[0];
}

/**
 * Fallback draw per device class, in watts. A device mounted from a SKU whose
 * traits carry `watts` uses that instead — the catalogue is more specific.
 */
export const DEVICE_WATTS: Record<RackDeviceKind, number> = {
  server: 250,
  switch: 180,
  router: 140,
  firewall: 160,
  "patch-panel": 0, // passive
  ups: 0, // feeds the rack, does not draw from it
  pdu: 0,
  "fan-tray": 80,
  crac: 450,
};

/** Cooling delivered by a mounted unit, in degrees C removed. */
export const DEVICE_COOLING_C: Partial<Record<RackDeviceKind, number>> = {
  "fan-tray": 5,
  crac: 18,
};

/** Per-device liquid loop, fitted rather than racked. */
export const LIQUID_COOLING_C = 4;

/** Room supply temperature the rack starts from. */
export const AMBIENT_C = 21;

/**
 * Degrees added per 100W of dissipated heat. Tuned so a 2400W PDU driven to
 * its ceiling with no cooling lands around 47C — i.e. maxing the power budget
 * is by itself a thermal emergency, which is the lesson.
 */
export const RISE_C_PER_100W = 1.1;

export type ThermalState = "optimal" | "warning" | "critical";

export const THERMAL_WARNING_C = 30;
export const THERMAL_CRITICAL_C = 45;

export function thermalState(tempC: number): ThermalState {
  if (tempC >= THERMAL_CRITICAL_C) return "critical";
  if (tempC >= THERMAL_WARNING_C) return "warning";
  return "optimal";
}

export const THERMAL_LABEL: Record<ThermalState, string> = {
  optimal: "OPTIMAL",
  warning: "WARNING",
  critical: "CRITICAL",
};

// ── Logical configuration ────────────────────────────────────────────────────

export interface SwitchInterface {
  /** Cisco-style name, e.g. "gi0/1". */
  name: string;
  /** Access VLAN, or null when the port is still in the default VLAN 1. */
  accessVlan: number | null;
  /** Administratively up (no shutdown). */
  up: boolean;
  description?: string;
}

export interface SwitchConfig {
  hostname: string;
  /** VLAN ids that exist in the VLAN database. */
  vlans: number[];
  interfaces: SwitchInterface[];
}

export interface ServerConfig {
  hostname: string;
  ipv4: string;
  netmask: string;
  gateway: string;
  /** VLAN the server's NIC expects to land in (set by the operator). */
  services: { web: boolean; dns: boolean };
}

// ── Physical layer ───────────────────────────────────────────────────────────

export interface RackDevice {
  id: string;
  kind: RackDeviceKind;
  name: string;
  /** Nameplate draw in watts, from the SKU's traits where available. */
  watts?: number;
  /** A liquid loop has been fitted to this unit (extra local cooling). */
  liquidCooled?: boolean;
  /** Inventory SKU this unit came from (returned to stock when unracked). */
  assetItemId: string;
  /** Topmost U the device occupies (1 = top of the rack). */
  uStart: number;
  uSize: number;
  /** Data ports available for patching. */
  ports: string[];
  switchConfig?: SwitchConfig;
  serverConfig?: ServerConfig;
}

export type CableKind = "patch" | "power";

export interface RackCable {
  id: string;
  kind: CableKind;
  fromDeviceId: string;
  fromPort: string;
  toDeviceId: string;
  toPort: string;
}

export interface NetworkTestResult {
  id: string;
  at: number;
  fromName: string;
  toName: string;
  ok: boolean;
  /** Human-readable reason — shown in the ping tool output. */
  detail: string;
}

export interface RackState {
  sizeU: number;
  devices: RackDevice[];
  cables: RackCable[];
  /** Ping-tool history, newest first. */
  tests: NetworkTestResult[];
  /** Which PDU feeds the rack (sets the power ceiling). */
  pduId: string;
  /**
   * Latched breaker. Trips when draw exceeds the PDU ceiling and STAYS tripped
   * until the operator sheds load and resets it — everything in the rack is
   * dead while it is true.
   */
  breakerTripped: boolean;
  /** When it last tripped, for the incident narrative. */
  trippedAt: number | null;
  /** QA only: `sudo elevate debug` can suspend the physics. */
  overrides?: { unlimitedPower?: boolean; unlimitedCooling?: boolean };
}

// ── Power & thermal (pure — UI and win-conditions call the same functions) ──

/** Watts a single mounted device draws when live. */
export function deviceWatts(d: RackDevice): number {
  return d.watts ?? DEVICE_WATTS[d.kind] ?? 0;
}

export interface RackPower {
  drawWatts: number;
  capacityWatts: number;
  /** 0-100+; over 100 is an overload. */
  loadPct: number;
  overloaded: boolean;
  tripped: boolean;
  pdu: PduSpec;
}

/**
 * Live electrical load. Only POWERED devices draw — an unpatched unit is dead
 * weight in the rack, which is what makes cabling matter beyond connectivity.
 */
export function connectedLoadWatts(rack: RackState): number {
  return rack.devices.reduce((t, d) => t + (isPowered(rack, d.id) ? deviceWatts(d) : 0), 0);
}

export function rackPower(rack: RackState): RackPower {
  const pdu = pduSpec(rack.pduId);
  const capacityWatts = rack.overrides?.unlimitedPower ? Number.MAX_SAFE_INTEGER : pdu.maxWatts;
  const drawWatts = rack.breakerTripped ? 0 : connectedLoadWatts(rack);
  const loadPct = rack.overrides?.unlimitedPower ? 0 : Math.round((drawWatts / pdu.maxWatts) * 100);
  return {
    drawWatts,
    capacityWatts,
    loadPct,
    // Judged on what is CABLED, not on what is flowing: a tripped rack draws
    // nothing, and reading that as "load is fine now" would let the operator
    // reset the breaker straight back into the same overload.
    overloaded: !rack.overrides?.unlimitedPower && connectedLoadWatts(rack) > pdu.maxWatts,
    tripped: rack.breakerTripped,
    pdu,
  };
}

export interface RackThermal {
  tempC: number;
  state: ThermalState;
  /** Degrees of cooling currently installed and powered. */
  coolingC: number;
  /** Degrees added by dissipated heat. */
  riseC: number;
}

/**
 * Steady-state rack temperature.
 *
 * Cooling units are only counted when they are POWERED — a CRAC that nobody
 * cabled cools nothing, and it is the commonest mistake in the rack lab.
 */
export function rackThermal(rack: RackState): RackThermal {
  if (rack.overrides?.unlimitedCooling) {
    return { tempC: AMBIENT_C, state: "optimal", coolingC: 999, riseC: 0 };
  }
  const power = rackPower(rack);
  const riseC = (power.drawWatts / 100) * RISE_C_PER_100W;

  let coolingC = 0;
  for (const d of rack.devices) {
    if (!isPowered(rack, d.id)) continue;
    coolingC += DEVICE_COOLING_C[d.kind] ?? 0;
    if (d.liquidCooled) coolingC += LIQUID_COOLING_C;
  }

  // Cooling cannot drive the rack below the room feeding it.
  const tempC = Math.max(AMBIENT_C - 4, AMBIENT_C + riseC - coolingC);
  return { tempC: Math.round(tempC * 10) / 10, state: thermalState(tempC), coolingC, riseC };
}

/**
 * Per-slot temperature for the heatmap. Heat rises, so upper U run hotter than
 * the bottom of the rack — a small gradient, but it is why operators put the
 * hot boxes low and the fan tray high.
 */
export function slotTempC(rack: RackState, u: number): number {
  const { tempC } = rackThermal(rack);
  // U1 is the TOP of the rack, so height rises as `u` falls. The gradient is
  // centred on the rack mean: +1.75C at the top, -1.75C at the floor.
  const height = (rack.sizeU - u) / Math.max(1, rack.sizeU - 1);
  const gradient = height * 3.5 - 1.75;
  return Math.round((tempC + gradient) * 10) / 10;
}

/** Is a device actually running, given breaker and thermal shutdown? */
export function deviceOnline(rack: RackState, deviceId: string): boolean {
  if (rack.breakerTripped) return false;
  if (rackThermal(rack).state === "critical") return false;
  return isPowered(rack, deviceId);
}

// ── Derived helpers (pure — used by UI *and* ticket win-conditions) ──────────

export function deviceAt(rack: RackState, u: number): RackDevice | undefined {
  return rack.devices.find((d) => u >= d.uStart && u < d.uStart + d.uSize);
}

/** Can `uSize` units be mounted starting at `uStart` without overlapping? */
export function canMount(rack: RackState, uStart: number, uSize: number, ignoreId?: string): boolean {
  if (uStart < 1 || uStart + uSize - 1 > rack.sizeU) return false;
  return !rack.devices.some(
    (d) => d.id !== ignoreId && uStart < d.uStart + d.uSize && d.uStart < uStart + uSize,
  );
}

/** A device is powered when a power cable reaches a UPS or PDU in the rack. */
export function isPowered(rack: RackState, deviceId: string): boolean {
  const dev = rack.devices.find((d) => d.id === deviceId);
  if (!dev) return false;
  // Power distribution units are fed from mains — they are always live.
  if (dev.kind === "ups" || dev.kind === "pdu") return true;
  return rack.cables.some((c) => {
    if (c.kind !== "power") return false;
    const otherId = c.fromDeviceId === deviceId ? c.toDeviceId : c.toDeviceId === deviceId ? c.fromDeviceId : null;
    if (!otherId) return false;
    const other = rack.devices.find((d) => d.id === otherId);
    return !!other && (other.kind === "ups" || other.kind === "pdu");
  });
}

/** The switch port a device's data cable lands on, if patched. */
export function uplinkOf(rack: RackState, deviceId: string): { switchId: string; port: string } | null {
  for (const c of rack.cables) {
    if (c.kind !== "patch") continue;
    const pairs: [string, string, string][] = [
      [c.fromDeviceId, c.toDeviceId, c.toPort],
      [c.toDeviceId, c.fromDeviceId, c.fromPort],
    ];
    for (const [self, other, otherPort] of pairs) {
      if (self !== deviceId) continue;
      const sw = rack.devices.find((d) => d.id === other);
      if (sw && (sw.kind === "switch" || sw.kind === "router")) return { switchId: sw.id, port: otherPort };
    }
  }
  return null;
}

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

export function sameSubnet(ipA: string, ipB: string, mask: string): boolean {
  const a = ipToInt(ipA), b = ipToInt(ipB), m = ipToInt(mask);
  if (a === null || b === null || m === null) return false;
  return ((a & m) >>> 0) === ((b & m) >>> 0);
}

export function isValidIpv4(ip: string): boolean {
  return ipToInt(ip) !== null;
}

/**
 * End-to-end reachability check across the physical + logical layers. This is
 * the single source of truth for the Ping tool AND for network ticket
 * win-conditions, so what the player sees is exactly what is graded.
 */
export function pingCheck(rack: RackState, fromId: string, toId: string): { ok: boolean; detail: string } {
  const a = rack.devices.find((d) => d.id === fromId);
  const b = rack.devices.find((d) => d.id === toId);
  if (!a || !b) return { ok: false, detail: "Device not found in rack." };

  if (!isPowered(rack, a.id)) return { ok: false, detail: `${a.name} has no power — connect it to the UPS/PDU.` };
  if (!isPowered(rack, b.id)) return { ok: false, detail: `${b.name} has no power — connect it to the UPS/PDU.` };

  const ua = uplinkOf(rack, a.id);
  const ub = uplinkOf(rack, b.id);
  if (!ua) return { ok: false, detail: `${a.name} is not patched into a switch.` };
  if (!ub) return { ok: false, detail: `${b.name} is not patched into a switch.` };
  if (ua.switchId !== ub.switchId) return { ok: false, detail: "Hosts are patched into different switches — no uplink between them." };

  const sw = rack.devices.find((d) => d.id === ua.switchId);
  if (!sw || !isPowered(rack, sw.id)) return { ok: false, detail: "The switch has no power." };

  const ia = sw.switchConfig?.interfaces.find((i) => i.name === ua.port);
  const ib = sw.switchConfig?.interfaces.find((i) => i.name === ub.port);
  if (ia && !ia.up) return { ok: false, detail: `${sw.name} ${ua.port} is administratively down (no shutdown required).` };
  if (ib && !ib.up) return { ok: false, detail: `${sw.name} ${ub.port} is administratively down (no shutdown required).` };

  const vA = ia?.accessVlan ?? 1;
  const vB = ib?.accessVlan ?? 1;
  if (vA !== vB) {
    return { ok: false, detail: `VLAN mismatch — ${ua.port} is in VLAN ${vA} but ${ub.port} is in VLAN ${vB}.` };
  }

  const ca = a.serverConfig, cb = b.serverConfig;
  if (!ca || !isValidIpv4(ca.ipv4)) return { ok: false, detail: `${a.name} has no valid IPv4 address configured.` };
  if (!cb || !isValidIpv4(cb.ipv4)) return { ok: false, detail: `${b.name} has no valid IPv4 address configured.` };
  if (!sameSubnet(ca.ipv4, cb.ipv4, ca.netmask || "255.255.255.0")) {
    return { ok: false, detail: `${ca.ipv4} and ${cb.ipv4} are not in the same subnet.` };
  }

  return { ok: true, detail: `Reply from ${cb.ipv4}: bytes=32 time<1ms TTL=128 (VLAN ${vA})` };
}
