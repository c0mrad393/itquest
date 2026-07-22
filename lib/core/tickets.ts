/**
 * TriageOS — Ticket model (ITSM)
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

  clientOrg: string;
  requester: TicketRequester;

  /** Nodes this incident touches (for gateway highlighting + win-checks). */
  targetNodeIds: NodeId[];
  /** Scenario that injects the fault and defines the win-condition. */
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
  escalationCount: number;
}
