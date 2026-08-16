/**
 * ITQuest — Ticket model (ITSM)
 * ==============================
 * The unit of work. A ticket binds a narrative (requester + persona + SLA) to a
 * technical scenario running on one or more nodes of the InfrastructureState.
 * Resolution is judged by the scenario's win-condition against node state — not
 * by the ticket itself — so the fix method (CLI vs GUI) is irrelevant.
 */

import type { NodeId } from "./nodes";

export type TicketTrack = "helpdesk" | "sysadmin" | "netops" | "secops";
export type TicketSeverity = "low" | "medium" | "high" | "critical";
export type TicketPriority = "P1" | "P2" | "P3" | "P4";

/** The four content domains of the ticket matrix. */
export type TicketCategory =
  | "Identity & Access"
  | "Network & Routing"
  | "System & Web Services"
  | "Security & Incident";

/** Difficulty tier — drives SLA duration, XP, and starting persona emotion. */
export type TicketDifficulty =
  | "Tier_1_Easy"
  | "Tier_2_Medium"
  | "Tier_3_Hard"
  /** Expert: multi-system incidents, typically spanning on-prem and cloud. */
  | "Tier_4_Expert";

/** How a ticket enters the world. Tier 2/3 start mail-only in CoreMail. */
export type TicketOrigin = "dashboard" | "mail";

/**
 * References to the procedurally generated assets a ticket concerns, so its
 * text and win-condition line up with the specific company profile.
 */
export interface TicketDynamicContext {
  targetUserId?: string; // samAccountName
  targetUserName?: string; // display name
  targetHostname?: string;
  targetNodeId?: NodeId;
  serviceName?: string;
  maliciousIp?: string; // attacker / C2 address
  affectedVlan?: string; // subnet CIDR
  linkId?: string; // NetworkLink id
  senderDomain?: string; // phishing origin
  department?: string;
  // ── Active Directory administration (ADUC tickets) ──
  /** Temporary password the operator must set via ADUC → Reset Password. */
  tempPassword?: string;
  /** Logon name of an account the operator must CREATE (onboarding). */
  newUserSam?: string;
  /** Display name for the account to create. */
  newUserName?: string;
  /** Job title the operator must set on the target/new account. */
  targetTitle?: string;
  /** Security group the operator must ADD the account to. */
  targetGroup?: string;
  /** Department (and its groups) the operator must move the account OUT of. */
  fromDepartment?: string;
  // ── Rack & network lab ──
  /** Static IPv4 the operator must configure on the racked server. */
  rackIpv4?: string;
  /** Subnet mask required alongside `rackIpv4`. */
  rackNetmask?: string;
  /** VLAN id that must exist and be assigned on the switch. */
  rackVlanId?: number;
  /** Switch interface that must carry `rackVlanId`. */
  rackPort?: string;
  /** Human label for the rack an incident names, e.g. "Rack B". */
  rackName?: string;
  // ── Directory & file shares (v0.5.0) ──
  /** Share the request is about. */
  shareId?: string;
  /** The host serving the affected share — the one that gets restored. */
  serverHostname?: string;
  serverNodeId?: NodeId;
  shareName?: string;
  sharePath?: string;
  /** Access level the requester must end up with. */
  accessLevel?: "read" | "change" | "full";
}

export type TicketStatus =
  | "new" // arrived, unaccepted
  | "accepted" // picked up (starts response clock)
  | "in_progress" // actively being worked
  | "escalated" // bumped to another tier / manager
  | "resolved" // win-condition met
  | "breached" // SLA missed
  | "closed"; // archived after resolution

/** Contractual SLA targets in seconds from acceptance. */
export interface SlaPolicy {
  responseSeconds: number;
  resolutionSeconds: number;
}

/** Live SLA timing state for one ticket instance. */
export interface SlaClock {
  startedAt: number | null; // acceptance time
  respondedAt: number | null; // first customer contact
  resolvedAt: number | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

export interface TicketRequester {
  name: string;
  role: string; // "Finance Manager"
  email: string;
  department?: string;
}

export interface Ticket {
  id: string;
  /** Display code, e.g. "TCK-4821". */
  code: string;
  title: string;
  description: string;

  track: TicketTrack;
  severity: TicketSeverity;
  priority: TicketPriority;
  status: TicketStatus;

  // ── Matrix classification (procedural content engine) ──
  category: TicketCategory;
  difficulty: TicketDifficulty;
  /** Explicit resolution SLA in seconds (mirrors sla.resolutionSeconds). */
  slaDuration: number;
  /** The matrix template this ticket was minted from. */
  templateId: string;
  /** Procedurally generated asset references bound into title/description/win. */
  dynamicContext: TicketDynamicContext;
  origin: TicketOrigin;
  /** Tier 2/3 mail tickets: true until promoted from CoreMail to the dashboard. */
  mailOnly: boolean;

  clientOrg: string;
  requester: TicketRequester;

  /** Nodes this incident touches (for gateway highlighting + win-checks). */
  targetNodeIds: NodeId[];
  /**
   * Legacy alias of `templateId` — the reconciler resolves win-conditions via
   * the ticket matrix keyed by this id. Kept for dialogue-tree lookups.
   */
  scenarioId: string;
  /** AI persona driving the dialogue for this ticket. */
  personaId: string;

  sla: SlaPolicy;
  clock: SlaClock;

  createdAt: number;
  assignee?: string;
  tags: string[];

  /** Base XP awarded on clean, in-SLA resolution (modified by performance). */
  xpReward: number;
  /** Step-by-step resolution guidance, revealed one step at a time. */
  hints?: string[];
  /**
   * How many hint steps the operator has spent on this ticket. Each one costs
   * a share of `xpReward` at resolution (see lib/scenario/scoring.ts) — the
   * count lives on the ticket so the penalty survives a reload.
   */
  hintsRevealed: number;
  /**
   * Closed by paying an external contractor rather than by fixing it. Carries
   * no XP — the work was bought, not done.
   */
  outsourced?: boolean;
  /**
   * Hard Mode: the operator has committed to solving without guidance, so the
   * hint panel is hidden entirely and full XP is guaranteed. Reversible until
   * the first hint is spent — after that `hintsRevealed` already stands.
   */
  hardMode: boolean;
  /**
   * A company project rather than a service request (v0.6.0). Cannot be
   * outsourced or escalated away — the milestone that created it is the
   * business deciding, not the service desk being asked.
   */
  mandatory?: boolean;
  escalationCount: number;
}
