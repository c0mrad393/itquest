/**
 * ITQuest — the run ledger
 * =========================
 * What a simulation writes down about itself, and everything an instructor
 * needs derived from it.
 *
 * ── THE CONSOLE DOES NOT MIRROR THE SIMULATION ──────────────────────────────
 *
 * The obvious way to build an instructor view is to show them the estates
 * their students are working. It cannot be done and it should not be: a run is
 * a whole VMState — a filesystem, a directory, a network, a rack — and forty
 * of those live on a server is not a feature, it is a datacentre. The
 * simulation runs on the student's own machine and that is the point.
 *
 * So the console reads a LEDGER instead. A run emits a short, append-only
 * trail of facts — started, step done, hint taken, resolved, gave up — a few
 * hundred bytes each. Forty students is kilobytes. And everything an
 * instructor actually asks for falls out of it:
 *
 *   not "twenty-one tickets are open"
 *   but "six of them came out of the PoE scenario, so that is where the
 *        cohort is getting stuck"
 *
 * ── STORED FACTS, DERIVED ANSWERS ───────────────────────────────────────────
 *
 * Events are the only thing stored, and they are immutable — a thing that
 * happened cannot stop having happened. Every figure below is computed on
 * read, so a cohort summary cannot drift from the events it summarises, and
 * there is no "progress" field to update and forget.
 */

export type LedgerKind =
  | "run.started"
  /** One step inside a scenario went right. */
  | "step.completed"
  /** A hint was taken. The most honest difficulty signal there is. */
  | "hint.revealed"
  /** The cause was correctly identified — distinct from fixing it. */
  | "fault.diagnosed"
  | "sla.breached"
  | "ticket.resolved"
  /** Left without resolving. Not a failure to hide; a question to ask. */
  | "run.abandoned"
  | "phase.advanced";

export interface LedgerEvent {
  id: string;
  /** Which seat in the cohort. Never a name — the roster resolves that. */
  seat: string;
  at: number;
  kind: LedgerKind;
  /** The scenario family this belongs to, e.g. "net-t2-firewall". */
  scenario: string;
  /** Which step inside it, where the kind has one. */
  step?: string;
  /** Seconds on the clock when this event closed something. */
  elapsedSec?: number;
}

export const isTerminal = (k: LedgerKind) => k === "ticket.resolved" || k === "run.abandoned";

// ── Per-seat ────────────────────────────────────────────────────────────────

