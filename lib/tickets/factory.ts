/**
 * TriageOS — Ticket Factory
 * =========================
 * Turns matrix templates into concrete, world-bound tickets. For each template
 * it binds a TicketDynamicContext (random AD user, hostname, VLAN, attacker IP),
 * renders dynamic title/description/requester, assigns the persona, and derives
 * SLA + difficulty. Tier 2/3 tickets are minted mail-only (they surface to the
 * ITSM board after the operator promotes them from CoreMail).
 *
 * `generateTicketQueue` also returns the world faults each template injects, so
 * the caller can apply them to the infra store (only on fresh worlds; hydration
 * restores both stores from the save).
 */

import type { InfrastructureState, Ticket } from "@/lib/core";
import { mulberry32, shuffle, type Rng } from "@/lib/org/rng";
import { TICKET_TEMPLATES, type EmailBeat, type TicketTemplate } from "./matrix";

let ticketSeq = 4820;

/** Build one ticket from a template + bound context. Returns null if unhostable. */
export function buildTicket(
  template: TicketTemplate,
  infra: InfrastructureState,
  rng: Rng,
): { ticket: Ticket; emails: EmailBeat[]; injectFault?: (draft: InfrastructureState) => void } | null {
  const ctx = template.makeContext(infra, rng);
  if (!ctx) return null;

  const org = infra.org;
  const code = `TCK-${ticketSeq++}`;
  const mailOnly = template.origin === "mail";

  const ticket: Ticket = {
    id: `t-${template.id}-${code}`,
    code,
    title: template.title(ctx, org),
    description: template.description(ctx, org),
    track: template.track,
    severity: template.severity,
    priority: template.priority,
    status: "new",
    category: template.category,
    difficulty: template.difficulty,
    slaDuration: template.slaDuration,
    templateId: template.id,
    dynamicContext: ctx,
    origin: template.origin,
    mailOnly,
    clientOrg: org.name,
    requester: template.requester(ctx, org),
    targetNodeIds: ctx.targetNodeId ? [ctx.targetNodeId] : [],
    scenarioId: template.id, // reconciler keys win-conditions off this
    personaId: template.personaId,
    sla: { responseSeconds: template.responseSeconds, resolutionSeconds: template.slaDuration },
    clock: { startedAt: null, respondedAt: null, resolvedAt: null, responseBreached: false, resolutionBreached: false },
    createdAt: Date.now() - 1000 * 60 * (template.difficulty === "Tier_3_Hard" ? 4 : 12),
    tags: template.tags,
    xpReward: template.xpReward,
    escalationCount: 0,
  };

  const emails = template.emailThread ? template.emailThread(ctx, org) : [];
  return {
    ticket,
    emails,
    injectFault: template.injectFault ? (draft) => template.injectFault!(draft, ctx) : undefined,
  };
}

export interface GeneratedQueue {
  tickets: Ticket[];
  /** Escalating CoreMail threads keyed by ticket id (Tier 2/3). */
  emailThreads: Record<string, EmailBeat[]>;
  /** Deterministic world faults to apply to the infra store on a fresh world. */
  faults: ((draft: InfrastructureState) => void)[];
}

/**
 * Generate a diverse starter queue: one guaranteed Tier-1 from each of the four
 * categories, plus a random spread of higher-tier tickets — all bound to the
 * given world.
 */
export function generateTicketQueue(infra: InfrastructureState): GeneratedQueue {
  ticketSeq = 4820;
  const rng = mulberry32((infra.org.seed ^ 0x71c) >>> 0);

  const byTier = (tier: string) =>
    Object.values(TICKET_TEMPLATES).filter((t) => t.difficulty === tier);

  // Guaranteed spread: all four Tier-1s + 2 Tier-2s + 2 Tier-3s.
  const chosen: TicketTemplate[] = [
    ...byTier("Tier_1_Easy"),
    ...shuffle(rng, byTier("Tier_2_Medium")).slice(0, 2),
    ...shuffle(rng, byTier("Tier_3_Hard")).slice(0, 2),
  ];

  const tickets: Ticket[] = [];
  const emailThreads: Record<string, EmailBeat[]> = {};
  const faults: ((draft: InfrastructureState) => void)[] = [];

  for (const template of chosen) {
    const built = buildTicket(template, infra, rng);
    if (!built) continue;
    tickets.push(built.ticket);
    if (built.emails.length) emailThreads[built.ticket.id] = built.emails;
    if (built.injectFault) faults.push(built.injectFault);
  }

  return { tickets, emailThreads, faults };
}

/** Apply a queue's faults to a draft infra (structuredClone'd by the caller). */
export function applyQueueFaults(infra: InfrastructureState, faults: GeneratedQueue["faults"]): InfrastructureState {
  const draft = structuredClone(infra);
  for (const f of faults) f(draft);
  return draft;
}
