/**
 * TriageOS — Root session state (composition root)
 * ================================================
 * Ties the layers together into the single object the app persists and hydrates.
 * The scenario, dialogue, and gamification ENGINES arrive in Phases 5–6; here we
 * declare only the state shapes they read/write, so the store contract is stable
 * from the start.
 */

import type { HostWorkstationState } from "./host";
import type { InfrastructureState } from "./infrastructure";
import type { Ticket } from "./tickets";

/** Player progression snapshot (fully fleshed out with the engine in Phase 6). */
export interface Progression {
  xp: number;
  level: number;
  ticketsResolved: number;
  slaBreaches: number;
  escalations: number;
  /** Consecutive in-SLA resolutions — feeds streak bonuses. */
  streak: number;
}

/** Which workspace the operator is currently looking at. */
export interface FocusState {
  /** Open host-app windows and open remote sessions are managed by the desktop
   *  store; this records the ticket the operator is actively working. */
  activeTicketId: string | null;
  /** NodeId of the remote session in the foreground, if any. */
  activeNodeId: string | null;
}

/**
 * The complete, serializable session. Phase 6 writes this to LocalStorage and,
 * later, syncs to Supabase.
 */
export interface SessionState {
  version: number; // schema version for migrations
  host: HostWorkstationState;
  infrastructure: InfrastructureState;
  tickets: Ticket[];
  progression: Progression;
  focus: FocusState;
  savedAt: number;
}
