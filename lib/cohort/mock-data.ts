/**
 * ITQuest — one institution, its cohort, and the trail it left
 * =============================================================
 * Fixtures for the instructor console.
 *
 * ── THE STREAM IS GENERATED FROM A SCRIPT, NOT TYPED OUT ────────────────────
 *
 * A hundred and fifty hand-written events would be unreadable and would drift
 * the moment anyone edited one. So the story is written compactly — who
 * attempted what, how it went, how long it took — and expanded into the event
 * stream by a pure function.
 *
 * That also demonstrates the claim the ledger makes: the trail is small enough
 * to write down. Twelve students and forty-odd runs is a page of script.
 *
 * ── AND IT IS SHAPED, NOT RANDOM ────────────────────────────────────────────
 *
 * The PoE scenario is deliberately the one the cohort struggles with: low
 * completion, most hints, two abandons. A console that surfaces "this is the
 * exercise your class cannot do" is only worth building if the data can
 * actually say it, so the fixture says it.
 *
 * Names are fictional and drawn from the same pool the simulator uses.
 */

import type { LedgerEvent, LedgerKind } from "./ledger";

export interface Institution {
  id: string;
  name: string;
  /** The seat plan behind this cohort. */
  plan: "pilot" | "enterprise";
  seatsTotal: number;
  contact: string;
  term: string;
}

export interface Seat {
  /** Stable id. The ledger only ever carries this. */
  id: string;
  name: string;
  email: string;
  /** Null until they sign in for the first time. */
  joinedAt: number | null;
  group: string;
}

export const INSTITUTION: Institution = {
  id: "inst-01",
  name: "Northbridge Technical College",
  plan: "enterprise",
  seatsTotal: 24,
  contact: "d.aliyev@northbridge.example",
  term: "Autumn — Network & Systems Support",
};

const NOW = Date.now();
const mins = (n: number) => NOW - n * 60_000;
const hours = (n: number) => NOW - n * 3_600_000;
const days = (n: number) => NOW - n * 86_400_000;

export const SEATS: Seat[] = [
  { id: "s-01", name: "Amara Boateng", email: "a.boateng@northbridge.example", joinedAt: days(21), group: "Group A" },
  { id: "s-02", name: "Iker Salas", email: "i.salas@northbridge.example", joinedAt: days(21), group: "Group A" },
  { id: "s-03", name: "Noor Haddad", email: "n.haddad@northbridge.example", joinedAt: days(20), group: "Group A" },
  { id: "s-04", name: "Tobias Lind", email: "t.lind@northbridge.example", joinedAt: days(20), group: "Group A" },
  { id: "s-05", name: "Wren Ashby", email: "w.ashby@northbridge.example", joinedAt: days(19), group: "Group A" },
  { id: "s-06", name: "Kofi Mensah", email: "k.mensah@northbridge.example", joinedAt: days(19), group: "Group B" },
  { id: "s-07", name: "Lucia Ferrari", email: "l.ferrari@northbridge.example", joinedAt: days(18), group: "Group B" },
  { id: "s-08", name: "Sanne de Vries", email: "s.devries@northbridge.example", joinedAt: days(18), group: "Group B" },
  { id: "s-09", name: "Rafael Pires", email: "r.pires@northbridge.example", joinedAt: days(17), group: "Group B" },
  { id: "s-10", name: "Yuki Tanabe", email: "y.tanabe@northbridge.example", joinedAt: days(17), group: "Group B" },
  // Provisioned, never signed in. Every cohort has at least one, and an
  // instructor needs to see it before the term ends rather than after.
  { id: "s-11", name: "Dara Quinn", email: "d.quinn@northbridge.example", joinedAt: null, group: "Group B" },
  { id: "s-12", name: "Marco Ricci", email: "m.ricci@northbridge.example", joinedAt: null, group: "Group A" },
];

/** Scenario families, with the names an instructor would recognise. */
export const SCENARIO_LABEL: Record<string, string> = {
  "id-t1-lockout": "Account lockout",
  "net-t1-latency": "Latency on the access layer",
  "net-t2-firewall": "Perimeter rule review",
  "sw-ad-pw-reset": "Password reset in the directory",
  "hw-t1-ram-upgrade": "Memory upgrade and re-image",
  "csc-t2-poe": "PoE budget overload",
  "net-t3-dns": "DNS resolution failure",
};

/**
 * How one attempt went.
 *
 * `stuck` means started and still open — the run an instructor should look at.
 */
type Outcome = "resolved" | "stuck" | "abandoned";

interface Attempt {
  scenario: string;
  outcome: Outcome;
  /** Minutes of work. For `stuck`, how long ago it went quiet. */
  minutes: number;
  hints: number;
  breached?: boolean;
  /** Steps cleared before the outcome. */
  steps?: number;
}

/**
 * The cohort's term, written as a story.
 *
 * Read down the `csc-t2-poe` column: almost nobody finishes it, everybody
 * takes hints, two give up. That is the finding the console exists to surface.
 */
