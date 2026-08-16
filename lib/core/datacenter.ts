/**
 * ITQuest — The Datacenter Floor (v0.4.0)
 * ========================================
 * THE GRAND UNIFICATION. Before this module the estate was two disconnected
 * worlds: `infra.nodes` held logical servers (IP, OS, health) and `infra.rack`
 * held physical boxes (U-space, watts, cabling), and nothing joined them. A
 * player could overheat a rack without any logical server noticing, or upgrade
 * a chassis and see no change anywhere.
 *
 * THE JOIN IS A SINGLE FIELD: `RackDevice.nodeId`. A racked chassis bound to a
 * node IS that server. There is exactly one copy of every fact:
 *
 *   physical truth   RackDevice   — U position, fitted hardware, power, heat
 *   logical truth    TargetNode   — IP, OS, health, workloads
 *
 * Everything else in this file DERIVES from those two, which is what makes the
 * sync bi-directional without any sync code:
 *
 *   fit a DIMM in the rack   -> `serverCapacity` reports more RAM
 *                               -> Server Manager can commit more workloads
 *   commit a database        -> `liveDeviceWatts` reports more draw
 *                               -> the rack runs hotter and closer to its PDU
 *
 * A mirrored copy updated by an event handler would drift the first time an
 * edge case was missed. A derivation cannot drift.
 *
 * All functions here are PURE. The UI and the ticket win-conditions call the
 * same ones, so what the operator reads is exactly what is graded.
 */

import type {
  RackCable,
  RackDevice,
  RackNodeMap,
  RackState,
  ServerHardware,
} from "./rack";
import { RACK_SIZE_U, deviceOnline, isPowered, rackPower, rackThermal } from "./rack";
import type { NodeId, NodeRole, Workload } from "./nodes";

// ── The floor ───────────────────────────────────────────────────────────────

/** What a rack is FOR. Drives the seed layout and the floor plan labels. */
export type RackRole = "compute" | "storage" | "network";

export const RACK_ROLE_LABEL: Record<RackRole, string> = {
  compute: "Compute",
  storage: "Storage",
  network: "Network",
};

export interface DatacenterState {
  /** Ordered left-to-right as they stand on the floor. */
  racks: RackState[];
}

export function rackById(dc: DatacenterState, id: string): RackState | undefined {
  return dc.racks.find((r) => r.id === id);
}

/** The rack a device lives in, searched across the whole floor. */
export function rackOfDevice(dc: DatacenterState, deviceId: string): RackState | undefined {
  return dc.racks.find((r) => r.devices.some((d) => d.id === deviceId));
}

/** The rack and chassis a logical node is physically installed in. */
export function locationOf(
  dc: DatacenterState,
  nodeId: NodeId,
): { rack: RackState; device: RackDevice } | undefined {
  for (const rack of dc.racks) {
    const device = rack.devices.find((d) => d.nodeId === nodeId);
    if (device) return { rack, device };
  }
  return undefined;
}

/** Human location string, e.g. "Rack 01 · U12". Empty when unracked. */
export function locationLabel(dc: DatacenterState, nodeId: NodeId): string {
  const at = locationOf(dc, nodeId);
  return at ? `${at.rack.name} · U${at.device.uStart}` : "";
}

/** Contiguous free U runs, largest first — drives the "where does it fit" hint. */
export function freeSpaceU(rack: RackState): number {
  const occupied = new Set<number>();
  for (const d of rack.devices) {
    for (let u = d.uStart; u < d.uStart + d.uSize; u++) occupied.add(u);
  }
  return rack.sizeU - occupied.size;
}

// ── Top-of-Rack networking ──────────────────────────────────────────────────
//
// A rack without a ToR switch is a cupboard. Nothing in it can reach the
// network no matter how well it is powered, which is why the uplink is a
// deliberate, visible step rather than something mounting implies.

/** The switch acting as this rack's ToR, if one is mounted. */
export function torSwitch(rack: RackState): RackDevice | undefined {
  return rack.devices.find((d) => d.kind === "switch");
}

/** The uplink cable joining a device to its rack's ToR switch, if patched. */
export function uplinkCable(rack: RackState, deviceId: string): RackCable | undefined {
  const tor = torSwitch(rack);
  if (!tor) return undefined;
  return rack.cables.find(
    (c) =>
      c.kind === "patch" &&
      ((c.fromDeviceId === deviceId && c.toDeviceId === tor.id) ||
        (c.toDeviceId === deviceId && c.fromDeviceId === tor.id)),
  );
}

export function isUplinked(rack: RackState, deviceId: string): boolean {
  return !!uplinkCable(rack, deviceId);
}

/** A switch's DATA ports. The `psu` inlet is not somewhere you patch a host. */
function dataPorts(device: RackDevice): string[] {
  return device.ports.filter((p) => p !== "psu");
}

