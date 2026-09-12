/**
 * ITQuest — the shift allowance (pure)
 * =====================================
 * How many tickets a plan lets you TAKE ON before the shift ends.
 *
 * ── IT LIMITS WHAT YOU START, NEVER WHAT YOU FINISH ─────────────────────────
 *
 * The allowance is spent when a ticket is accepted. A ticket already on your
 * desk can always be worked and closed, however long it takes and whatever the
 * clock says. Cutting someone off halfway through a diagnosis would punish the
 * one behaviour the product exists to encourage, and it would leave an estate
 * half-repaired with no way to put it right.
 *
 * ── IT IS A SHIFT, NOT A QUOTA ──────────────────────────────────────────────
 *
 * The free tier's fiction is that you are an intern on the service desk, so
 * the limit is told in that voice: the shift ends and the next one starts in
 * the morning. That is a chapter break, not a paywall, and it is the honest
 * shape of the thing — real first-line technicians do not work infinite
 * tickets either.
 *
 * ── AND IT IS ADVISORY, WHICH THIS FILE SAYS OUT LOUD ───────────────────────
 *
 * There is no backend. The counter lives in the player's own browser and the
 * clock is the player's own clock, so anyone who wants to can clear storage or
 * move the date and carry on. That is FINE and it is deliberate: the allowance
 * exists to pace a new player and to make the next chapter worth buying, not
 * to police anybody. Building anti-tamper theatre against a client-side store
 * would not work and would cost the honesty of the rest of the system.
 *
 * When the server arrives it becomes the authority, and this module keeps its
 * shape — only `readShift`/`writeShift` change.
 */

export interface ShiftState {
  /** The LOCAL calendar day this count belongs to, as YYYY-MM-DD. */
  day: string;
  /** Tickets taken on during that day. */
  used: number;
}

/**
 * The player's local day.
 *
 * Local rather than UTC on purpose: "your shift starts in the morning" has to
 * mean the player's morning, not one in a timezone they have never been to.
 */
export function dayKey(at: number = Date.now()): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const freshShift = (at: number = Date.now()): ShiftState => ({ day: dayKey(at), used: 0 });

/** The state as it stands now — a new day resets it. */
export function rollover(s: ShiftState, at: number = Date.now()): ShiftState {
  const today = dayKey(at);
  return s.day === today ? s : { day: today, used: 0 };
}

/** How many are left, or null when the plan is unlimited. */
export function remaining(s: ShiftState, allowance: number | null, at: number = Date.now()): number | null {
  if (allowance === null) return null;
  return Math.max(0, allowance - rollover(s, at).used);
}

export function canTakeOn(s: ShiftState, allowance: number | null, at: number = Date.now()): boolean {
  const left = remaining(s, allowance, at);
  return left === null || left > 0;
}

/** Spend one. Returns the state unchanged when there is nothing to spend. */
export function takeOn(s: ShiftState, allowance: number | null, at: number = Date.now()): ShiftState {
  const rolled = rollover(s, at);
  if (!canTakeOn(rolled, allowance, at)) return rolled;
  return { ...rolled, used: rolled.used + 1 };
}

/** Local midnight, when the next shift begins. */
export function nextShiftAt(at: number = Date.now()): number {
  const d = new Date(at);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** "6h 20m" — how long until the desk opens again. */
export function untilNextShift(at: number = Date.now()): string {
  const ms = Math.max(0, nextShiftAt(at) - at);
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
