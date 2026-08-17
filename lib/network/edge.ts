/**
 * ITQuest — Edge gateway model (pure)
 * ===================================
 * The perimeter router/firewall the estate reaches the internet through, and
 * the rule evaluation the Edge Gateway Manager's log view and the ticket engine
 * both read.
 *
 * ── WHY THE GATEWAY IS A REAL NODE ──────────────────────────────────────────
 *
 * Firewall rules already have a home: every node carries `network.firewall`,
 * and the Linux interpreter already derives ping/curl reachability from it. A
 * separate "edge firewall" slice would be a second model of the same thing, and
 * the two would disagree the first time a ticket touched one of them.
 *
 * So the gateway is a node in `infra.nodes` like any other. It holds addresses,
 * it can be interface-toggled by the existing `setNodeInterfaceUp`, and its
 * rules are the same `FirewallRule[]` the rest of the simulator understands.
 *
 * ── WHY IT IS CREATED LAZILY ────────────────────────────────────────────────
 *
 * `loadSave` discards an estate whose version does not match, so adding the
 * gateway to the generator would delete every save in existence to add one
 * node. `ensureEdgeGateway` mints it on first read instead: new estates and
 * saved ones converge on the same state, and nobody loses their company.
 *
 * The address is DERIVED, not invented — it is the default gateway every other
 * node already routes to. A perimeter device at an address nothing routes
 * through would be scenery.
 */

import type {
  DhcpConfig,
  DhcpReservation,
  FirewallRule,
  IdsState,
  L7App,
  NatRule,
  NetworkState,
  ThreatEvent,
  ThreatKind,
} from "@/lib/vm/types";
import type { LinuxNodeState } from "@/lib/core/linux";
import type { TargetNode } from "@/lib/core/infrastructure";

/** The estate has exactly one perimeter device, at a stable id. */
export const EDGE_GATEWAY_ID = "edge-gw-01";

/**
 * Which interface a rule belongs to.
 *
 * pfSense files rules per interface; the estate's `FirewallRule` carries a
 * netfilter `chain` instead. Rather than add a parallel field that could
 * disagree with the chain, the two tabs ARE chains:
 *
 *   WAN  → INPUT    traffic arriving at the firewall from outside
 *   LAN  → FORWARD  traffic the firewall passes between its legs
 *
 * That mapping is exact enough to teach the real thing: "the WAN tab controls
 * what reaches the box, the LAN tab controls what crosses it".
 */
export type EdgeIface = "wan" | "lan";

export const CHAIN_FOR: Record<EdgeIface, FirewallRule["chain"]> = {
  wan: "INPUT",
  lan: "FORWARD",
};

export function rulesFor(net: NetworkState, iface: EdgeIface): FirewallRule[] {
  return net.firewall.filter((r) => r.chain === CHAIN_FOR[iface]);
}

/**
 * The default rule set a perimeter firewall ships with.
 *
 * Deliberately a WORKING configuration: block inbound from the internet, let
 * the LAN out, and permit management from the LAN only. A ticket breaks it by
 * adding or flipping ONE rule, and the student's job is to find which — which
 * only works if the baseline is coherent enough that the broken rule stands out.
 */
export function defaultEdgeRules(lanCidr: string): FirewallRule[] {
  return [
    {
      id: "wan-block-private",
      chain: "INPUT",
      action: "DROP",
      protocol: "any",
      source: "10.0.0.0/8",
      destination: "any",
      enabled: true,
    },
    /*
     * There is deliberately NO inbound pass rule on WAN.
     *
     * A real appliance ships the WAN side with anti-spoofing blocks and
     * nothing else: return traffic is admitted by connection STATE, which this
     * model does not carry. Writing an "allow established" rule as
     * `any source, any port` would not model state — it would be a permit-all,
     * and the perimeter would be open while appearing configured. The implicit
     * final deny is the honest expression of the same posture.
     */
    {
      id: "lan-allow-out",
      chain: "FORWARD",
      action: "ACCEPT",
      protocol: "any",
      source: lanCidr,
      destination: "any",
      enabled: true,
    },
    {
      id: "lan-allow-dns",
      chain: "FORWARD",
      action: "ACCEPT",
      protocol: "udp",
      port: 53,
      source: lanCidr,
      destination: "any",
      enabled: true,
    },
    {
      id: "lan-allow-https",
      chain: "FORWARD",
      action: "ACCEPT",
      protocol: "tcp",
      port: 443,
      source: lanCidr,
      destination: "any",
      enabled: true,
    },
  ];
}

