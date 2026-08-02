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
