/**
 * ITQuest — Ticket Factory
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
import { generateProceduralTemplates } from "./procedural";
import { unlockedTiers, templateMinLevel } from "@/lib/progression/unlocks";

/**
 * The full library for a world: hand-authored set-pieces plus the procedural
 * catalogue. Cached per seed because the reconciler resolves win-conditions by
 * looking templates up here on every infra change — rebuilding 100+ closures
 * on each tick would be wasteful.
 */
let libraryCache: { seed: number; templates: Record<string, TicketTemplate> } | null = null;

export function ticketLibrary(infra: InfrastructureState): Record<string, TicketTemplate> {
  if (libraryCache?.seed === infra.org.seed) return libraryCache.templates;
  const rng = mulberry32((infra.org.seed ^ 0x9e37) >>> 0);
  const templates = { ...TICKET_TEMPLATES, ...generateProceduralTemplates(rng) };
  libraryCache = { seed: infra.org.seed, templates };
  return templates;
}

/**
 * THE TICKET NUMBER, AND WHY IT HAS TO BE TOLD WHERE IT IS.
 *
 * This was a bare module variable, which means it reset to the base on every
 * page load while the SAVE kept the codes it had already handed out. Reload a
 * session with tickets TCK-4820..4825 on the board and the next ticket the
 * estate generated was TCK-4820 again — a code already on somebody's desk.
 * Measured on a real save: eight tickets, seven distinct codes.
 *
 * The code is the operator's handle on a ticket. It is what they search for,
 * what a requester quotes back at them, what they carry into a terminal. Two
 * tickets answering to one is not cosmetic.
 *
 * The counter still exists — minting has no access to the queue — but it is
 * no longer allowed to be the authority on what has been issued. `syncTicketSeq`
 * points it past everything that exists, and every path that REPLACES the
 * queue calls it.
 */
const CODE_BASE = 4820;
const CODE_PREFIX = "TCK-";

let ticketSeq = CODE_BASE;

/** The numeric half of a ticket code, or null if it is not one of ours. */
export function codeNumber(code: string): number | null {
  if (!code.startsWith(CODE_PREFIX)) return null;
  const n = Number(code.slice(CODE_PREFIX.length));
  return Number.isInteger(n) ? n : null;
}

/**
 * Point the sequence past every code in `tickets`.
 *
 * Idempotent and monotonic: it never moves the counter BACKWARDS, so a caller
 * that hands it a filtered list cannot make it reissue a code it already gave
 * out during this session.
 */
export function syncTicketSeq(tickets: readonly { code: string }[]): void {
  let max = ticketSeq - 1;
  for (const t of tickets) {
    const n = codeNumber(t.code);
    if (n !== null && n > max) max = n;
  }
  ticketSeq = max + 1;
}

/**
 * Give any ticket sharing a code with an earlier one a fresh code.
 *
 * Saves written before the counter was fixed carry real duplicates — a
 * measured one had TCK-4825 answering to three different incidents. Pointing
 * the counter forward stops NEW collisions but leaves those, and the operator
 * would keep meeting them every session until they started a new world.
 *
 * The FIRST holder of a code keeps it. That matters: it is the one the
 * operator has most likely already seen, quoted, or searched for, and a repair
 * that renamed everything would be a second identity change on top of the
 * first. Only the later claimants move.
 *
 * Call `syncTicketSeq` before this, so the codes it issues are past everything.
 */
export function dedupeTicketCodes<T extends { code: string }>(tickets: T[]): T[] {
  const seen = new Set<string>();
  let changed = false;
  const out = tickets.map((t) => {
    if (!seen.has(t.code)) {
      seen.add(t.code);
      return t;
    }
    changed = true;
    const code = nextTicketCode();
    seen.add(code);
    return { ...t, code };
  });
  // Returning the original array when nothing collided keeps the store's
  // reference stable, so a clean load does not look like a change to anything
  // subscribed to it.
  return changed ? out : tickets;
}

/**
 * Issue the next ticket code.
 *
 * A named operation rather than an inline `ticketSeq++`, so the counter has
 * exactly one way out of this module and the specs can exercise the thing the
 * estate actually uses instead of a reimplementation of it.
 */
