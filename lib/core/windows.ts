/**
 * ITQuest — Windows node model
 * =============================
 * A simulated Windows 11 workstation or Windows Server, including the
 * enterprise-management surfaces the GUI panels drive: Active Directory
 * (ADUC), Group Policy (GPMC), Windows Services (services.msc), the registry,
 * Windows Firewall, and event logs.
 *
 * These are modeled on the real objects so troubleshooting transfers: an AD
 * account has badPwdCount + locked; a GPO links to OUs; a service has a startup
 * type and dependencies.
 */

import type { BaseNode } from "./nodes";
import type { FsNode, ProcessInfo } from "@/lib/vm/types";
import type { EndpointVisualState, MappedDrive } from "./endpoint";

// ── Active Directory (ADUC) ────────────────────────────────────────────────

export interface OrganizationalUnit {
  /** Distinguished name, e.g. "OU=Finance,DC=corp,DC=internal". */
  dn: string;
  name: string;
  parentDn?: string;
}

export interface ADUser {
  sid: string;
  samAccountName: string; // "j.doe"
  upn: string; // "j.doe@corp.internal"
  displayName: string;
  /** Job title, e.g. "Accounts Payable Specialist". */
  title: string;
  /** Department (doubles as the OU grouping in generated orgs). */
  department: string;
  /** Corporate mailbox address. */
  email: string;
  /** Containing OU distinguished name. */
  ou: string;
  /** Group membership by samAccountName. */
  memberOf: string[];
  /**
   * Reporting line, by samAccountName (v0.8.0). Onboarding requests name a
   * manager, and an org chart with holes in it is how leavers get missed.
   */
  manager?: string;
  enabled: boolean;
  locked: boolean;
  passwordExpired: boolean;
  mustChangePassword: boolean;
  /** Failed sign-in counter; lockout scenarios read this. */
  badPwdCount: number;
  lastLogon: number | null;
  /** Password expiry timestamp (epoch millis); null = never expires. */
  passwordExpiresAt: number | null;
  /**
   * SIMULATED password, only ever set by the in-game ADUC "Reset Password"
   * dialog. This is mock directory data for ticket win-conditions — it is not a
   * credential store and never leaves the local save.
   */
  password?: string;
  /** When an admin last set the password via ADUC (epoch millis). */
  passwordLastSet?: number;
  /** Node id of this user's assigned endpoint (drives ADUC Remote Connect). */
  assignedNodeId?: string;
  description?: string;
}

/** Derived account state shown in ADUC. */
export type ADAccountStatus = "Active" | "Locked" | "Disabled";

export function adAccountStatus(u: ADUser): ADAccountStatus {
  if (!u.enabled) return "Disabled";
  if (u.locked) return "Locked";
  return "Active";
}

export type ADGroupScope = "DomainLocal" | "Global" | "Universal";
export type ADGroupCategory = "Security" | "Distribution";

export interface ADGroup {
  sid: string;
  name: string; // "IT-Admins"
  scope: ADGroupScope;
  category: ADGroupCategory;
  /** Member samAccountNames (users and/or nested groups). */
  members: string[];
  description?: string;
}

export interface ADComputer {
  name: string; // "CLIENT-WIN-01"
  dn: string;
  enabled: boolean;
  os: string; // "Windows 11 Pro"
  lastLogon: number | null;
}

export interface ActiveDirectoryState {
  domainDns: string; // "corp.internal"
  netbios: string; // "CORP"
  functionalLevel: string; // "2016"
  ous: OrganizationalUnit[];
  users: ADUser[];
  groups: ADGroup[];
  computers: ADComputer[];
}

// ── Group Policy (GPMC) ────────────────────────────────────────────────────

export interface GpoSetting {
  /** Grouping, e.g. "Account Lockout Policy", "Windows Firewall". */
  category: string;
  key: string; // "AccountLockoutThreshold"
  value: string | number | boolean;
  /** For compliance scenarios (NIST/ISO) — is this setting compliant? */
  compliant?: boolean;
}

export interface GPO {
  guid: string;
  name: string; // "Default Domain Policy"
  enabled: boolean;
  enforced: boolean;
  /** OU distinguished names this GPO is linked to. */
  linkedOus: string[];
  scope: "Computer" | "User" | "Both";
  settings: GpoSetting[];
}

export interface GroupPolicyState {
  gpos: GPO[];
}

// ── Windows Services (services.msc) ────────────────────────────────────────

export type WindowsServiceStatus =
  | "Running"
  | "Stopped"
  | "Paused"
  | "StartPending"
  | "StopPending";

