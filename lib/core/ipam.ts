/**
 * ITQuest — IP address management and conflict detection (Build 1)
 * =================================================================
 * Who holds which address, whether they were given it or took it, and every
 * way that can go wrong.
 *
 * ── WHAT IS STORED ──────────────────────────────────────────────────────────
 *
 * One lease per node: the MODE (dhcp or static) and, when static, the address
 * the operator typed. That is the decision the player made, so that is what
 * persists and what tickets grade.
 *
 * ── WHAT IS DERIVED ─────────────────────────────────────────────────────────
 *
 * The EFFECTIVE address, and every conflict. Both come from pure functions
 * over the lease table plus the node table.
 *
 * This matters more here than anywhere else in the codebase. A stored
 * "conflicted: true" flag would have to be recomputed on every address change,
 * every node addition, every subnet edit and every save restore — and the first
 * path that forgot would leave a conflict showing on a network that is fine, or
 * worse, hide one on a network that is not. `detectConflicts()` is called
 * fresh, sees the whole estate at once, and cannot be stale.
 *
 * ── WHAT COUNTS AS A CONFLICT ───────────────────────────────────────────────
 *
 * Four things, in the order an operator meets them:
 *
 *   1. DUPLICATE — two live nodes holding the same address. The classic. Both
 *      sides are named, because "there is a conflict" without saying with what
 *      is the unhelpful half of every real duplicate-IP alert.
 *   2. OUT OF SUBNET — an address outside every subnet the estate defines.
 *      Reachable from nothing, which looks like a dead NIC.
 *   3. RESERVED — the network address, the broadcast address, or the gateway.
 *      Taking .1 is the single most common way a well-meaning static
 *      assignment removes a whole VLAN's route out.
 *   4. IN THE DHCP POOL — a static address inside the range the server hands
 *      out. It works today and breaks in a week when the pool reaches it, which
 *      is exactly why it is worth teaching.
 *
 * Only 1 and 3 are FAULTS (they break something now); 2 and 4 are warnings the
 * operator should still be told about. The distinction is the difference
 * between an alarm and a lesson.
 */

import type { NodeId } from "./nodes";
import type { SubnetDef, TargetNode } from "./infrastructure";

// ── Address maths ───────────────────────────────────────────────────────────

/** Dotted quad to a 32-bit integer. Returns null on anything malformed. */
export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function isValidIp(ip: string): boolean {
  return ipToInt(ip) !== null;
}

export interface ParsedCidr {
  cidr: string;
  networkInt: number;
  broadcastInt: number;
  bits: number;
  /** Conventionally .1 — the router. */
  gatewayInt: number;
}

export function parseCidr(cidr: string): ParsedCidr | null {
  const [addr, bitsRaw] = cidr.split("/");
  const base = ipToInt(addr ?? "");
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 8 || bits > 30) return null;
  // `>>> 0` because JavaScript's bitwise operators are signed and a /8 mask
  // would otherwise come out negative and compare wrongly.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const networkInt = (base & mask) >>> 0;
  const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;
  return { cidr, networkInt, broadcastInt, bits, gatewayInt: networkInt + 1 };
}

/**
 * Bit-exact containment.
 *
 * NOT the same function as `ipInCidr` in cloud.ts, and deliberately not merged
 * with it: that one compares whole octets (so it only really handles /8, /16
 * and /24) and treats the cloud's public CIDR as matching everything. Both are
 * right for their own job — this one has to be exact, because a /25 boundary
 * is precisely the kind of thing an addressing exercise is about — and giving
 * them the same name would have one silently shadow the other.
 */
export function ipWithinCidr(ip: string, cidr: string): boolean {
  const n = ipToInt(ip);
  const c = parseCidr(cidr);
  if (n === null || !c) return false;
  return n >= c.networkInt && n <= c.broadcastInt;
}

/** The subnet an address belongs to, or undefined if it is off-estate. */
export function subnetOf(ip: string, subnets: SubnetDef[]): SubnetDef | undefined {
  return subnets.find((s) => ipWithinCidr(ip, s.cidr));
}

// ── Persisted state ─────────────────────────────────────────────────────────

export type IpMode = "dhcp" | "static";

