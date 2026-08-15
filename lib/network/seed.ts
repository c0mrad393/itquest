/**
 * TriageOS — PoE switch and edge-device seeding (Build 1)
 * =======================================================
 * Builds the access layer: one or two managed PoE switches, the cameras,
 * access points and phones hanging off them, and the address leases for the
 * whole estate.
 *
 * ── WHY THE SWITCH IS DELIBERATELY UNDER-BUDGETED ───────────────────────────
 *
 * The seeded switch has enough headroom for what is plugged into it, and not
 * much more. That is not a difficulty setting — it is the entire lesson.
 * PoE budget is a constraint that does not exist until the day somebody adds
 * one more camera, and a switch seeded at 20% load would teach a player that
 * the budget meter is decoration. Sized so the estate runs clean but the next
 * device is a decision.
 *
 * ── WHY THE POOL STARTS AT .100 ─────────────────────────────────────────────
 *
 * The convention every real network uses: infrastructure low, DHCP high. It
 * gives static assignments an obvious correct home (.2 to .99) and makes the
 * "static address inside the DHCP pool" mistake possible to make and possible
 * to explain. A pool covering the whole subnet would leave nowhere right to
 * put a static address, and the exercise would have no answer.
 *
 * SVG icons and typographic glyphs only in anything that renders this — no
 * emoji.
 */

import type {
  DhcpPool,
  IpamState,
  LinuxNodeState,
  NodeId,
  NodeRole,
  PoePort,
  PoeState,
  PoeSwitch,
  SubnetDef,
  TargetNode,
} from "@/lib/core";
import { POE_DRAW_W, isPoweredDevice, parseCidr, intToIp } from "@/lib/core";

type Rng = () => number;

const int = (rng: Rng, lo: number, hi: number) => Math.floor(rng() * (hi - lo + 1)) + lo;
const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

/** Where cameras and access points actually get mounted. */
const CAMERA_SITES = [
  "Reception",
  "Loading bay",
  "Server room door",
  "Car park east",
  "Main corridor",
  "Fire exit north",
  "Stock room",
];

const AP_SITES = ["Open plan north", "Open plan south", "Meeting rooms", "Warehouse floor"];

/**
 * An edge device as a node.
 *
 * Modelled as a minimal Linux host because that is what these things are —
 * embedded Linux with a web interface — and because inventing a fourth OS
 * variant for a device with no shell would add a type everything else has to
 * handle for no gain. It carries no services, no packages and no filesystem to
 * speak of, which is exactly right: there is nothing to remote into.
 */
function makeEdgeNode(
  rng: Rng,
  role: NodeRole,
  hostname: string,
  displayName: string,
  ip: string,
  domain: string,
): LinuxNodeState {
  const gw = ip.replace(/\.\d+$/, ".1");
  return {
    nodeId: hostname,
    hostname,
    displayName,
    role,
    domain,
    connection: {
      protocol: "ssh",
      ip,
      port: 22,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: Math.round(rng() * 30 + 8) / 10,
    },
    network: {
      interfaces: [
        {
          name: "eth0",
          up: true,
          ipv4: ip,
          netmask: "255.255.255.0",
          mac:
            "02:1c:" +
            ip.split(".").map((o) => (+o).toString(16).padStart(2, "0")).slice(0, 4).join(":"),
          carrier: true,
        },
      ],
      routes: [{ destination: "default", gateway: gw, iface: "eth0", metric: 100 }],
      dnsServers: [gw],
      hostsTable: { [hostname]: ip },
      firewall: [],
      reachableHosts: {},
    },
    health: {
      status: "healthy",
      cpuLoad: int(rng, 2, 14),
      memUsedPct: int(rng, 20, 55),
      diskUsedPct: int(rng, 5, 40),
      uptimeSeconds: int(rng, 1, 200) * 86_400,
    },
    workloads: [],
    tags: [role],
    os: "linux",
    distro: role === "ip-camera" ? "BusyBox 1.35 (camera firmware)" : "OpenWrt 23.05",
    kernel: "5.15.0-embedded",
    filesystem: { kind: "dir", children: {} },
    users: [],
    services: {},
    processes: [],
    logs: {},
    packages: [],
    session: { cwd: "/", user: "root", history: [], env: {} },
  } as unknown as LinuxNodeState;
}

function emptyPort(n: number): PoePort {
  return { n, enabled: true, poeEnabled: true, priority: "high" };
}

/**
 * Build the access layer.
 *
 * Returns the new nodes alongside the switch state so the caller can merge
 * them into the estate — the edge devices have to be REAL nodes in
 * `infra.nodes`, or they could not hold addresses, could not conflict, and
 * would not appear in the Monitor. A parallel list of "camera objects" would
 * be exactly the duplicated model this codebase keeps refusing to build.
 */
