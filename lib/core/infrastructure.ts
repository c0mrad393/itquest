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
import type { ConnectionProtocol, NodeId } from "./nodes";

/** Discriminated union of every node kind. Narrow on `.os`. */
export type TargetNode = LinuxNodeState | WindowsNodeState;

/**
 * A directed reachability edge in the topology. Scenarios toggle `blocked` to
 * model segmentation / firewall drops (e.g. an IDMZ exfil path being cut).
 */
export interface NetworkLink {
  from: NodeId;
  to: NodeId | "internet";
  /** Subnet or gateway the link traverses, e.g. "10.20.4.0/24". */
  via: string;
  latencyMs: number;
  blocked: boolean;
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
  /** Client organization that owns this environment, e.g. "Acme Financial". */
  clientOrg: string;

  /** All target machines, keyed by NodeId. THE authoritative node store. */
  nodes: Record<NodeId, TargetNode>;
  /** Node-to-node (and node-to-internet) reachability graph. */
  links: NetworkLink[];
  /** Connectable endpoints surfaced in the Remote Gateway Manager. */
  gateway: GatewayEntry[];

  loadedAt: number;
}