export interface SeatProgress {
  seat: string;
  started: number;
  resolved: number;
  abandoned: number;
  breached: number;
  hintsTaken: number;
  /** Median seconds to resolve. Median, not mean: one abandoned marathon
   *  should not make a steady student look slow. */
  medianResolveSec: number | null;
  lastActiveAt: number | null;
  /** The run they are in the middle of, if any. */
  openRun: { scenario: string; step: string | null; sinceAt: number } | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function progressOf(events: LedgerEvent[], seat: string): SeatProgress {
  const mine = events.filter((e) => e.seat === seat).sort((a, b) => a.at - b.at);

  let started = 0,
    resolved = 0,
    abandoned = 0,
    breached = 0,
    hintsTaken = 0;
  const resolveTimes: number[] = [];
  // Scenarios opened and not yet closed, newest wins if somehow two are open.
  const open = new Map<string, { step: string | null; sinceAt: number }>();

  for (const e of mine) {
    switch (e.kind) {
      case "run.started":
        started++;
        open.set(e.scenario, { step: null, sinceAt: e.at });
        break;
      case "step.completed":
      case "fault.diagnosed": {
        const cur = open.get(e.scenario);
        if (cur) open.set(e.scenario, { step: e.step ?? cur.step, sinceAt: e.at });
        break;
      }
      case "hint.revealed":
        hintsTaken++;
        break;
      case "sla.breached":
        breached++;
        break;
      case "ticket.resolved":
        resolved++;
        if (e.elapsedSec !== undefined) resolveTimes.push(e.elapsedSec);
        open.delete(e.scenario);
        break;
      case "run.abandoned":
        abandoned++;
        open.delete(e.scenario);
        break;
      default:
        break;
    }
  }

  const [scenario, state] = [...open.entries()][0] ?? [];
  return {
    seat,
    started,
    resolved,
    abandoned,
    breached,
    hintsTaken,
    medianResolveSec: median(resolveTimes),
    lastActiveAt: mine.length ? mine[mine.length - 1].at : null,
    openRun: scenario && state ? { scenario, step: state.step, sinceAt: state.sinceAt } : null,
  };
}

// ── Stuck ───────────────────────────────────────────────────────────────────

export interface StuckSeat {
  seat: string;
  scenario: string;
  step: string | null;
  /** How long since anything happened on it. */
  stalledSec: number;
  hintsTaken: number;
}

/**
 * Who is stuck, and on what.
 *
 * "Stuck" is a run that is OPEN and has had no event for a while. It is
 * deliberately not "has taken hints" or "is slow" — a student working
 * carefully through a hard scenario is neither, and flagging them would train
 * an instructor to ignore the list.
 */
export function stuck(events: LedgerEvent[], seats: string[], stallSec = 900, now = Date.now()): StuckSeat[] {
  const out: StuckSeat[] = [];
  for (const seat of seats) {
    const p = progressOf(events, seat);
    if (!p.openRun) continue;
    const stalledSec = Math.round((now - p.openRun.sinceAt) / 1000);
    if (stalledSec < stallSec) continue;
    const hintsHere = events.filter(
      (e) => e.seat === seat && e.scenario === p.openRun!.scenario && e.kind === "hint.revealed",
    ).length;
    out.push({ seat, scenario: p.openRun.scenario, step: p.openRun.step, stalledSec, hintsTaken: hintsHere });
  }
  return out.sort((a, b) => b.stalledSec - a.stalledSec);
}

// ── Per-scenario ────────────────────────────────────────────────────────────

export interface ScenarioDifficulty {
  scenario: string;
  attempts: number;
  resolved: number;
  abandoned: number;
  hintsTaken: number;
  medianResolveSec: number | null;
  /** Resolved as a share of attempts, 0-1. Null when nobody has attempted it. */
  completionRate: number | null;
}

/**
 * Which scenarios the cohort finds hard.
 *
 * This is the question an instructor actually has, and the one a count of open
 * tickets cannot answer. A family with a low completion rate and a lot of
 * hints is a family that needs a lecture, not a nudge to the students.
 */
export function difficultyByScenario(events: LedgerEvent[]): ScenarioDifficulty[] {
  const names = Array.from(new Set(events.map((e) => e.scenario)));
  return names
    .map((scenario) => {
      const mine = events.filter((e) => e.scenario === scenario);
      const attempts = mine.filter((e) => e.kind === "run.started").length;
      const resolved = mine.filter((e) => e.kind === "ticket.resolved").length;
      const abandoned = mine.filter((e) => e.kind === "run.abandoned").length;
      const times = mine
        .filter((e) => e.kind === "ticket.resolved" && e.elapsedSec !== undefined)
        .map((e) => e.elapsedSec as number);
      return {
        scenario,
        attempts,
        resolved,
        abandoned,
        hintsTaken: mine.filter((e) => e.kind === "hint.revealed").length,
        medianResolveSec: median(times),
        completionRate: attempts === 0 ? null : resolved / attempts,
      };
    })
    .sort((a, b) => (a.completionRate ?? 1) - (b.completionRate ?? 1));
}

// ── Cohort ──────────────────────────────────────────────────────────────────

export interface CohortSummary {
  seats: number;
  /** Seats with any event at all. */
  active: number;
  started: number;
  resolved: number;
  abandoned: number;
  hintsTaken: number;
  medianResolveSec: number | null;
  /** The families the cohort finds hardest, worst first. */
  hardest: ScenarioDifficulty[];
}

export function summarise(events: LedgerEvent[], seats: string[]): CohortSummary {
  const per = seats.map((s) => progressOf(events, s));
  const times = events
    .filter((e) => e.kind === "ticket.resolved" && e.elapsedSec !== undefined)
    .map((e) => e.elapsedSec as number);
  return {
    seats: seats.length,
    active: per.filter((p) => p.lastActiveAt !== null).length,
    started: per.reduce((n, p) => n + p.started, 0),
    resolved: per.reduce((n, p) => n + p.resolved, 0),
    abandoned: per.reduce((n, p) => n + p.abandoned, 0),
    hintsTaken: per.reduce((n, p) => n + p.hintsTaken, 0),
    medianResolveSec: median(times),
    hardest: difficultyByScenario(events).filter((d) => d.attempts > 0),
  };
}

/** "12m", "1h 04m" — a duration as an instructor would say it. */
export function duration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${`${m % 60}`.padStart(2, "0")}m`;
}
