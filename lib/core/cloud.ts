/**
 * TriageOS — AetherCloud Engine (ACE) model
 * =========================================
 * The fictional public cloud the estate extends into. Everything here is a
 * deliberate stand-in for the real thing, with our own vocabulary:
 *
 *   AVN         Aether Virtual Network   — an isolated virtual network
 *   vNode       Aether Compute Node      — a virtual machine
 *   DataBucket  Aether DataBucket        — object storage
 *   Shield rule Aether Shield Rule       — an ingress firewall rule
 *   ATR         Aether Traffic Router    — an L7 load balancer
 *
 * ARCHITECTURE: unlike the Monitor's telemetry (derived, session-scoped), cloud
 * state lives INSIDE InfrastructureState alongside `security`, `inventory` and
 * `rack`. Three consequences we actually want:
 *   • save.ts persists it for free
 *   • the TicketReconciler re-evaluates win-conditions whenever it changes, so
 *     building the right cloud topology resolves a ticket immediately
 *   • hybrid routing is a pure function of one authoritative state object
 *
 * All of it is plain JSON — no class instances, no Dates.
 */

import type { NodeId } from "./nodes";

// ── Compute ─────────────────────────────────────────────────────────────────

export type VNodeSize = "micro" | "standard" | "high-spec";
export type VNodeStatus = "provisioning" | "running" | "stopped";

export interface VNodeSizeSpec {
  id: VNodeSize;
  label: string;
  vcpu: number;
  memGb: number;
  /** Credits per hour. The FinOps meter is the sum across running vNodes. */
  creditsPerHour: number;
}

export const VNODE_SIZES: VNodeSizeSpec[] = [
  { id: "micro", label: "Micro", vcpu: 1, memGb: 2, creditsPerHour: 0.5 },
  { id: "standard", label: "Standard", vcpu: 4, memGb: 16, creditsPerHour: 2 },
  { id: "high-spec", label: "High-Spec", vcpu: 16, memGb: 64, creditsPerHour: 8 },
];

export function sizeSpec(size: VNodeSize): VNodeSizeSpec {
  return VNODE_SIZES.find((s) => s.id === size) ?? VNODE_SIZES[0];
}

export interface AetherVNode {
  id: string; // "vnode-01"
  name: string;
  avnId: string;
  size: VNodeSize;
  status: VNodeStatus;
  privateIp: string; // inside the AVN CIDR
  /** What the operator stood it up for; drives the ATR target list. */
  purpose: "web" | "database" | "backup" | "general";
  createdAt: number;
}

// ── Storage ─────────────────────────────────────────────────────────────────

export type BucketTier = "hot" | "cool" | "archive";

export const BUCKET_TIERS: { id: BucketTier; label: string; creditsPerGbHour: number }[] = [
  { id: "hot", label: "Hot", creditsPerGbHour: 0.004 },
  { id: "cool", label: "Cool", creditsPerGbHour: 0.0015 },
  { id: "archive", label: "Archive", creditsPerGbHour: 0.0004 },
];

export interface DataBucket {
  id: string;
  name: string;
  tier: BucketTier;
  sizeGb: number;
  /** Public read exposure — a finding in its own right when true. */
  publicAccess: boolean;
}

// ── Networking ──────────────────────────────────────────────────────────────

export interface AetherVirtualNetwork {
  id: string; // "avn-01"
  name: string;
  cidr: string; // "172.16.10.0/24"
  region: string;
}

export type ShieldProtocol = "tcp" | "udp" | "any";

export interface ShieldRule {
  id: string; // "sr-8812"
  avnId: string;
  description: string;
  protocol: ShieldProtocol;
  port: number;
  /** Source CIDR. `0.0.0.0/0` is the whole public internet. */
  source: string;
  action: "allow" | "deny";
}

/** Ports that must never be reachable from the open internet. */
export const ADMIN_PORTS = [22, 3389, 5432, 3306, 1433, 27017];

export const PUBLIC_CIDR = "0.0.0.0/0";

/**
 * Shield rules that expose an administrative port to the whole internet. The
 * security-audit ticket is resolved by clearing this list.
 */
export function exposedAdminRules(cloud: CloudState): ShieldRule[] {
  return cloud.shieldRules.filter(
    (r) => r.action === "allow" && r.source === PUBLIC_CIDR && ADMIN_PORTS.includes(r.port),
  );
}

export interface TrafficRouter {
  id: string; // "atr-01"
  name: string;
  avnId: string;
  /** vNode ids receiving traffic. */
  targets: string[];
  /**
   * The on-prem host this router fails over FOR. Set when the operator points
   * the router at a physical origin, which is what the failover ticket wants.
   */
  originNodeId: NodeId | null;
  /** Origin CPU % above which traffic shifts to the cloud targets. */
  cpuThreshold: number;
  enabled: boolean;
}

