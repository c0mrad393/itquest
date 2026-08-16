/**
 * ITQuest — Global Infrastructure State
 * ======================================
 * The single authoritative model of an entire client environment: a map of
 * independently-tracked nodes plus the topology that connects them. This is the
 * store both the CLI and every GUI panel mutate — a change on any node, from
 * any interface, lands here and re-renders every view.
 */

import type { LinuxNodeState } from "./linux";
import type { CascadeState } from "./cascade";
import type { BackupState } from "./backup";
import type { IncidentState } from "./incident";
import type { TrafficState } from "./traffic";
import type { PoeState } from "./poe";
import type { IpamState } from "./ipam";
import type { WindowsNodeState } from "./windows";
import type { MacNodeState } from "./mac";
import type { ConnectionProtocol, NodeId } from "./nodes";
import type { OrganizationProfile } from "./organization";
import type { InventoryState } from "./inventory";
import type { DatacenterState } from "./datacenter";
import type { CloudState } from "./cloud";
import type { GrowthState } from "./growth";
import type { PolicyState } from "./policy";

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
  /**
   * Hosts the operator powered down while they were still carrying live
   * workloads (v0.4.0). Each entry is an outage the business felt, and the
   * reconciler turns it into a critical incident with an SLA cost — the price
   * of skipping the migration step.
   */
  unplannedOutages: UnplannedOutage[];
}

export interface UnplannedOutage {
  nodeId: NodeId;
  hostname: string;
  at: number;
  /** How many business services went down with the host. */
  workloadCount: number;
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
  /** Physical asset store room (AssetManager app). */
  inventory: InventoryState;
  /**
   * The datacenter floor: every rack, and through `RackDevice.nodeId` the
   * physical half of every server in `nodes`. See lib/core/datacenter.ts for
   * why the join is one field and everything else derives from it.
   */
  datacenter: DatacenterState;
  /** AetherCloud tenant: virtual networks, vNodes, storage, VPN and audit. */
  cloud: CloudState;
  /**
   * How big the company is, and how it got there (v0.6.0). Growth is additive:
   * a milestone hires onto this world rather than replacing it.
   */
  growth: GrowthState;
  /**
   * Centralized Fleet Policies (v0.8.0). Estate-wide rather than per-node:
   * a policy is a property of the DOMAIN, and the domain controller that
   * happens to serve it is an implementation detail the operator should not
   * have to think about.
   */
  policy: PolicyState;
  /**
   * Managed PoE switches and what is plugged into them (Build 1). Ports carry
   * the only link to the logical estate; every watt figure derives.
   */
  poe: PoeState;
  /**
   * Address leases and the network fault log (Build 1). Conflicts are NOT
   * stored here — they are derived by detectConflicts() so they cannot go
   * stale against the nodes they describe.
   */
  ipam: IpamState;
  /**
   * Video traffic and the recorder (Builds 2-3). Stores base bitrates, the NVR
   * and link capacities; every load figure and the saturation state derive.
   */
  traffic: TrafficState;
  /**
   * Backup policy, purchased storage and the permanent data-loss record
   * (DR build). Capacity, safety and whether a restore is possible all derive.
   */
  backup: BackupState;
  /**
   * An active ransomware compromise, if any. Stores what happened; the
   * recovery STAGE and whether isolation is in force are derived.
   */
  incident: IncidentState;
  /**
   * Multi-stage cascade faults (QA2). Stores the root cause and the repair
   * progress; every symptom — latency, health, the dead service — derives.
   */
  cascade: CascadeState;

  loadedAt: number;
}
