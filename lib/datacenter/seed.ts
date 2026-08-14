/**
 * TriageOS — Datacenter floor seed (v0.4.0)
 * =========================================
 * Builds the physical half of a generated world: three racks on the floor,
 * every infrastructure node bolted into one of them, powered, and patched into
 * its rack's top-of-rack switch.
 *
 * WHY THIS EXISTS. Before v0.4.0 the world generator produced logical servers
 * and the rack was empty, so the estate the player inherited had no physical
 * reality — you could not find `sql-04`, only read about it. Now every server
 * in the Server Manager occupies a real U in a real rack, drawing real watts,
 * and the two views are the same object seen from two sides.
 *
 * WHAT A COMPETENT PREDECESSOR WOULD HAVE LEFT. The seed cools each rack until
 * it is thermally optimal rather than dumping the player into a warning state
 * on turn one. The estate should start sound and get interesting because of
 * what the PLAYER does to it — a permanent nag they did not cause teaches
 * nothing and just trains them to ignore the gauge.
 */

import type {
  DatacenterState,
  NodeRole,
  RackDevice,
  RackNodeMap,
  RackState,
  ServerHardware,
  TargetNode,
  Workload,
  WorkloadKind,
} from "@/lib/core";
import {
  RACK_SIZE_U,
  baseHardwareFor,
  canMount,
  emptyRack,
  freeSpaceU,
  isRackable,
  connectedLoadWatts,
  pduSpec,
  phaseSpec,
  preferredRackRole,
  rackThermal,
  type RackRole,
} from "@/lib/core";
import type { GrowthPhase, LinuxNodeState } from "@/lib/core";
import { createSeedVM } from "@/lib/vm/seed";
import { int, pick, type Rng } from "@/lib/org/rng";

// ── Chassis selection ───────────────────────────────────────────────────────

/**
 * Which chassis a role ships in. Storage and directory roles get the 2U box
 * because that is where the disks and the memory are; front-end roles get the
 * 1U. This is also what makes the Storage Rack the heavy, hot one.
 */
function chassisFor(role: NodeRole): { sku: string; uSize: number } {
  switch (role) {
    case "database":
    case "file-server":
      return { sku: "sku-srv-2u", uSize: 2 };
    default:
      return { sku: "sku-srv-1u", uSize: 1 };
  }
}

function hardwareFor(role: NodeRole, rng: Rng): ServerHardware {
  const hw = baseHardwareFor(chassisFor(role).sku);
  // A little variance so two database boxes are not interchangeable and a
  // capacity ticket can single one out honestly.
  if (role === "database" || role === "file-server") {
    hw.storageGb = int(rng, 4, 16) * 1024;
  }
  return hw;
}

// ── Workloads ───────────────────────────────────────────────────────────────

const ROLE_WORKLOADS: Record<string, { kind: WorkloadKind; name: string; cpuPct: number; ramGb: number }[]> = {
  "web-server": [
    { kind: "web", name: "nginx front-end", cpuPct: 65, ramGb: 4 },
    { kind: "app", name: "orders-api", cpuPct: 120, ramGb: 8 },
  ],
  "app-server": [{ kind: "app", name: "billing-worker", cpuPct: 140, ramGb: 12 }],
  database: [{ kind: "database", name: "PostgreSQL 15 · primary", cpuPct: 420, ramGb: 64 }],
  "file-server": [{ kind: "file", name: "SMB shares", cpuPct: 90, ramGb: 16 }],
  "domain-controller": [{ kind: "directory", name: "Enterprise Directory Services · DS", cpuPct: 110, ramGb: 12 }],
  "load-balancer": [{ kind: "balancer", name: "HAProxy · edge", cpuPct: 80, ramGb: 4 }],
  hypervisor: [{ kind: "app", name: "guest pool", cpuPct: 300, ramGb: 48 }],
};