const SCRIPT: { seat: string; attempts: Attempt[] }[] = [
  { seat: "s-01", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 11, hints: 0, steps: 3 },
    { scenario: "sw-ad-pw-reset", outcome: "resolved", minutes: 9, hints: 0, steps: 2 },
    { scenario: "net-t1-latency", outcome: "resolved", minutes: 22, hints: 1, steps: 4 },
    { scenario: "csc-t2-poe", outcome: "resolved", minutes: 48, hints: 2, steps: 5 },
  ]},
  { seat: "s-02", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 14, hints: 0, steps: 3 },
    { scenario: "net-t1-latency", outcome: "resolved", minutes: 27, hints: 1, steps: 4 },
    { scenario: "csc-t2-poe", outcome: "abandoned", minutes: 39, hints: 3, steps: 2 },
  ]},
  { seat: "s-03", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 17, hints: 1, steps: 3 },
    { scenario: "sw-ad-pw-reset", outcome: "resolved", minutes: 12, hints: 0, steps: 2 },
    { scenario: "csc-t2-poe", outcome: "stuck", minutes: 52, hints: 3, steps: 2 },
  ]},
  { seat: "s-04", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 19, hints: 1, steps: 3 },
    { scenario: "net-t2-firewall", outcome: "resolved", minutes: 31, hints: 1, steps: 4, breached: true },
    { scenario: "csc-t2-poe", outcome: "stuck", minutes: 41, hints: 2, steps: 1 },
  ]},
  { seat: "s-05", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 10, hints: 0, steps: 3 },
    { scenario: "sw-ad-pw-reset", outcome: "resolved", minutes: 8, hints: 0, steps: 2 },
    { scenario: "net-t1-latency", outcome: "resolved", minutes: 18, hints: 0, steps: 4 },
    { scenario: "net-t2-firewall", outcome: "resolved", minutes: 26, hints: 0, steps: 4 },
    { scenario: "csc-t2-poe", outcome: "resolved", minutes: 44, hints: 1, steps: 5 },
    { scenario: "net-t3-dns", outcome: "resolved", minutes: 33, hints: 1, steps: 4 },
  ]},
  { seat: "s-06", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 21, hints: 2, steps: 3 },
    { scenario: "net-t1-latency", outcome: "abandoned", minutes: 30, hints: 2, steps: 1 },
  ]},
  { seat: "s-07", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 13, hints: 0, steps: 3 },
    { scenario: "sw-ad-pw-reset", outcome: "resolved", minutes: 11, hints: 0, steps: 2 },
    { scenario: "net-t2-firewall", outcome: "resolved", minutes: 29, hints: 1, steps: 4 },
    { scenario: "csc-t2-poe", outcome: "stuck", minutes: 63, hints: 4, steps: 2 },
  ]},
  { seat: "s-08", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 16, hints: 1, steps: 3 },
    { scenario: "net-t1-latency", outcome: "resolved", minutes: 24, hints: 1, steps: 4, breached: true },
    { scenario: "csc-t2-poe", outcome: "abandoned", minutes: 45, hints: 3, steps: 2 },
  ]},
  { seat: "s-09", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 25, hints: 2, steps: 3, breached: true },
  ]},
  { seat: "s-10", attempts: [
    { scenario: "id-t1-lockout", outcome: "resolved", minutes: 12, hints: 0, steps: 3 },
    { scenario: "sw-ad-pw-reset", outcome: "resolved", minutes: 10, hints: 0, steps: 2 },
    { scenario: "net-t1-latency", outcome: "resolved", minutes: 20, hints: 0, steps: 4 },
    { scenario: "csc-t2-poe", outcome: "stuck", minutes: 37, hints: 2, steps: 3 },
  ]},
  // s-11 and s-12 never signed in, so they leave no trail at all. That absence
  // IS the finding, and the console has to show it rather than skip them.
];

/**
 * Expand the script into the stream.
 *
 * Pure and deterministic: same script, same events, every load. Timestamps
 * walk backwards from now so the feed never reads "three days ago" because
 * the fixture was written on a Tuesday.
 */
function expand(): LedgerEvent[] {
  const out: LedgerEvent[] = [];
  let n = 0;
  const push = (seat: string, kind: LedgerKind, scenario: string, at: number, extra?: Partial<LedgerEvent>) =>
    out.push({ id: `ev-${++n}`, seat, kind, scenario, at, ...extra });

  SCRIPT.forEach((s, si) => {
    // Each seat's attempts are laid out over the past fortnight, oldest first.
    let cursor = days(13 - si * 0.4);
    for (const a of s.attempts) {
      const lenMs = a.minutes * 60_000;
      const start = a.outcome === "stuck" ? mins(a.minutes) : cursor;
      push(s.seat, "run.started", a.scenario, start);

      const steps = a.steps ?? 0;
      for (let i = 0; i < steps; i++) {
        push(s.seat, "step.completed", a.scenario, start + (lenMs * (i + 1)) / (steps + 2), {
          step: `step-${i + 1}`,
        });
      }
      for (let i = 0; i < a.hints; i++) {
        push(s.seat, "hint.revealed", a.scenario, start + (lenMs * (i + 1)) / (a.hints + 3));
      }
      if (a.breached) push(s.seat, "sla.breached", a.scenario, start + lenMs * 0.8);

      if (a.outcome === "resolved") {
        push(s.seat, "fault.diagnosed", a.scenario, start + lenMs * 0.7, { step: `step-${steps}` });
        push(s.seat, "ticket.resolved", a.scenario, start + lenMs, { elapsedSec: a.minutes * 60 });
      } else if (a.outcome === "abandoned") {
        push(s.seat, "run.abandoned", a.scenario, start + lenMs, { elapsedSec: a.minutes * 60 });
      }
      // `stuck` emits nothing terminal — that is what makes it open.

      cursor = cursor + lenMs + 3_600_000;
    }
  });

  return out.sort((a, b) => a.at - b.at);
}

export const LEDGER: LedgerEvent[] = expand();

export const seatIds = () => SEATS.map((s) => s.id);
export const seatById = (id: string) => SEATS.find((s) => s.id === id) ?? null;
export const labelFor = (scenario: string) => SCENARIO_LABEL[scenario] ?? scenario;
export { hours };
