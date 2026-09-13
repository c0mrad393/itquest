/**
 * ITQuest — Ticket presentation helpers (pure)
 * =============================================
 * Shared color/label maps and SLA math used by the Ticket Center list + detail.
 * No JSX here — just data, so it stays trivially testable.
 */

import type { HostAppIconId, Ticket, TicketSeverity, TicketStatus, TicketTrack } from "@/lib/core";

export const TRACK_META: Record<TicketTrack, { label: string; iconId: HostAppIconId; color: string }> = {
  helpdesk: { label: "Helpdesk", iconId: "headset", color: "text-sky-300 bg-sky-500/15 border-sky-500/30" },
  sysadmin: { label: "Sysadmin", iconId: "wrench", color: "text-violet-300 bg-violet-500/15 border-violet-500/30" },
  netops: { label: "NetOps", iconId: "globe", color: "text-teal-300 bg-teal-500/15 border-teal-500/30" },
  secops: { label: "SecOps", iconId: "shield", color: "text-rose-300 bg-rose-500/15 border-rose-500/30" },
};

/**
 * SEVERITY IS A RAMP, so it escalates rather than merely differing.
 *
 * Medium was `amber` and High was `orange`, which the config remaps onto the
 * same family — both rendered `rgb(252, 200, 110)`. Two of the four levels of
 * the queue's primary sorting signal were one colour, and no code review could
 * see it because the names are different words.
 *
 * Grey, amber, red, then SOLID red. Critical is the only entry in the product
 * that fills its chip instead of tinting it: at the point where somebody has
 * to drop what they are doing, the difference should not be a shade.
 */
export const SEVERITY_META: Record<TicketSeverity, { label: string; color: string; dot: string }> = {
  low: { label: "Low", color: "text-gray-300 bg-gray-500/15 border-gray-500/30", dot: "bg-gray-400" },
  medium: { label: "Medium", color: "text-amber-300 bg-amber-500/15 border-amber-500/30", dot: "bg-amber-300" },
  high: { label: "High", color: "text-red-300 bg-red-500/15 border-red-500/40", dot: "bg-red-300" },
  critical: { label: "Critical", color: "text-danger-on bg-danger border-danger font-semibold", dot: "bg-danger" },
};

/**
 * STATUS: THE THREE OPEN STATES HAD TO SEPARATE FIRST.
 *
 * New, Accepted and In Progress were `blue`, `cyan` and `indigo` — three names
 * for one family, all rendering `rgb(130, 183, 255)`. Those are the three
 * states a ticket passes THROUGH while somebody works it, so the entire
 * visible life of a ticket was one colour, on the screen where an operator
 * decides what to pick up next.
 *
 * New and Accepted stay in the same blue and separate by WEIGHT — unclaimed
 * work is quiet, claimed work is not — because they really are two points on
 * one idea and giving them unrelated hues would have said otherwise.
 *
 * In Progress moves to amber, which is where a board conventionally puts work
 * in flight, and leaves blue meaning "waiting for somebody".
 */
export const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  new: { label: "New", color: "text-blue-300 bg-blue-500/10 border border-blue-500/25" },
  accepted: { label: "Accepted", color: "text-blue-300 bg-blue-500/30 border border-blue-500/60" },
  in_progress: { label: "In Progress", color: "text-amber-300 bg-amber-500/15" },
  escalated: { label: "Escalated", color: "text-fuchsia-300 bg-fuchsia-500/15" },
  resolved: { label: "Resolved", color: "text-emerald-300 bg-emerald-500/15" },
  breached: { label: "Breached", color: "text-red-300 bg-red-500/25 font-semibold" },
  closed: { label: "Closed", color: "text-gray-400 bg-gray-500/15" },
};

/** "5m ago", "2h ago", "3d ago" from an epoch-ms timestamp. */
export function relativeTime(ts: number, from = Date.now()): string {
  const s = Math.max(0, Math.floor((from - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Format seconds as a compact SLA duration, e.g. "2h 00m", "15m". */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

/**
 * Static SLA snapshot for the Phase-2 frame (no live tick yet). Computes the
 * resolution deadline from acceptance (or creation) + policy, and how much is
 * left right now. Phase 5 replaces `now` with a live clock.
 */
export function slaSnapshot(ticket: Ticket, now = Date.now()) {
  const anchor = ticket.clock.startedAt ?? ticket.createdAt;
  const deadline = anchor + ticket.sla.resolutionSeconds * 1000;
  const remainingSec = Math.floor((deadline - now) / 1000);
  const breached = remainingSec < 0 || ticket.clock.resolutionBreached;
  const total = ticket.sla.resolutionSeconds;
  const usedPct = Math.min(100, Math.max(0, ((total - remainingSec) / total) * 100));
  return {
    deadline,
    remainingSec,
    breached,
    usedPct,
    label: breached ? "SLA breached" : `${formatDuration(remainingSec)} left`,
  };
}