/** The business services a node of this role runs, bound to its hostname. */
export function workloadsFor(node: TargetNode, rng: Rng): Workload[] {
  const specs = ROLE_WORKLOADS[node.role] ?? [];
  return specs.map((w, i) => ({
    id: `wl-${node.nodeId}-${i + 1}`,
    name: w.name,
    kind: w.kind,
    // +/-15% so no two hosts read identically and headroom maths stays real.
    cpuPct: Math.round(w.cpuPct * (0.85 + rng() * 0.3)),
    ramGb: Math.max(1, Math.round(w.ramGb * (0.85 + rng() * 0.3))),
    homeNodeId: node.nodeId,
  }));
}

// ── Mounting helpers ────────────────────────────────────────────────────────

let seq = 0;
const deviceId = (prefix: string) => `rd-${prefix}-${++seq}`;

function serverPorts(): string[] {
  return ["eth0", "eth1", "psu"];
}

function mount(rack: RackState, device: RackDevice): boolean {
  if (!canMount(rack, device.uStart, device.uSize)) return false;
  rack.devices.push(device);
  return true;
}

/** Lowest U where `uSize` fits, searching from the top down. */
function firstFit(rack: RackState, uSize: number, from = 1): number | null {
  for (let u = from; u + uSize - 1 <= rack.sizeU; u++) {
    if (canMount(rack, u, uSize)) return u;
  }
  return null;
}

function patch(rack: RackState, fromId: string, fromPort: string, toId: string, toPort: string, kind: "patch" | "power") {
  rack.cables.push({ id: `cb-${++seq}`, kind, fromDeviceId: fromId, fromPort, toDeviceId: toId, toPort });
}

/** Next free outlet on the rack PDU, or null when the strip is full. */
function freeOutlet(rack: RackState, pduId: string): string | null {
  const pdu = rack.devices.find((d) => d.id === pduId);
  if (!pdu) return null;
  const used = new Set(rack.cables.filter((c) => c.toDeviceId === pduId).map((c) => c.toPort));
  return pdu.ports.find((p) => !used.has(p)) ?? null;
}

function freeSwitchPort(rack: RackState, torId: string): string | null {
  const tor = rack.devices.find((d) => d.id === torId);
  if (!tor) return null;
  const used = new Set(
    rack.cables
      .filter((c) => c.kind === "patch")
      .flatMap((c) => [c.fromDeviceId === torId ? c.fromPort : null, c.toDeviceId === torId ? c.toPort : null])
      .filter((p): p is string => !!p),
  );
  // Never hand back the power inlet as a data port.
  return tor.ports.find((p) => p !== "psu" && !used.has(p)) ?? null;
}

// ── Rack construction ───────────────────────────────────────────────────────

interface RackPlan {
  id: string;
  name: string;
  role: RackRole;
  pduId: string;
  /** Ports on the ToR switch — the storage rack gets the bigger switch. */
  torPorts: number;
}

/**
 * A rack with its infrastructure already fitted: ToR switch at the top where
 * the patching is, PDU at the bottom where the feed comes in. This is how a
 * rack is actually built, and it means the U-space in the middle — the part
 * the player fights over — is contiguous.
 */