/**
 * First match wins, exactly as a real rule set evaluates.
 *
 * This is the whole reason rule ORDER is editable in the UI: a permit sitting
 * below a broad block never fires, and "the rule looks right but traffic is
 * still dropped" is one of the most common real firewall faults there is.
 * Returns the rule that decided, so the log can name it.
 */
export function evaluate(
  rules: FirewallRule[],
  packet: { chain: FirewallRule["chain"]; protocol: string; port?: number; source: string; app?: L7App },
): { allowed: boolean; rule: FirewallRule | null } {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.chain !== packet.chain) continue;
    if (r.protocol !== "any" && r.protocol !== packet.protocol) continue;
    /*
     * An application rule matches by app and IGNORES the port, because that is
     * the entire reason L7 filtering exists: BitTorrent hops ports and social
     * media shares 443 with everything else, so a port test would either miss
     * the traffic or take the whole internet with it.
     */
    if (r.app) {
      if (r.app !== packet.app) continue;
    } else if (r.port !== undefined && r.port !== packet.port) continue;
    if (r.source && r.source !== "any" && !cidrContains(r.source, packet.source)) continue;
    return { allowed: r.action === "ACCEPT", rule: r };
  }
  // No rule matched. A firewall's last word is always deny.
  return { allowed: false, rule: null };
}

/** Prefix-match a dotted-quad against a CIDR. Enough for /8, /16 and /24. */
export function cidrContains(cidr: string, ip: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  if (!bitsRaw) return base === ip;
  const bits = Number(bitsRaw);
  const octets = Math.floor(bits / 8);
  if (octets === 0) return true;
  return base.split(".").slice(0, octets).join(".") === ip.split(".").slice(0, octets).join(".");
}

/**
 * The address the estate already routes through.
 *
 * Read off the nodes' default routes rather than assumed, so the gateway lands
 * on the network that actually exists. Falls back only when the estate has no
 * routed node at all.
 */
export function deriveGatewayIp(nodes: Record<string, TargetNode>): string {
  for (const n of Object.values(nodes)) {
    const def = n.network?.routes?.find((r: { destination: string }) => r.destination === "default");
    if (def?.gateway) return def.gateway;
  }
  return "10.0.0.1";
}

/** "10.29.1.1" → "10.29.1.0/24" — the LAN the gateway serves. */
export function lanCidrFor(gatewayIp: string): string {
  return `${gatewayIp.replace(/\.\d+$/, ".0")}/24`;
}

/**
 * Mint the perimeter device.
 *
 * A Linux appliance, because that is what these boxes are: the simulator's
 * OpenWrt edge devices already prove the shape, and modelling it as anything
 * else would mean the terminal could not be pointed at it later.
 */
export function buildEdgeGateway(gatewayIp: string, orgPrefix: string, domain?: string): LinuxNodeState {
  const lan = lanCidrFor(gatewayIp);
  const net: NetworkState = {
    interfaces: [
      {
        name: "wan0",
        up: true,
        // A single public-ish address. The estate does not model a real ISP
        // allocation, and inventing a plausible one is better than pretending
        // the WAN leg has no address at all.
        ipv4: "203.0.113.10",
        netmask: "255.255.255.248",
        mac: "02:ed:01:00:00:01",
        carrier: true,
      },
      {
        name: "lan0",
        up: true,
        ipv4: gatewayIp,
        netmask: "255.255.255.0",
        mac: "02:ed:01:00:00:02",
        carrier: true,
      },
    ],
    routes: [{ destination: "default", gateway: "203.0.113.9", iface: "wan0", metric: 10 }],
    dnsServers: ["1.1.1.1", "9.9.9.9"],
    hostsTable: {},
    firewall: defaultEdgeRules(lan),
    nat: defaultNatRules(),
    dhcp: defaultDhcp(gatewayIp),
    ids: defaultIds(),
    reachableHosts: {},
  };

  return {
    nodeId: EDGE_GATEWAY_ID,
    hostname: `${orgPrefix}-EDGE-01`,
    displayName: "Edge Gateway (perimeter firewall)",
    role: "router",
    domain,
    connection: {
      protocol: "ssh",
      ip: gatewayIp,
      port: 22,
      reachable: true,
      online: true,
      requiresCredentials: true,
      authenticated: false,
      latencyMs: 0.4,
    },
    network: net,
    health: { status: "healthy", cpuLoad: 6, memUsedPct: 24, diskUsedPct: 11, uptimeSeconds: 41 * 86_400 },
    tags: ["router", "firewall", "edge"],
    workloads: [],
    os: "linux",
    distro: "pfGate 2.7 (appliance firmware)",
    kernel: "6.1.0-edge",
    filesystem: { type: "dir", children: {}, owner: "root", group: "root", mode: "drwxr-xr-x", mtime: 0 },
    users: [],
    services: {},
    processes: [],
    logs: {},
    packages: [],
    session: { cwd: "/root", user: "root", history: [], env: {} },
    nextPid: 400,
  };
}