export type WindowsStartupType =
  | "Automatic"
  | "AutomaticDelayed"
  | "Manual"
  | "Disabled";

export interface WindowsService {
  name: string; // "W32Time"
  displayName: string; // "Windows Time"
  status: WindowsServiceStatus;
  startupType: WindowsStartupType;
  logOnAs: string; // "LocalSystem"
  pid: number | null;
  description?: string;
  /** Service short-names this one depends on. */
  dependencies: string[];
}

// ── Registry ───────────────────────────────────────────────────────────────

export type RegistryHive = "HKLM" | "HKCU" | "HKCR" | "HKU" | "HKCC";
export type RegistryValueType =
  | "REG_SZ"
  | "REG_DWORD"
  | "REG_QWORD"
  | "REG_BINARY"
  | "REG_MULTI_SZ"
  | "REG_EXPAND_SZ";

export interface RegistryValue {
  name: string; // "" = (Default)
  type: RegistryValueType;
  data: string | number;
}

export interface RegistryKey {
  hive: RegistryHive;
  path: string; // "SYSTEM\\CurrentControlSet\\Services\\Dnscache"
  values: RegistryValue[];
}

export type RegistryState = RegistryKey[];

// ── Windows Firewall (Control Panel) ───────────────────────────────────────

export type FirewallProfile = "Domain" | "Private" | "Public";

export interface WindowsFirewallRule {
  name: string;
  direction: "Inbound" | "Outbound";
  action: "Allow" | "Block";
  protocol: "TCP" | "UDP" | "Any";
  localPort?: number | "Any";
  profiles: FirewallProfile[];
  enabled: boolean;
  program?: string;
}

export interface WindowsFirewallState {
  /** Per-profile on/off state (Windows Defender Firewall). */
  profiles: Record<FirewallProfile, { enabled: boolean }>;
  rules: WindowsFirewallRule[];
}

// ── Event Logs ─────────────────────────────────────────────────────────────

export type EventLogChannel = "System" | "Application" | "Security" | "Setup";
export type EventLevel = "Information" | "Warning" | "Error" | "Critical";

export interface WindowsEventEntry {
  ts: number;
  channel: EventLogChannel;
  level: EventLevel;
  eventId: number;
  source: string; // "Service Control Manager"
  message: string;
}

export type WindowsEventLogs = Record<EventLogChannel, WindowsEventEntry[]>;

// ── Local (non-domain) accounts & sessions ─────────────────────────────────

export interface WindowsLocalUser {
  name: string;
  fullName?: string;
  enabled: boolean;
  groups: string[]; // "Administrators", "Users"
  sid: string;
}

export interface WindowsLogonSession {
  user: string;
  sessionId: number;
  state: "Active" | "Disconnected";
  logonType: string; // "Interactive", "RemoteInteractive"
}

// ── The Windows node ───────────────────────────────────────────────────────

export interface WindowsNodeState extends BaseNode {
  os: "windows";
  edition: string; // "Windows 11 Pro" / "Windows Server 2022 Standard"
  build: string; // "22631.4317"
  isDomainController: boolean;

  filesystem: FsNode; // NTFS tree; drives mapped as top-level children (C:, D:)
  services: Record<string, WindowsService>;
  /** Live process table — Task Manager ends tasks from here. */
  processes: ProcessInfo[];
  registry: RegistryState;
  firewall: WindowsFirewallState;
  eventLogs: WindowsEventLogs;
  localUsers: WindowsLocalUser[];
  sessions: WindowsLogonSession[];

  /** Present on domain controllers / when this node hosts AD management. */
  activeDirectory?: ActiveDirectoryState;
  /** Present when GPMC is available on this node. */
  groupPolicy?: GroupPolicyState;

  /**
   * What was physically fitted, for a machine built on the PC bench.
   *
   * The commissioning doc has always promised these are "read off what was
   * physically fitted" — they were passed in and then dropped on the floor,
   * so a machine handed over with one stick of RAM was indistinguishable
   * from a correctly built one. Recording them is what lets a build ticket
   * grade the SPEC and not merely the fact that something appeared.
   *
   * Optional: only bench-built nodes carry it.
   */
  benchSpec?: { cpuModel: string; ramGb: number; diskGb: number };

  /** Procedural presentation (wallpaper/theme/desktop) — endpoints only. */
  visualState?: EndpointVisualState;
  /** Mapped network drives (This PC → Network Locations). */
  mappedDrives?: MappedDrive[];

  nextPid: number;
}
