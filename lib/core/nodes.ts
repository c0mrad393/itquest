/**
 * TriageOS — Node primitives (shared base)
 * ========================================
 * Common identity, connectivity, and health shared by every target machine in
 * the simulated infrastructure, regardless of OS. Concrete node shapes
 * (LinuxNodeState / WindowsNodeState) extend `BaseNode` and are unioned into
 * `TargetNode` in `infrastructure.ts`.
 *
 * DESIGN CONTRACT
 *   - All node state is JSON-serializable (persisted to LocalStorage in Phase 6
 *     and, later, Supabase). No class instances, functions, or Dates — epoch
 *     millis only.
 *   - Network reachability, service health, and account state are DATA. Both the
 *     CLI interpreter and the GUI panels are pure views that mutate this data
 *     through the infrastructure store, never the DOM.
 */

import type { NetworkState } from "@/lib/vm/types";

/** Stable identifier for a node, e.g. "prod-nginx-srv", "client-win-01". */
export type NodeId = string;

/** OS discriminant used to narrow the TargetNode union. */
export type NodeOs = "linux" | "windows" | "macos";

/** Functional role — drives iconography, gateway grouping, and scenario logic. */
export type NodeRole =
  | "web-server"
  | "app-server"
  | "database"
  | "load-balancer"
  | "domain-controller"
  | "file-server"
  | "workstation"
  | "firewall"
  | "router"
  | "hypervisor";

/** Remote-access protocol the host uses to reach this node. */
export type ConnectionProtocol = "ssh" | "rdp" | "vnc" | "winrm";

/**
 * Live connection facts. `reachable` = a network path exists from the host;
 * `online` = the node is powered on and responding; `authenticated` = an
 * interactive session has been established. A NetOps fault might set
 * reachable=false; a crashed box sets online=false.
 */
export interface ConnectionState {
  protocol: ConnectionProtocol;
  ip: string;
  port: number;
  reachable: boolean;
  online: boolean;
  requiresCredentials: boolean;
  authenticated: boolean;
  latencyMs: number;
}

export type HealthStatus = "healthy" | "degraded" | "critical" | "offline";

/** Coarse machine telemetry surfaced in the gateway list and node headers. */
export interface NodeHealth {
  status: HealthStatus;
  cpuLoad: number; // percent 0-100
  memUsedPct: number; // percent 0-100
  diskUsedPct: number; // percent 0-100
  uptimeSeconds: number;
}

/**
 * Fields common to every node. The `os` discriminant is declared on the
 * concrete interfaces (as a string literal) so `TargetNode` narrows cleanly.
 */
export interface BaseNode {
  nodeId: NodeId;
  hostname: string;
  /** Human label shown in the Remote Gateway Manager, e.g. "Prod Web (nginx)". */
  displayName: string;
  role: NodeRole;
  /** AD/DNS domain membership, if any (e.g. "corp.internal"). */
  domain?: string;
  connection: ConnectionState;
  /** Interface/route/DNS/firewall state (reused POSIX-style model). */
  network: NetworkState;
  health: NodeHealth;
  tags: string[];
}