// ── NAT ─────────────────────────────────────────────────────────────────────

/** What a port forward ships with: nothing. Forwards are always deliberate. */
export function defaultNatRules(): NatRule[] {
  return [];
}

/**
 * Resolve an inbound connection to the WAN address.
 *
 * The order here is the lesson. A packet hitting the WAN port is translated
 * FIRST and filtered second, which is why a correct-looking firewall rule and a
 * correct-looking forward can still fail together: on real hardware the rule
 * has to permit the TRANSLATED destination, not the public one. Returning both
 * the matched forward and the verdict lets the UI say which half is wrong.
 */
export function resolveInbound(
  net: NetworkState,
  packet: { protocol: "tcp" | "udp"; port: number; source: string },
): { forwarded: NatRule | null; deliveredTo: string | null; allowed: boolean; rule: FirewallRule | null } {
  const nat = (net.nat ?? []).find(
    (n) => n.enabled && n.protocol === packet.protocol && n.externalPort === packet.port,
  );
  if (!nat) {
    // Nothing published on that port. The firewall still gets a say, and on a
    // default configuration it denies — which is the correct answer to
    // "why can't the outside reach us": nobody forwarded anything.
    const verdict = evaluate(net.firewall, { chain: "INPUT", ...packet });
    return { forwarded: null, deliveredTo: null, allowed: verdict.allowed, rule: verdict.rule };
  }
  const verdict = evaluate(net.firewall, {
    chain: "FORWARD",
    protocol: packet.protocol,
    port: nat.internalPort,
    source: packet.source,
  });
  return { forwarded: nat, deliveredTo: nat.internalIp, allowed: verdict.allowed, rule: verdict.rule };
}

/**
 * Is this forward pointing at a host that exists and is up?
 *
 * The single most common real port-forward fault is a rule that is perfectly
 * valid and aims at a decommissioned or re-addressed box. Derived rather than
 * stored so it self-corrects the moment the host comes back.
 */
export function natTargetProblem(
  rule: NatRule,
  nodes: Record<string, TargetNode>,
): string | null {
  const target = Object.values(nodes).find((n) =>
    n.network?.interfaces?.some((i) => i.ipv4 === rule.internalIp),
  );
  if (!target) return `No host on the LAN holds ${rule.internalIp}`;
  const iface = target.network.interfaces.find((i) => i.ipv4 === rule.internalIp);
  if (iface && !iface.up) return `${target.hostname} is administratively down`;
  if (!target.connection.online) return `${target.hostname} is powered off`;
  return null;
}

// ── DHCP ────────────────────────────────────────────────────────────────────

export function defaultDhcp(gatewayIp: string): DhcpConfig {
  const base = gatewayIp.replace(/\.\d+$/, "");
  return {
    enabled: true,
    rangeStart: `${base}.100`,
    rangeEnd: `${base}.199`,
    leaseMinutes: 1440,
    reservations: [],
  };
}

export interface DhcpLease {
  mac: string;
  ip: string;
  hostname: string;
  /** A reservation, or a dynamic handout. */
  kind: "static" | "dynamic";
  /** Set when this lease cannot be honoured — the ticket-visible fault. */
  problem: string | null;
}

/** Is the address inside the configured pool? */
export function inPool(cfg: DhcpConfig, ip: string): boolean {
  const last = (s: string) => Number(s.split(".").pop());
  const net = (s: string) => s.split(".").slice(0, 3).join(".");
  if (net(ip) !== net(cfg.rangeStart)) return false;
  return last(ip) >= last(cfg.rangeStart) && last(ip) <= last(cfg.rangeEnd);
}