export interface IpLease {
  nodeId: NodeId;
  mode: IpMode;
  /**
   * Only meaningful while mode is "static". Kept when switching back to DHCP
   * so toggling twice does not lose what the operator typed — a small mercy
   * that removes a whole class of "I had it right a second ago".
   */
  staticIp?: string;
  /** When the operator last changed this, for the fault log. */
  updatedAt?: number;
}

/**
 * The DHCP range, as host numbers within each subnet. Stored per subnet rather
 * than globally: a /24 for cameras and a /24 for staff do not want the same
 * pool, and the pool boundary is the thing static assignments collide with.
 */
export interface DhcpPool {
  cidr: string;
  /** Inclusive host octet bounds, e.g. 100..199. */
  start: number;
  end: number;
}

export type NetworkFaultKind =
  | "ip-conflict"
  | "reserved-address"
  | "out-of-subnet"
  | "dhcp-pool-overlap"
  | "poe-budget"
  | "port-down";

export interface NetworkFault {
  id: string;
  at: number;
  kind: NetworkFaultKind;
  /** Node the fault is about, where there is one. */
  nodeId?: NodeId;
  detail: string;
  /** Cleared faults stay in the log — an incident history, not a to-do list. */
  clearedAt?: number;
}

export interface IpamState {
  leases: Record<NodeId, IpLease>;
  pools: DhcpPool[];
  faults: NetworkFault[];
}

export function createIpamState(): IpamState {
  return { leases: {}, pools: [], faults: [] };
}

// ── Effective addressing ────────────────────────────────────────────────────

/**
 * The address a node is actually using.
 *
 * A static lease overrides the node's generated address; DHCP keeps it. The
 * node's own `connection.ip` is treated as its current DHCP lease rather than
 * being rewritten, so switching a node to static and back returns it to the
 * address the rest of the estate already knows it by.
 */
export function effectiveIp(node: TargetNode, ipam: IpamState): string {
  const lease = ipam.leases[node.nodeId];
  if (lease?.mode === "static" && lease.staticIp && isValidIp(lease.staticIp)) {
    return lease.staticIp;
  }
  return node.connection.ip;
}

export function leaseMode(nodeId: NodeId, ipam: IpamState): IpMode {
  return ipam.leases[nodeId]?.mode ?? "dhcp";
}

export function poolFor(cidr: string, ipam: IpamState): DhcpPool | undefined {
  return ipam.pools.find((p) => p.cidr === cidr);
}

/** Is this address inside the range the DHCP server hands out? */
export function inDhcpPool(ip: string, ipam: IpamState, subnets: SubnetDef[]): boolean {
  const sub = subnetOf(ip, subnets);
  if (!sub) return false;
  const pool = poolFor(sub.cidr, ipam);
  if (!pool) return false;
  const n = ipToInt(ip);
  const c = parseCidr(sub.cidr);
  if (n === null || !c) return false;
  const host = n - c.networkInt;
  return host >= pool.start && host <= pool.end;
}

// ── Conflict detection ──────────────────────────────────────────────────────

export type ConflictKind = "duplicate" | "reserved" | "out-of-subnet" | "dhcp-pool";

export interface IpConflict {
  kind: ConflictKind;
  nodeId: NodeId;
  ip: string;
  /** The other party, when the conflict has one. */
  withNodeId?: NodeId;
  /** True when this breaks something NOW rather than eventually. */
  blocking: boolean;
  detail: string;
  remedy: string;
}

interface DetectInput {
  nodes: Record<NodeId, TargetNode>;
  subnets: SubnetDef[];
  ipam: IpamState;
}

/**
 * Every conflict on the estate, recomputed from scratch.
 *
 * Deliberately whole-estate rather than per-node: a duplicate is a property of
 * a PAIR, and a function that could only see one node at a time would have to
 * be called n times and would still miss the case where the other half is the
 * one that moved.
 */