function buildRack(plan: RackPlan): { rack: RackState; torId: string; pduDeviceId: string } {
  const rack = emptyRack(plan.id, plan.name, RACK_SIZE_U);
  rack.pduId = plan.pduId;

  const tor: RackDevice = {
    id: deviceId("tor"),
    kind: "switch",
    name: `${plan.name.replace(/\s+/g, "")}-ToR`,
    assetItemId: plan.torPorts > 8 ? "sku-sw-48p" : "sku-sw-24p",
    watts: plan.torPorts > 8 ? 320 : 180,
    uStart: 1,
    uSize: 1,
    ports: Array.from({ length: plan.torPorts }, (_, i) => `gi0/${i + 1}`).concat("psu"),
    switchConfig: {
      hostname: `${plan.id}-tor`,
      vlans: [1, 10, 20],
      interfaces: Array.from({ length: plan.torPorts }, (_, i) => ({
        name: `gi0/${i + 1}`,
        accessVlan: 10,
        up: true,
      })),
    },
  };
  mount(rack, tor);

  const panel: RackDevice = {
    id: deviceId("pp"),
    kind: "patch-panel",
    name: `${plan.name.replace(/\s+/g, "")}-PP`,
    assetItemId: "sku-patch-24",
    watts: 0,
    uStart: 2,
    uSize: 1,
    ports: Array.from({ length: 8 }, (_, i) => `p${i + 1}`),
  };
  mount(rack, panel);

  const pdu: RackDevice = {
    id: deviceId("pdu"),
    kind: "pdu",
    name: `${plan.name.replace(/\s+/g, "")}-PDU`,
    assetItemId: plan.pduId === "pdu-30a" ? "sku-pdu-30a" : "sku-pdu-1u",
    watts: 0,
    uStart: rack.sizeU,
    uSize: 1,
    ports: Array.from({ length: 8 }, (_, i) => `out${i + 1}`),
  };
  mount(rack, pdu);

  // The ToR is the one thing that must never lose power.
  patch(rack, tor.id, "psu", pdu.id, "out1", "power");

  return { rack, torId: tor.id, pduDeviceId: pdu.id };
}

/**
 * Fit cooling until the rack is thermally optimal.
 *
 * Fan trays first (cheap, 1U, 80W), then a CRAC if the heat needs real
 * capacity. Bounded by U-space and by a hard iteration cap so a pathologically
 * hot plan degrades to "as cool as it can be" rather than looping.
 */
function coolRack(rack: RackState, pduDeviceId: string, nodes: RackNodeMap) {
  for (let guard = 0; guard < 6; guard++) {
    if (rackThermal(rack, nodes).state === "optimal") return;
    // Reach for fan trays first. A CRAC removes 18C but costs 450W to run —
    // roughly two more servers' worth of the power budget — so it is only
    // worth it when trays cannot close the gap.
    const needsBigCooling = rackThermal(rack, nodes).tempC > 40;
    const spec = needsBigCooling
      ? { kind: "crac" as const, sku: "sku-crac-2u", watts: 450, uSize: 2, label: "CRAC" }
      : { kind: "fan-tray" as const, sku: "sku-fan-1u", watts: 80, uSize: 1, label: "FAN" };
    const u = firstFit(rack, spec.uSize, 3);
    const outlet = freeOutlet(rack, pduDeviceId);
    if (u === null || !outlet) return;

    const unit: RackDevice = {
      id: deviceId(spec.kind),
      kind: spec.kind,
      name: `${rack.id.toUpperCase()}-${spec.label}`,
      assetItemId: spec.sku,
      watts: spec.watts,
      uStart: u,
      uSize: spec.uSize,
      ports: ["psu"],
    };
    mount(rack, unit);
    patch(rack, unit.id, "psu", pduDeviceId, outlet, "power");
  }
}

// ── The floor ───────────────────────────────────────────────────────────────

const PLANS: RackPlan[] = [
  { id: "rack-01", name: "Rack 01", role: "compute", pduId: "pdu-20a", torPorts: 8 },
  { id: "rack-02", name: "Rack 02", role: "compute", pduId: "pdu-20a", torPorts: 8 },
  // The storage rack carries the 2U boxes, so it gets the heavy feed and the
  // bigger switch from day one — exactly how a real floor is planned.
  { id: "rack-03", name: "Storage Rack", role: "storage", pduId: "pdu-30a", torPorts: 16 },
];

export const RACK_ROLE_OF: Record<string, RackRole> = {
  "rack-01": "compute",
  "rack-02": "compute",
  "rack-03": "storage",
};

/**
 * Rack every infrastructure node in the world.
 *
 * Mutates `nodes` to attach workloads and maintenance state — the logical half
 * of the same servers — and returns the physical half.
 */