// ── Hybrid connectivity ─────────────────────────────────────────────────────

export type VpnStatus = "down" | "negotiating" | "connected" | "error";

export interface VpnTunnel {
  status: VpnStatus;
  /** Physical gateway/router node terminating the on-prem side. */
  localGatewayNodeId: NodeId | null;
  /** On-prem network advertised into the tunnel. */
  localCidr: string;
  /** AVN on the far side. */
  remoteAvnId: string | null;
  /** Pre-shared key. Present for realism; never a real credential. */
  psk: string;
  lastError: string | null;
  connectedAt: number | null;
}

// ── Audit (AetherTrace) ─────────────────────────────────────────────────────

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEvent {
  id: string;
  at: number;
  /** Who performed it — an operator name or a service principal. */
  actor: string;
  /** Imperative summary, e.g. "Opened port 22 on sr-8812". */
  action: string;
  /** The resource id the action touched. */
  target: string;
  severity: AuditSeverity;
}

// ── Root ────────────────────────────────────────────────────────────────────

export interface CloudState {
  /** Subscription/tenant label shown in the console header. */
  tenant: string;
  avns: AetherVirtualNetwork[];
  vnodes: AetherVNode[];
  buckets: DataBucket[];
  shieldRules: ShieldRule[];
  routers: TrafficRouter[];
  vpn: VpnTunnel;
  /** Newest first, capped — see CLOUD_AUDIT_CAP. */
  audit: AuditEvent[];
}

export const CLOUD_AUDIT_CAP = 200;

// ── FinOps ──────────────────────────────────────────────────────────────────

/** Credits per hour across everything currently running. */
export function burnRate(cloud: CloudState): number {
  const compute = cloud.vnodes
    .filter((v) => v.status === "running")
    .reduce((t, v) => t + sizeSpec(v.size).creditsPerHour, 0);
  const storage = cloud.buckets.reduce((t, b) => {
    const tier = BUCKET_TIERS.find((x) => x.id === b.tier);
    return t + b.sizeGb * (tier?.creditsPerGbHour ?? 0);
  }, 0);
  return Math.round((compute + storage) * 100) / 100;
}

/**
 * Budget the desk is expected to work inside. Beyond it the operator is
 * over-provisioning — solving a ticket by throwing High-Spec nodes at it.
 */
export const BUDGET_CREDITS_PER_HOUR = 6;

// ── Hybrid routing ──────────────────────────────────────────────────────────

/** True when `ip` sits inside `cidr`. Handles /8, /16, /24 — enough for us. */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (cidr === PUBLIC_CIDR) return true;
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!base || !Number.isFinite(bits)) return false;
  const octets = Math.floor(bits / 8);
  if (octets === 0) return true;
  return ip.split(".").slice(0, octets).join(".") === base.split(".").slice(0, octets).join(".");
}

export interface RouteResult {
  ok: boolean;
  /** Operator-readable explanation — shown verbatim by the console. */
  reason: string;
  path: string[];
}

/**
 * Can traffic get from an on-prem address to a cloud address (or back)?
 *
 * This is the single source of truth for hybrid reachability: the console's
 * route test and the VPN ticket's win-condition both call it, so what the
 * player sees is exactly what is graded.
 */
export function hybridRoute(cloud: CloudState, fromIp: string, toIp: string): RouteResult {
  const avn = cloud.avns.find((a) => ipInCidr(toIp, a.cidr));
  const fromAvn = cloud.avns.find((a) => ipInCidr(fromIp, a.cidr));

  // Same side of the tunnel — local switching, no VPN involved.
  if ((avn && fromAvn) || (!avn && !fromAvn)) {
    return { ok: true, reason: "Same network segment — routed locally.", path: [fromIp, toIp] };
  }

  const tunnel = cloud.vpn;
  if (tunnel.status !== "connected") {
    return {
      ok: false,
      reason:
        tunnel.status === "negotiating"
          ? "Tunnel is still negotiating — no route yet."
          : "No route to the cloud: the site-to-site tunnel is down.",
      path: [fromIp, "×"],
    };
  }

  const cloudSide = avn ?? fromAvn!;
  if (tunnel.remoteAvnId !== cloudSide.id) {
    return {
      ok: false,
      reason: `Tunnel is bound to a different AVN (${tunnel.remoteAvnId ?? "none"}) — ${cloudSide.id} is not advertised.`,
      path: [fromIp, "×"],
    };
  }

  const onPremIp = avn ? fromIp : toIp;
  if (!ipInCidr(onPremIp, tunnel.localCidr)) {
    return {
      ok: false,
      reason: `${onPremIp} is outside the advertised local network (${tunnel.localCidr}).`,
      path: [fromIp, "×"],
    };
  }

  return {
    ok: true,
    reason: "Encrypted via the site-to-site tunnel.",
    path: [fromIp, "vpn-gw", `${cloudSide.name}`, toIp],
  };
}
