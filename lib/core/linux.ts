/**
 * ITQuest — Linux node model
 * ===========================
 * A simulated Linux instance (web servers, app servers, DBs). Reuses the proven
 * POSIX primitives from `lib/vm/types` so the existing CLI interpreter and
 * command set migrate onto it mechanically in Phase 4 (the current top-level
 * VMState fields map 1:1 onto `LinuxNodeState`).
 */

import type { BaseNode } from "./nodes";
import type {
  FsNode,
  LogStore,
  ProcessInfo,
  ServiceState,
  VMUser,
} from "@/lib/vm/types";

/** Installed package (apt/yum) — powers `dpkg -l`, dependency/version faults. */
export interface PackageInfo {
  name: string;
  version: string;
  status: "installed" | "held" | "broken";
}

/**
 * Per-terminal interactive shell context. Each open terminal window binds one
 * session; the underlying filesystem/services/etc. are shared node state.
 */
export interface LinuxSession {
  cwd: string;
  user: string;
  env: Record<string, string>;
  /** Command-line recall history for this session. */
  history: string[];
}

export interface LinuxNodeState extends BaseNode {
  os: "linux";
  distro: string; // "Ubuntu 22.04.3 LTS"
  kernel: string; // "5.15.0-91-generic"

  filesystem: FsNode; // root "/" node
  users: VMUser[];
  services: Record<string, ServiceState>; // systemd units
  processes: ProcessInfo[];
  logs: LogStore; // keyed by absolute path
  packages: PackageInfo[];

  /** Default session cloned for each new terminal opened against this node. */
  session: LinuxSession;

  /** Monotonic pid allocator so new processes/services get unique pids. */
  nextPid: number;
}
