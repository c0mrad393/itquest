/**
 * TriageOS — Virtual Machine State Model
 * ---------------------------------------
 * This is the authoritative, shared model of a single simulated host.
 *
 * ARCHITECTURAL CONTRACT:
 *   - The CLI interpreter and the GUI window-manager are two VIEWS onto this
 *     one object. Neither owns it. A mutation from the terminal (e.g. `systemctl
 *     start nginx`) and a mutation from the GUI (e.g. clicking "Start" in the
 *     Services panel) must produce identical VMState transitions.
 *   - The scenario win-condition is evaluated against this object, so HOW the
 *     user reaches a healthy state is irrelevant — only the resulting state is.
 *   - It must be JSON-serializable (persisted to `ticket_sessions.vm_state`).
 *     => no class instances, no functions, no Dates (use epoch millis).
 */

// ────────────────────────────────────────────────────────────────────────────
// Filesystem
// ────────────────────────────────────────────────────────────────────────────

export type FileType = "file" | "dir" | "symlink";

/** POSIX-style permission triad, e.g. "rwxr-xr-x". Windows scenarios map ACLs onto this. */
export type PermissionString = string;

export interface FsNode {
  type: FileType;
  /** File contents. Undefined for dirs. Large/binary files use `binary: true` + omit content. */
  content?: string;
  /** Directory children, keyed by basename. Undefined for files. */
  children?: Record<string, FsNode>;
  /** Symlink target (absolute or relative path). Only for type === "symlink". */
  target?: string;
  owner: string;
  group: string;
  mode: PermissionString;
  /** Marks non-text files so `cat` refuses / shows "binary file". */
  binary?: boolean;
  /** Hidden from default `ls` unless -a (also true for dotfiles by convention). */
  hidden?: boolean;
  mtime: number; // epoch millis
}

// ────────────────────────────────────────────────────────────────────────────
// Identity & Access (local accounts + simulated Active Directory)
// ────────────────────────────────────────────────────────────────────────────

export interface VMUser {
  username: string;
  uid: number;
  /** Primary + supplementary groups. Group membership drives AD/GPO scenarios. */
  groups: string[];
  home: string;
  shell: string;
  /** Account lockout — the classic Tier-1 AD unlock scenario. */
  locked: boolean;
  /** Failed auth counter; brute-force / lockout scenarios read this. */
  failedLogins: number;
  /** Domain vs. local. "domain" accounts appear in the AD console GUI. */
  scope: "local" | "domain";
  /** Simulated password-expiry flag for reset scenarios. */
  passwordExpired?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Services (systemd-like on Linux / Service Control Manager on Windows)
// ────────────────────────────────────────────────────────────────────────────

export type ServiceStatus =
  | "active" // running & healthy
  | "inactive" // stopped, clean
  | "failed" // crashed / exited non-zero
  | "activating"
  | "deactivating";

export interface ServiceState {
  name: string; // e.g. "nginx", "docker", "postgresql"
  status: ServiceStatus;
  /** Whether it comes up on boot (systemctl enable). */
  enabled: boolean;
  /** PID when active, else null. */
  pid: number | null;
  /** Human-readable last log line surfaced by `systemctl status`. */
  lastMessage?: string;
  /** Ports this service binds when active — drives `ss`/`netstat` output. */
  ports?: number[];
  /**
   * Config file path this service reads on (re)start. Scenario faults often
   * live here: a broken directive keeps the service in "failed" until fixed.
   */
  configPath?: string;
  /** If set, service refuses to reach "active" until predicate is satisfied. */
  requiresHealthy?: string[]; // names of other services (dependency graph)
}

// ────────────────────────────────────────────────────────────────────────────
// Processes
// ────────────────────────────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  ppid: number;
  user: string;
  command: string;
  cpu: number; // percent
  mem: number; // percent
  state: "R" | "S" | "D" | "Z" | "T"; // running/sleeping/uninterruptible/zombie/stopped
}

// ────────────────────────────────────────────────────────────────────────────
// Networking (NetOps track)
// ────────────────────────────────────────────────────────────────────────────

export interface NetInterface {
  name: string; // eth0, en0, Ethernet0
  /** Administrative up/down — the GUI network-adapter toggle flips this. */
  up: boolean;
  ipv4?: string;
  netmask?: string;
  mac: string;
  /** Link-layer connected (cable/wifi). Distinct from admin `up`. */
  carrier: boolean;
}

export interface Route {
  destination: string; // "default" or CIDR
  gateway: string;
  iface: string;
  metric: number;
}

export interface FirewallRule {
  id: string;
  chain: "INPUT" | "OUTPUT" | "FORWARD";
  action: "ACCEPT" | "DROP" | "REJECT";
  protocol: "tcp" | "udp" | "icmp" | "any";
  port?: number;
  source?: string; // CIDR or "any"
  destination?: string;
  enabled: boolean;
}

export interface NetworkState {
  interfaces: NetInterface[];
  routes: Route[];
  /** Resolver config — DNS-propagation & misconfig scenarios mutate this. */
  dnsServers: string[];
  /** Static resolution map used by nslookup/dig/ping BEFORE dnsServers. */
  hostsTable: Record<string, string>;
  firewall: FirewallRule[];
  /**
   * Simulated reachability of remote hosts. The interpreter derives ping/curl
   * results from: interface up + route present + firewall allows + this map.
   */
  reachableHosts: Record<
    string,
    { ip: string; latencyMs: number; open: number[] /* open ports */ }
  >;
}

// ────────────────────────────────────────────────────────────────────────────
// Logs (Log & Database Viewer + `grep`/`tail` from the CLI)
// ────────────────────────────────────────────────────────────────────────────

export interface LogEntry {
  ts: number;
  /** Rendered line as it appears in the file (already formatted per log type). */
  line: string;
  severity?: "info" | "warn" | "error" | "critical";
}

/** Keyed by absolute path, e.g. "/var/log/nginx/error.log", "/var/log/auth.log". */
export type LogStore = Record<string, LogEntry[]>;

// ────────────────────────────────────────────────────────────────────────────
// The VM
// ────────────────────────────────────────────────────────────────────────────

export interface VMState {
  vmId: string;
  hostname: string;
  os: "linux" | "windows";
  kernel: string;
  /** Current shell prompt context. */
  cwd: string;
  currentUser: string;
  env: Record<string, string>;

  filesystem: FsNode; // root node ("/")
  users: VMUser[];
  services: Record<string, ServiceState>;
  processes: ProcessInfo[];
  network: NetworkState;
  logs: LogStore;

  /** Monotonic pid allocator so new processes/services get unique pids. */
  nextPid: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Command execution result — what the interpreter returns per command
// ────────────────────────────────────────────────────────────────────────────

export interface CommandResult {
  /** stdout/stderr already rendered as terminal text (may contain ANSI). */
  output: string;
  /** POSIX exit code. 0 = success. Scoring & dialogue can key off this. */
  exitCode: number;
  /** True if this command mutated VMState (drives persistence & win-check). */
  mutated: boolean;
  /** Optional structured signal for the scenario engine (e.g. "cleared-cache"). */
  event?: { type: string; payload?: unknown };
}