/** ToR ports with nothing patched into them. */
export function freeTorPorts(rack: RackState): string[] {
  const tor = torSwitch(rack);
  if (!tor) return [];
  const used = new Set(
    rack.cables
      .filter((c) => c.kind === "patch")
      .flatMap((c) => [
        c.fromDeviceId === tor.id ? c.fromPort : null,
        c.toDeviceId === tor.id ? c.toPort : null,
      ])
      .filter((p): p is string => !!p),
  );
  return dataPorts(tor).filter((p) => !used.has(p));
}

/** Why this chassis cannot be brought onto the network — or null if it can. */
export function uplinkBlocker(rack: RackState, deviceId: string): string | null {
  const device = rack.devices.find((d) => d.id === deviceId);
  if (!device) return "That chassis is not in this rack.";
  if (device.kind !== "server") return "Only servers take a ToR uplink.";
  if (isUplinked(rack, deviceId)) return "Already uplinked.";
  if (!torSwitch(rack)) return `${rack.name} has no top-of-rack switch. Mount one first.`;
  if (freeTorPorts(rack).length === 0) return "Every port on the ToR switch is patched. Free one, or fit a bigger switch.";
  return null;
}

// ── Capacity: the physical layer answering a logical question ───────────────

/** Baseline hardware for a chassis class, before any upgrade is fitted. */
export const BASE_HARDWARE: Record<string, ServerHardware> = {
  "sku-srv-1u": { cpuCores: 8, ramGb: 32, ramType: "DDR4", storageGb: 960, dimmSlots: 8, dimmsUsed: 2 },
  "sku-srv-2u": { cpuCores: 24, ramGb: 128, ramType: "DDR5", storageGb: 8192, dimmSlots: 16, dimmsUsed: 4 },
};

export function baseHardwareFor(assetItemId: string): ServerHardware {
  const base = BASE_HARDWARE[assetItemId] ?? BASE_HARDWARE["sku-srv-1u"];
  return { ...base };
}

export interface ServerCapacity {
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  /** Total CPU budget as a percentage: 8 cores = 800%. */
  cpuPctTotal: number;
}

export function serverCapacity(device: RackDevice): ServerCapacity {
  const hw = device.hardware ?? baseHardwareFor(device.assetItemId);
  return {
    cpuCores: hw.cpuCores,
    ramGb: hw.ramGb,
    storageGb: hw.storageGb,
    cpuPctTotal: hw.cpuCores * 100,
  };
}

export interface WorkloadDemand {
  cpuPct: number;
  ramGb: number;
  count: number;
}

export function workloadDemand(workloads: Workload[]): WorkloadDemand {
  return {
    cpuPct: workloads.reduce((t, w) => t + w.cpuPct, 0),
    ramGb: workloads.reduce((t, w) => t + w.ramGb, 0),
    count: workloads.length,
  };
}

export interface ServerUtilisation {
  cpuPct: number;
  memPct: number;
  /** True when committed workloads exceed what the chassis can actually serve. */
  oversubscribed: boolean;
}

/**
 * How hard the fitted hardware is being worked. Over 100% is legal and is
 * exactly the state a capacity ticket asks the operator to fix — either by
 * migrating something off, or by fitting more memory.
 */
export function serverUtilisation(device: RackDevice, workloads: Workload[]): ServerUtilisation {
  const cap = serverCapacity(device);
  const demand = workloadDemand(workloads);
  const cpuPct = Math.round((demand.cpuPct / Math.max(1, cap.cpuPctTotal)) * 100);
  const memPct = Math.round((demand.ramGb / Math.max(1, cap.ramGb)) * 100);
  return { cpuPct, memPct, oversubscribed: cpuPct > 100 || memPct > 100 };
}

/** Headroom left on a chassis, in the units a migration is measured in. */
export function serverHeadroom(device: RackDevice, workloads: Workload[]) {
  const cap = serverCapacity(device);
  const demand = workloadDemand(workloads);
  return {
    cpuPct: Math.max(0, cap.cpuPctTotal - demand.cpuPct),
    ramGb: Math.max(0, cap.ramGb - demand.ramGb),
  };
}

// ── Liveness: the physical layer has the final word ─────────────────────────

export interface ServerLiveness {
  /** Actually serving traffic right now. */
  live: boolean;
  /** Why not, in the operator's words. Null when it is live. */
  reason: string | null;
}

/**
 * Whether a server is really up.
 *
 * `connection.online` is the operator's INTENT — they have not powered it off.
 * The rack has the final word: an open breaker or a thermal shutdown takes the
 * whole cabinet down regardless, and an unpatched chassis serves nobody. The
 * Server Manager must report the same truth as the Datacenter Floor, or the
 * two views have quietly come apart again.
 */
export function serverLiveness(
  rack: RackState,
  device: RackDevice,
  node: { connection: { online: boolean } },
  nodes?: RackNodeMap,
): ServerLiveness {
  if (!node.connection.online) return { live: false, reason: "powered down" };
  if (rack.breakerTripped) return { live: false, reason: `${rack.name} breaker open` };
  if (rackThermal(rack, nodes).state === "critical") return { live: false, reason: `${rack.name} thermal shutdown` };
  if (!isPowered(rack, device.id)) return { live: false, reason: "no power lead" };
  if (!isUplinked(rack, device.id)) return { live: false, reason: "no uplink" };
  return { live: true, reason: null };
}

