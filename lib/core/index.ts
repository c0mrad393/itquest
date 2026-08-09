/**
 * TriageOS — Core type layer (barrel)
 * ===================================
 * Single import surface for the whole domain model. Prefer importing from
 * "@/lib/core" so call sites don't couple to file layout.
 *
 * Layer map:
 *   nodes         — shared node identity/connectivity/health (BaseNode)
 *   linux/windows — concrete node shapes
 *   infrastructure— TargetNode union + global InfrastructureState + topology
 *   tickets       — ITSM ticket model + SLA
 *   host          — Level-0 workstation + host app registry (+ HOST_APP_REGISTRY)
 *   state         — SessionState composition root + Progression
 *
 * Re-exports the reused POSIX primitives from lib/vm so there is exactly ONE
 * definition of FsNode / ServiceState / NetworkState / etc. across the app.
 */

export * from "./nodes";
export * from "./linux";
export * from "./windows";
export * from "./mac";
export * from "./endpoint";
export * from "./inventory";
export * from "./rack";
export * from "./datacenter";
export * from "./directory";
export * from "./fileshares";
export * from "./growth";
export * from "./cloud";
export * from "./infrastructure";
export * from "./tickets";
export * from "./host";
export * from "./state";
export * from "./identity";
export * from "./organization";

// Reused primitives (canonical definitions live in lib/vm/types).
export type {
  FsNode,
  FileType,
  PermissionString,
  VMUser,
  ServiceState,
  ServiceStatus,
  ProcessInfo,
  NetInterface,
  Route,
  FirewallRule,
  NetworkState,
  LogEntry,
  LogStore,
  CommandResult,
} from "@/lib/vm/types";