export function buildDatacenter(
  rng: Rng,
  nodes: Record<string, TargetNode>,
  phase: GrowthPhase = 1,
): DatacenterState {
  seq = 0;
  // A startup has ONE rack. The floor grows when the player buys racks to keep
  // up with the milestones — handing them three on day one would give away the
  // whole build-out arc.
  const built = PLANS.slice(0, Math.max(1, phaseSpec(phase).racks)).map((plan) => ({
    plan,
    ...buildRack(plan),
  }));

  // Give every rackable node its workloads first: cooling has to be sized
  // against the heat the workloads actually generate, not the idle chassis.
  const rackable = Object.values(nodes).filter((n) => isRackable(n.role));
  for (const node of Object.values(nodes)) {
    node.workloads = isRackable(node.role) ? workloadsFor(node, rng) : [];
    if (isRackable(node.role)) node.maintenance = { mode: false, drainedAt: null };
  }

  const nodeView: RackNodeMap = nodes as unknown as RackNodeMap;

  for (const node of rackable) {
    const want = preferredRackRole(node.role);
    // Prefer a rack built for this role, then anything with space — a floor
    // that refuses to rack a server because the "right" rack is full would be
    // worse than one that puts it somewhere sensible and tells you.
    //
    // Within each group, BALANCE: take the emptiest rack. Filling rack one to
    // the brim while rack two stands empty is what a lazy loop does, not what
    // a datacenter tech does, and it leaves the first rack a single spin-up
    // away from its breaker while the floor is half used.
    const bySpace = (a: typeof built[number], b: typeof built[number]) =>
      freeSpaceU(b.rack) - freeSpaceU(a.rack);
    const ordered = [
      ...built.filter((b) => b.plan.role === want).sort(bySpace),
      ...built.filter((b) => b.plan.role !== want).sort(bySpace),
    ];
    const chassis = chassisFor(node.role);

    for (const target of ordered) {
      const u = firstFit(target.rack, chassis.uSize, 3);
      const outlet = freeOutlet(target.rack, target.pduDeviceId);
      const port = freeSwitchPort(target.rack, target.torId);
      if (u === null || !outlet || !port) continue;

      const device: RackDevice = {
        id: deviceId("srv"),
        kind: "server",
        name: node.hostname,
        assetItemId: chassis.sku,
        watts: chassis.sku === "sku-srv-2u" ? 750 : 250,
        uStart: u,
        uSize: chassis.uSize,
        ports: serverPorts(),
        nodeId: node.nodeId,
        hardware: hardwareFor(node.role, rng),
        serverConfig: {
          hostname: node.hostname,
          ipv4: node.connection.ip,
          netmask: "255.255.255.0",
          gateway: node.connection.ip.replace(/\.\d+$/, ".1"),
          services: { web: node.role === "web-server", dns: node.role === "domain-controller" },
        },
      };
      mount(target.rack, device);
      patch(target.rack, device.id, "psu", target.pduDeviceId, outlet, "power");
      // The uplink. Without this the box is a space heater.
      patch(target.rack, device.id, "eth0", target.torId, port, "patch");
      break;
    }
  }

  for (const b of built) {
    coolRack(b.rack, b.pduDeviceId, nodeView);
    // A predecessor would not have left a rack sitting over its own breaker.
    // If the plan ended up heavier than the feed can carry, the feed is what
    // was wrong — upsize it rather than handing the player a tripped rack
    // they did nothing to cause.
    if (connectedLoadWatts(b.rack, nodeView) > pduSpec(b.rack.pduId).maxWatts) {
      b.rack.pduId = "pdu-30a";
      const pdu = b.rack.devices.find((d) => d.id === b.pduDeviceId);
      if (pdu) pdu.assetItemId = "sku-pdu-30a";
    }
  }

  return { racks: built.map((b) => b.rack) };
}

/** A blank floor — used by tests and by a reset that has no world yet. */
export function createDatacenter(): DatacenterState {
  return { racks: [emptyRack("rack-01", "Rack 01")] };
}

