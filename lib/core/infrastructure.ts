/**
 * TriageOS — Global Infrastructure State
 * ======================================
 * The single authoritative model of an entire client environment: a map of
 * independently-tracked nodes plus the topology that connects them. This is the
 * store both the CLI and every GUI panel mutate — a change on any node, from
 * any interface, lands here and re-renders every view.
 */

import type { LinuxNodeState } from "./linux";
import type { WindowsNodeState } from "./windows";
import type { MacNodeState } from "./mac";
import type { ConnectionProtocol, NodeId } from "./nodes";
import type { OrganizationProfile } from "./organization";

/** Discriminated union of every node kind. Narrow on `.os`. */
export type TargetNode = LinuxNodeState | WindowsNodeState | MacNodeState;

/**
 * A live edge in the network graph. Metrics evolve in real time (NetworkEngine
 * tick) and the PLAYER can mutate the graph: re-route a link onto a different
 * subnet, deploy a software firewall, or block it outright — trading latency,
 * utilization, and packet loss against each other to keep nodes healthy.
 */
export interface NetworkLink {
  id: string; // "lnk-1"
  from: NodeId;
  to: NodeId | "internet";
  /** Subnet the link traverses, e.g. "10.20.4.0/24" (player re-routable). */
  via: string;
  latencyMs: number;
  /** Link capacity. */
  bandwidthMbps: number;
  /** Live utilization 0-100 (random-walks; congests above ~85%). */
  utilizationPct: number;
  /** Live loss 0-100 — the health signal players optimize against. */
  packetLossPct: number;
  blocked: boolean;
  /** Player-deployed software firewall: +latency, dampens loss spikes. */
  softwareFirewall: boolean;
}

/** Subnets available for re-routing, generated per org. */
export interface SubnetDef {
  cidr: string; // "10.44.2.0/24"
  label: string; // "Core VLAN", "DMZ", "User VLAN 2"
}

/**
 * Incident-response state the operator mutates to resolve Security/NetOps
 * tickets: edge-router IP blocks, node isolation, flagged phishing domains,
 * and one-shot remediation flags. Win-conditions read these.
 */
export interface SecurityState {
  /** IPs blocked at the edge router (SecOps: block attacker / C2). */
  blockedIps: string[];
  /** Nodes isolated from the topology (ransomware containment). */
  isolatedNodeIds: NodeId[];
  /** Sender domains flagged as malicious (phishing triage). */
  flaggedDomains: string[];
  /** Service-account credentials rotated (APT remediation). */
  credentialsRotated: boolean;
  /** Resolver re-pointed to the correct primary DC (DNS hijack). */
  dnsFixed: boolean;
  /** Nodes whose logs have been rotated/cleaned (disk saturation). */
  logsRotated: NodeId[];
  /** Bulk onboarding batch imported successfully. */
  onboardingComplete: boolean;
  /** Nodes whose hardware was replaced + field-dispatched (Hardware Lab). */
  hardwareReplaced: NodeId[];
}

/** A row in the Level-0 Remote Gateway Manager. */
export interface GatewayEntry {
  nodeId: NodeId;
  label: string;
  protocol: ConnectionProtocol;
  ip: string;
  reachable: boolean;
  requiresVpn?: boolean;
}

export interface InfrastructureState {
  /** The scenario currently loaded into this infrastructure, if any. */
  scenarioId: string | null;
  /** Display name of the org (mirror of org.name for convenience). */
  clientOrg: string;
  /** The procedurally generated organization that owns this world. */
  org: OrganizationProfile;

  /** All target machines, keyed by NodeId. THE authoritative node store. */
  nodes: Record<NodeId, TargetNode>;
  /** Live network graph (player-mutable; metrics evolve in real time). */
  links: NetworkLink[];
  /** Subnets available for link re-routing. */
  subnets: SubnetDef[];
  /** Connectable endpoints surfaced in the Remote Gateway Manager. */
  gateway: GatewayEntry[];
  /** Incident-response actions the operator has taken. */
  security: SecurityState;

  loadedAt: number;
}