/**
 * The lease table, DERIVED from who is actually on the LAN.
 *
 * Leases are not stored. A machine holding an address IS the lease — storing a
 * second copy would mean a node could be re-addressed in the Network applet
 * while the router still advertised the old lease, and the two would have to be
 * reconciled by hand forever. Reservations ARE stored, because a reservation is
 * an intention that exists whether or not the machine is currently on.
 *
 * `problem` is where the teachable faults surface: a reservation that collides
 * with the dynamic pool, and two hosts on one address.
 */
export function deriveLeases(
  cfg: DhcpConfig,
  lanCidr: string,
  nodes: Record<string, TargetNode>,
  gatewayIp: string,
): DhcpLease[] {
  const out: DhcpLease[] = [];
  const seen = new Map<string, string>(); // ip -> hostname

  for (const n of Object.values(nodes)) {
    for (const i of n.network?.interfaces ?? []) {
      if (!i.ipv4 || i.ipv4 === gatewayIp) continue;
      if (!cidrContains(lanCidr, i.ipv4)) continue;

      const reserved = cfg.reservations.find((r) => r.mac === i.mac);
      const clash = seen.get(i.ipv4);
      seen.set(i.ipv4, n.hostname);

      let problem: string | null = null;
      if (clash) problem = `Address conflict — also held by ${clash}`;
      else if (reserved && reserved.ip !== i.ipv4)
        problem = `Reserved for ${reserved.ip} but currently holding ${i.ipv4}`;
      else if (reserved && inPool(cfg, reserved.ip))
        // A reservation inside the dynamic range will eventually be handed to
        // somebody else. It looks fine until the day it isn't.
        problem = `Reservation sits inside the dynamic pool (${cfg.rangeStart}–${cfg.rangeEnd})`;

      out.push({
        mac: i.mac,
        ip: i.ipv4,
        hostname: n.hostname,
        kind: reserved ? "static" : "dynamic",
        problem,
      });
    }
  }
  return out.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}

/** Reservations the operator made for machines that are not on this LAN. */
export function orphanReservations(cfg: DhcpConfig, leases: DhcpLease[]): DhcpReservation[] {
  return cfg.reservations.filter((r) => !leases.some((l) => l.mac === r.mac));
}

// ── IDS / IPS ───────────────────────────────────────────────────────────────

export function defaultIds(): IdsState {
  return { enabled: false, mode: "detect", events: [] };
}

const SIGNATURES: Record<ThreatKind, { signature: string; severity: ThreatEvent["severity"] }> = {
  "port-scan": { signature: "ET SCAN Nmap SYN sweep", severity: "medium" },
  ddos: { signature: "ET DOS SYN flood inbound", severity: "high" },
  "brute-force": { signature: "ET SCAN SSH credential brute force", severity: "high" },
  "malware-c2": { signature: "ET MALWARE C2 beacon outbound", severity: "critical" },
  exploit: { signature: "ET EXPLOIT SMB remote code execution", severity: "critical" },
};

/**
 * Build a threat event.
 *
 * `action` is decided by the MODE, not by the caller: an engine in detect mode
 * cannot block, and letting a ticket hand-write "blocked" on a detect-mode
 * engine would make the mode setting cosmetic — and the "IDS is on but the
 * attack landed" scenario unsolvable.
 */
export function threatEvent(
  ids: IdsState,
  kind: ThreatKind,
  source: string,
  target: string,
  at: number,
  seq = 0,
): ThreatEvent {
  const meta = SIGNATURES[kind];
  return {
    id: `thr-${at.toString(36)}-${seq}`,
    at,
    kind,
    severity: meta.severity,
    source,
    target,
    signature: meta.signature,
    action: ids.enabled && ids.mode === "prevent" ? "blocked" : "detected",
  };
}

/**
 * Would this traffic have reached the estate?
 *
 * The predicate a ticket grades. Detect-mode logs the attack and lets it
 * through; prevent-mode stops it; a disabled engine never sees it at all.
 */
export function threatReachedEstate(ids: IdsState, ev: ThreatEvent): boolean {
  if (!ids.enabled) return true;
  return ev.action !== "blocked";
}

/** Counts for the threat dashboard, in severity order. */
export function threatSummary(ids: IdsState): {
  total: number;
  blocked: number;
  critical: number;
  bySeverity: Record<ThreatEvent["severity"], number>;
} {
  const bySeverity: Record<ThreatEvent["severity"], number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let blocked = 0;
  for (const e of ids.events) {
    bySeverity[e.severity]++;
    if (e.action === "blocked") blocked++;
  }
  return { total: ids.events.length, blocked, critical: bySeverity.critical, bySeverity };
}