export function detectConflicts({ nodes, subnets, ipam }: DetectInput): IpConflict[] {
  const out: IpConflict[] = [];
  const all = Object.values(nodes);

  // Index by effective address so duplicates fall out in one pass.
  const byIp = new Map<string, TargetNode[]>();
  for (const node of all) {
    const ip = effectiveIp(node, ipam);
    if (!isValidIp(ip)) continue;
    const list = byIp.get(ip);
    if (list) list.push(node);
    else byIp.set(ip, [node]);
  }

  for (const node of all) {
    const ip = effectiveIp(node, ipam);
    const mode = leaseMode(node.nodeId, ipam);

    if (!isValidIp(ip)) {
      out.push({
        kind: "out-of-subnet",
        nodeId: node.nodeId,
        ip,
        blocking: true,
        detail: `${node.hostname} has no valid address.`,
        remedy: "Set a valid IPv4 address, or switch the node back to DHCP.",
      });
      continue;
    }

    // 1. DUPLICATE. Named on both sides — "conflicts with something" is the
    //    unhelpful half of every real duplicate-address alert.
    const sharing = (byIp.get(ip) ?? []).filter((n) => n.nodeId !== node.nodeId);
    for (const other of sharing) {
      out.push({
        kind: "duplicate",
        nodeId: node.nodeId,
        ip,
        withNodeId: other.nodeId,
        blocking: true,
        detail: `${node.hostname} and ${other.hostname} are both using ${ip}.`,
        remedy: `Give one of them a different address, or return ${node.hostname} to DHCP.`,
      });
    }

    const sub = subnetOf(ip, subnets);

    // 2. OFF-ESTATE. Not an alarm on its own, but nothing can reach it.
    if (!sub) {
      out.push({
        kind: "out-of-subnet",
        nodeId: node.nodeId,
        ip,
        blocking: true,
        detail: `${ip} is not inside any subnet this network defines.`,
        remedy: `Use an address from one of: ${subnets.map((s) => s.cidr).join(", ")}.`,
      });
      continue;
    }

    const c = parseCidr(sub.cidr);
    const n = ipToInt(ip);
    if (c && n !== null) {
      // 3. RESERVED. Taking .1 is how a well-meaning static assignment removes
      //    a whole VLAN's route out, and it is always worth naming explicitly.
      const which =
        n === c.networkInt
          ? "the network address"
          : n === c.broadcastInt
            ? "the broadcast address"
            : n === c.gatewayInt
              ? `the default gateway for ${sub.label}`
              : null;
      if (which) {
        out.push({
          kind: "reserved",
          nodeId: node.nodeId,
          ip,
          blocking: true,
          detail: `${ip} is ${which} on ${sub.cidr} and cannot be assigned to a host.`,
          remedy:
            n === c.gatewayInt
              ? "Everything on this VLAN routes through that address — pick another."
              : "Pick an address between the network and broadcast addresses.",
        });
      }
    }

    // 4. STATIC INSIDE THE POOL. Works today, breaks in a week. Non-blocking
    //    on purpose: flagging it as an outage would be crying wolf, and the
    //    lesson is precisely that it looks fine right up until it does not.
    if (mode === "static" && inDhcpPool(ip, ipam, subnets)) {
      const pool = poolFor(sub.cidr, ipam);
      out.push({
        kind: "dhcp-pool",
        nodeId: node.nodeId,
        ip,
        blocking: false,
        detail: `${ip} sits inside the DHCP pool for ${sub.label} (.${pool?.start}-.${pool?.end}).`,
        remedy: "It works now, but the server will eventually lease it to someone else. Use an address below the pool.",
      });
    }
  }

  return out;
}

/** Conflicts affecting one node — the per-row view, built off the same pass. */
export function conflictsFor(nodeId: NodeId, conflicts: IpConflict[]): IpConflict[] {
  return conflicts.filter((c) => c.nodeId === nodeId);
}

export function hasBlockingConflict(nodeId: NodeId, conflicts: IpConflict[]): boolean {
  return conflicts.some((c) => c.nodeId === nodeId && c.blocking);
}

/**
 * The first free address in a subnet, skipping the pool and anything taken.
 *
 * Offered as a suggestion in the UI rather than applied automatically: filling
 * the field for the operator would rob them of the one decision the exercise
 * is about. Below the pool by convention, which is where static assignments
 * belong.
 */
export function suggestStatic(
  cidr: string,
  { nodes, subnets, ipam }: DetectInput,
): string | null {
  const c = parseCidr(cidr);
  if (!c) return null;
  const pool = poolFor(cidr, ipam);
  const taken = new Set(
    Object.values(nodes).map((n) => effectiveIp(n, ipam)),
  );
  // Start at .2: .0 is the network and .1 is the gateway.
  const ceiling = pool ? pool.start : c.broadcastInt - c.networkInt;
  for (let host = 2; host < ceiling; host++) {
    const candidate = intToIp(c.networkInt + host);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}