export function nextTicketCode(): string {
  return `${CODE_PREFIX}${ticketSeq++}`;
}

/**
 * Back to the base.
 *
 * Nothing in the product calls this: every world reset goes through a page
 * reload, which reinitialises the module anyway. It exists so the specs can
 * start each case from a known counter — `syncTicketSeq` is deliberately
 * monotonic, so without it one assertion would leak into the next.
 */
export function resetTicketSeq(): void {
  ticketSeq = CODE_BASE;
}

/** Build one ticket from a template + bound context. Returns null if unhostable. */
export function buildTicket(
  template: TicketTemplate,
  infra: InfrastructureState,
  rng: Rng,
): { ticket: Ticket; emails: EmailBeat[]; injectFault?: (draft: InfrastructureState) => void } | null {
  const ctx = template.makeContext(infra, rng);
  if (!ctx) return null;

  const org = infra.org;
  const code = nextTicketCode();
  // God Mode surfaces mail-only tickets straight onto the ITSM board.
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
    createdAt: Date.now() - 1000 * 60 * (template.difficulty === "Tier_3_Hard" || template.difficulty === "Tier_4_Expert" ? 4 : 12),
    tags: template.tags,
    xpReward: template.xpReward,
    hints: template.hints,
    hintsRevealed: 0,
    hardMode: false,
    mandatory: template.mandatory,
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
export function generateTicketQueue(infra: InfrastructureState, level = 1): GeneratedQueue {
  ticketSeq = 4820;
  const rng = mulberry32((infra.org.seed ^ 0x71c) >>> 0);
  const library = ticketLibrary(infra);

  // Only scenarios whose TOOL is unlocked: a ticket you cannot open the app
  // for is a dead end in the queue, not a challenge.
  const byTier = (tier: string) =>
    Object.values(library).filter(
      (t) => t.difficulty === tier && templateMinLevel(t.tags) <= level,
    );

  // A SMALL starter queue drawn only from the tiers the operator has
  // unlocked. More arrives on promotion (see `spawnForTiers`) — a level-1
  // player facing 100 tickets would learn nothing from any of them. Testing
  // no longer needs a second code path: DevTools spawns any family on demand.
  const open = unlockedTiers(level);
  const chosen: TicketTemplate[] = [
    ...shuffle(rng, byTier("Tier_1_Easy")).slice(0, 5),
    ...(open.includes("Tier_2_Medium") ? shuffle(rng, byTier("Tier_2_Medium")).slice(0, 2) : []),
    ...(open.includes("Tier_3_Hard") ? shuffle(rng, byTier("Tier_3_Hard")).slice(0, 2) : []),
    ...(open.includes("Tier_4_Expert") ? shuffle(rng, byTier("Tier_4_Expert")).slice(0, 1) : []),
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

/**
 * Mint a fresh batch for newly-unlocked tiers — called on promotion, so harder
 * work starts arriving the moment the operator is entitled to it.
 */
export function generateTierBatch(
  infra: InfrastructureState,
  tiers: string[],
  level = 99,
  perTier = 2,
): GeneratedQueue {
  const rng = mulberry32((infra.org.seed ^ (0x51a + ticketSeq)) >>> 0);
  const library = ticketLibrary(infra);
  const tickets: Ticket[] = [];
  const emailThreads: Record<string, EmailBeat[]> = {};
  const faults: ((draft: InfrastructureState) => void)[] = [];

  for (const tier of tiers) {
    const pool = shuffle(
      rng,
      Object.values(library).filter(
        (t) => t.difficulty === tier && templateMinLevel(t.tags) <= level,
      ),
    );
    for (const template of pool.slice(0, perTier)) {
      const built = buildTicket(template, infra, rng);
      if (!built) continue;
      tickets.push(built.ticket);
      if (built.emails.length) emailThreads[built.ticket.id] = built.emails;
      if (built.injectFault) faults.push(built.injectFault);
    }
  }
  return { tickets, emailThreads, faults };
}

/** Apply a queue's faults to a draft infra (structuredClone'd by the caller). */
export function applyQueueFaults(infra: InfrastructureState, faults: GeneratedQueue["faults"]): InfrastructureState {
  const draft = structuredClone(infra);
  for (const f of faults) f(draft);
  return draft;
}