/** Next free rack id/name when the player buys another one. */
export function nextRackName(dc: DatacenterState): { id: string; name: string } {
  let n = dc.racks.length + 1;
  const taken = new Set(dc.racks.map((r) => r.id));
  while (taken.has(`rack-${String(n).padStart(2, "0")}`)) n++;
  const id = `rack-${String(n).padStart(2, "0")}`;
  return { id, name: `Rack ${String(n).padStart(2, "0")}` };
}

/** Pick a rack at random for ticket prose. */
export function anyRack(dc: DatacenterState, rng: Rng): RackState {
  return pick(rng, dc.racks);
}

// ── Provisioning ────────────────────────────────────────────────────────────

/**
 * Turn a bare racked chassis into a logical server.
 *
 * Called the moment the operator patches an uplink, because that is the moment
 * the box can actually be reached. Built from `createSeedVM` so a freshly
 * provisioned host has a real filesystem, real services and a real shell — an
 * operator who SSHes into a server they just racked should find a machine, not
 * a stub.
 */
export function provisionNode(
  device: RackDevice,
  rack: RackState,
  org: { domain: string },
  ip: string,
): LinuxNodeState {
  const vm = createSeedVM();
  const hostname = device.name.toLowerCase();
  vm.hostname = hostname;
  // A newly built host is healthy: the 502 the seed VM ships with belongs to
  // the scenario web server, not to every box the player ever racks.
  if (vm.services.app) vm.services.app = { ...vm.services.app, status: "active" };

  const gateway = ip.replace(/\.\d+$/, ".1");
  vm.network.interfaces = [
    { name: "lo", ipv4: "127.0.0.1", netmask: "255.0.0.0", up: true, carrier: true, mac: "00:00:00:00:00:00" },
    { name: "eth0", ipv4: ip, netmask: "255.255.255.0", up: true, carrier: true, mac: randomMac(hostname) },
  ];
  vm.network.routes = [
    { destination: "default", gateway, iface: "eth0", metric: 100 },
    { destination: `${ip.replace(/\.\d+$/, ".0")}/24`, gateway: "0.0.0.0", iface: "eth0", metric: 0 },
  ];
  vm.network.hostsTable = { localhost: "127.0.0.1", [hostname]: "127.0.0.1", [`${hostname}.${org.domain}`]: ip };

  return {
    nodeId: hostname,
    hostname,
    displayName: `${device.name} · ${rack.name}`,
    role: "app-server",
    domain: org.domain,
    connection: {
      protocol: "ssh",
      ip,
      port: 22,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 4,
    },
    network: vm.network,
    health: { status: "healthy", cpuLoad: 4, memUsedPct: 12, diskUsedPct: 9, uptimeSeconds: 60 },
    tags: ["production", "provisioned"],
    // A box you just racked runs nothing yet. Giving it workloads for free
    // would skip the interesting half of capacity planning.
    workloads: [],
    maintenance: { mode: false, drainedAt: null },
    os: "linux",
    distro: "Ubuntu 22.04.3 LTS",
    kernel: vm.kernel,
    filesystem: vm.filesystem,
    users: vm.users,
    services: vm.services,
    processes: vm.processes,
    logs: vm.logs,
    packages: [],
    session: { user: "root", cwd: "/root", history: [], env: { HOME: "/root", USER: "root", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" } },
    nextPid: vm.nextPid,
  };
}

/** Stable pseudo-MAC from the hostname, so a reload does not reshuffle them. */
function randomMac(seedStr: string): string {
  let h = 0;
  for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const oct = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return ((h >>> 16) & 0xff).toString(16).padStart(2, "0");
  };
  return `02:${oct()}:${oct()}:${oct()}:${oct()}:${oct()}`;
}

/** First unused host address in a /24, so provisioning never collides. */
export function nextFreeIp(taken: Set<string>, cidr: string): string {
  const base = cidr.split("/")[0].replace(/\.\d+$/, "");
  for (let host = 20; host < 250; host++) {
    const ip = `${base}.${host}`;
    if (!taken.has(ip)) return ip;
  }
  return `${base}.250`;
}
