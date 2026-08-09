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

// ── Workloads (v0.4.0 — the unit that MIGRATES) ─────────────────────────────
//
// A workload is a hosted service considered as a RESOURCE CONSUMER: the thing
// that eats CPU and memory, generates heat, and has to be moved somewhere else
// before its host can be powered down.
//
// Deliberately separate from `LinuxNodeState.services` (systemd units) and
// `WindowsNodeState.services` (SCM entries). Those model the OS plumbing an
// operator pokes at with systemctl or services.msc; a workload models the
// BUSINESS SERVICE that plumbing exists to run. Conflating them would mean
// live-migrating `sshd`, which is nonsense.

export type WorkloadKind = "web" | "database" | "file" | "directory" | "app" | "balancer";

export const WORKLOAD_LABEL: Record<WorkloadKind, string> = {
  web: "Web",
  database: "Database",
  file: "File",
  directory: "Directory",
  app: "Application",
  balancer: "Load balancer",
};

export interface Workload {
  id: string;
  /** Operator-facing name, e.g. "orders-api", "PostgreSQL 15". */
  name: string;
  kind: WorkloadKind;
  /** Steady-state CPU demand as a percentage of ONE core. */
  cpuPct: number;
  /** Resident memory demand in GB. */
  ramGb: number;
  /**
   * Node this workload normally lives on. Set when it is migrated away, so
   * the operator can put the estate back the way they found it.
   */
  homeNodeId?: NodeId;
}

/**
 * Change-control state. `mode` is the operator's declared intent (the node is
 * being worked on); `drainedAt` records when the last workload left. Powering
 * down a node that is not drained is an unplanned outage, and the simulation
 * treats it as one.
 */
export interface MaintenanceState {
  mode: boolean;
  drainedAt: number | null;
}

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
  /**
   * Business services this node hosts. Empty on endpoints — only infrastructure
   * roles carry workloads, and only workloads migrate.
   */
  workloads: Workload[];
  /** Change-control state (v0.4.0). Absent on endpoints. */
  maintenance?: MaintenanceState;
}