export function buildAccessLayer(
  rng: Rng,
  subnets: SubnetDef[],
  domain: string,
  netbios: string,
  /**
   * The estate as already generated. Passed in so edge devices can skip
   * addresses that are taken — an access layer that collided with the servers
   * it sits beside would open every new game on a false conflict alarm.
   */
  existing: Record<NodeId, TargetNode> = {},
): { poe: PoeState; nodes: Record<NodeId, TargetNode> } {
  const nodes: Record<NodeId, TargetNode> = {};

  // Cameras and APs live on the management VLAN where the org has one, and on
  // the user VLAN otherwise — which is what a small site without segmentation
  // actually does, and makes the segmentation lesson available later.
  const mgmt =
    subnets.find((s) => s.label.startsWith("Mgmt")) ??
    subnets.find((s) => s.label.startsWith("Core")) ??
    subnets[0];
  const parsed = parseCidr(mgmt.cidr);
  const addrAt = (host: number) =>
    parsed ? intToIp(parsed.networkInt + host) : mgmt.cidr.replace(/\.0\/24$/, `.${host}`);

  const taken = new Set(Object.values(existing).map((n) => n.connection.ip));
  /** The next free host number at or above `from`, skipping what is in use. */
  const claim = (from: number): number => {
    let h = from;
    while (taken.has(addrAt(h)) && h < 254) h += 1;
    taken.add(addrAt(h));
    return h;
  };

  const cameraCount = int(rng, 3, 5);
  const apCount = int(rng, 1, 2);

  const ports: PoePort[] = Array.from({ length: 8 }, (_, i) => emptyPort(i + 1));
  let nextPort = 0;
  let host = 20;

  const sites = [...CAMERA_SITES];
  for (let i = 0; i < cameraCount; i++) {
    const site = sites.splice(Math.floor(rng() * sites.length), 1)[0] ?? `Camera ${i + 1}`;
    const hostname = `CAM-${String(101 + i)}`;
    host = claim(host);
    const ip = addrAt(host++);
    nodes[hostname] = makeEdgeNode(rng, "ip-camera", hostname, `${site} camera`, ip, domain);
    const port = ports[nextPort++];
    port.attachedNodeId = hostname;
    port.label = `${site} camera`;
    // The door camera is the one you do not want shed. Giving exactly one port
    // a non-default priority seeds the concept without pre-solving it.
    port.priority = site === "Server room door" ? "critical" : "high";
  }

  const apSites = [...AP_SITES];
  for (let i = 0; i < apCount; i++) {
    const site = apSites.splice(Math.floor(rng() * apSites.length), 1)[0] ?? `AP ${i + 1}`;
    const hostname = `AP-${String(201 + i)}`;
    host = claim(host);
    const ip = addrAt(host++);
    nodes[hostname] = makeEdgeNode(rng, "access-point", hostname, `${site} access point`, ip, domain);
    const port = ports[nextPort++];
    port.attachedNodeId = hostname;
    port.label = `${site} AP`;
    port.priority = "high";
  }

  const drawn = Object.values(nodes).reduce(
    (w, n) => w + (isPoweredDevice(n.role) ? (POE_DRAW_W[n.role] ?? 0) : 0),
    0,
  );

  /*
   * Budget: what is plugged in, plus one more camera's worth of headroom,
   * rounded to a real SKU size. Enough to run clean today; not enough to add
   * two more cameras without thinking. See the header for why that matters.
   */
  const sku = [65, 130, 190, 250];
  const wanted = drawn + (POE_DRAW_W["ip-camera"] ?? 12.5) * 1.5;
  const budgetW = sku.find((s) => s >= wanted) ?? sku[sku.length - 1];

  const sw: PoeSwitch = {
    id: "psw-01",
    name: `${netbios.slice(0, 4)}-PSW-01`,
    mgmtIp: addrAt(claim(2)),
    standard: "at",
    budgetW,
    ports,
  };
  // The management address is claimed too, for the same reason.
  claim(2);

  return { poe: { switches: [sw] }, nodes };
}

/**
 * Address leases for the whole estate.
 *
 * Everything starts on DHCP, which is both realistic and the right starting
 * point for the exercise: the player's first static assignment should be a
 * decision they made, not one they inherited.
 */
export function buildIpam(subnets: SubnetDef[], nodes: Record<NodeId, TargetNode>): IpamState {
  const pools: DhcpPool[] = subnets.map((s) => ({ cidr: s.cidr, start: 100, end: 199 }));
  const leases: IpamState["leases"] = {};
  for (const node of Object.values(nodes)) {
    leases[node.nodeId] = { nodeId: node.nodeId, mode: "dhcp" };
  }
  return { leases, pools, faults: [] };
}

/** A stable id for faults raised at runtime. */
export function faultId(rng: Rng = Math.random): string {
  return `flt-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
}

export { pick as pickSite };