// ── Live migration ──────────────────────────────────────────────────────────

/**
 * Why these workloads cannot move onto this target — or null if they can.
 *
 * Ordered so the message names the FIRST real obstacle rather than listing
 * every one; an operator mid-change-window wants one thing to go and fix.
 */
export function migrationBlocker(
  target: { device: RackDevice; rack: RackState; workloads: Workload[]; online: boolean; inMaintenance: boolean },
  incoming: Workload[],
  nodes?: RackNodeMap,
): string | null {
  if (!target.online) return "The target host is powered down.";
  if (target.inMaintenance) return "The target host is itself in maintenance.";
  if (!isUplinked(target.rack, target.device.id)) return "The target host has no ToR uplink.";
  if (!deviceOnline(target.rack, target.device.id, nodes)) {
    return target.rack.breakerTripped
      ? `${target.rack.name} has an open breaker.`
      : `${target.rack.name} is in thermal shutdown.`;
  }
  const headroom = serverHeadroom(target.device, target.workloads);
  const need = workloadDemand(incoming);
  if (need.ramGb > headroom.ramGb) {
    return `Needs ${need.ramGb} GB; the target has ${headroom.ramGb} GB free. Fit more memory or pick another host.`;
  }
  if (need.cpuPct > headroom.cpuPct) {
    return `Needs ${Math.round(need.cpuPct)}% CPU; the target has ${Math.round(headroom.cpuPct)}% free.`;
  }
  return null;
}

/**
 * Is it safe to cut power to this node?
 *
 * The whole point of the maintenance loop: a drained host in a declared change
 * window is safe, and anything else is an unplanned outage the SLA engine will
 * bill the operator for.
 */
export function isDrained(workloads: Workload[]): boolean {
  return workloads.length === 0;
}

export function shutdownBlocker(node: {
  workloads: Workload[];
  maintenance?: { mode: boolean };
}): string | null {
  if (!node.maintenance?.mode) return "Put the host into Maintenance Mode first — this is a change, not an accident.";
  if (!isDrained(node.workloads)) {
    return `${node.workloads.length} live workload${node.workloads.length === 1 ? "" : "s"} still on this host. Migrate them before cutting power.`;
  }
  return null;
}

// ── Roles that live in a rack at all ────────────────────────────────────────

/**
 * Endpoints do not get racked. A rack full of staff laptops would be absurd,
 * and the fleet runs to hundreds of machines — the floor would be unreadable.
 */
export const RACKABLE_ROLES: NodeRole[] = [
  "web-server",
  "app-server",
  "database",
  "load-balancer",
  "domain-controller",
  "file-server",
  "hypervisor",
];

export function isRackable(role: NodeRole): boolean {
  return RACKABLE_ROLES.includes(role);
}

/** Which rack a role belongs in on a sensibly-planned floor. */
export function preferredRackRole(role: NodeRole): RackRole {
  if (role === "database" || role === "file-server") return "storage";
  if (role === "load-balancer" || role === "router" || role === "firewall") return "network";
  return "compute";
}

// ── Floor-wide rollups ──────────────────────────────────────────────────────

export interface FloorSummary {
  rackCount: number;
  serverCount: number;
  /** Racked servers with no ToR uplink — each one is an incident waiting. */
  unlinkedCount: number;
  drawWatts: number;
  capacityWatts: number;
  hottestC: number;
  breakersOpen: number;
}

export function floorSummary(dc: DatacenterState, nodes?: RackNodeMap): FloorSummary {
  let serverCount = 0;
  let unlinkedCount = 0;
  let drawWatts = 0;
  let capacityWatts = 0;
  let hottestC = 0;
  let breakersOpen = 0;

  for (const rack of dc.racks) {
    const power = rackPower(rack, nodes);
    drawWatts += power.drawWatts;
    capacityWatts += power.pdu.maxWatts;
    hottestC = Math.max(hottestC, rackThermal(rack, nodes).tempC);
    if (rack.breakerTripped) breakersOpen++;
    for (const d of rack.devices) {
      if (d.kind !== "server") continue;
      serverCount++;
      if (!isUplinked(rack, d.id)) unlinkedCount++;
    }
  }
  return {
    rackCount: dc.racks.length,
    serverCount,
    unlinkedCount,
    drawWatts,
    capacityWatts,
    hottestC: Math.round(hottestC * 10) / 10,
    breakersOpen,
  };
}

/** A blank rack straight off the loading dock. */
export function emptyRack(id: string, name: string, sizeU = RACK_SIZE_U): RackState {
  return {
    id,
    name,
    sizeU,
    devices: [],
    cables: [],
    tests: [],
    pduId: "pdu-20a",
    breakerTripped: false,
    trippedAt: null,
  };
}

/** Re-exported so callers need only one import for floor work. */
export { isPowered, deviceOnline };
