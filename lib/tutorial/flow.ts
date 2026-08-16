/**
 * TriageOS — Tutorial flow (pure)
 * ===============================
 * The sequences, and the decisions that drive them. No React, no stores, no
 * DOM — every function here is a pure read of a narrow world snapshot, so the
 * whole progression is testable on bare node in the physics spec.
 *
 * ── HOW A STEP COMPLETES ────────────────────────────────────────────────────
 *
 * A step does NOT complete because the operator clicked the thing we
 * highlighted. It completes when the world says the thing happened. `done(w)`
 * is a predicate over live state, exactly like `recoveryStatus` or
 * `cascadeStatus` elsewhere in this codebase.
 *
 * That distinction is the whole design. Wiring the tutorial to click handlers
 * would mean the tour breaks the moment the operator opens the Ticket Center
 * from the Start menu, the command palette, a dashboard CTA or the keyboard —
 * four paths this app already has to the same place, and the tour would only
 * recognise the fifth. Reading the world recognises all of them, survives a
 * reload, and cannot disagree with what the screen is showing.
 *
 * Steps with no `done` are informational and advance on the button.
 *
 * ── WHY PROGRESS IS MONOTONIC (a deliberate break with the derivation rule) ──
 *
 * The incident engine regresses when you undo a step, because it describes the
 * WORLD and the world genuinely went backwards. This describes what the
 * OPERATOR HAS BEEN TAUGHT, and that does not go backwards: closing the Ticket
 * Center after being shown it does not unlearn it. So `currentStepIndex` is
 * stored and only ever moves forward, while `done` is derived. Deriving the
 * index too would trap anyone who tidied their desktop mid-tour in a loop.
 *
 * The one place derivation still drives the index is FORWARD: a step already
 * satisfied when it is reached gets skipped rather than asking for something
 * already done. See `advanceIndex`.
 *
 * ── ADDING A STEP ───────────────────────────────────────────────────────────
 *
 * 1. Mark the element. Anywhere in the DeskOS tree:
 *
 *        <div data-tutorial-target="backup-tiers">
 *
 *    Put it on the OUTERMOST element of the thing being taught, not on the
 *    inner button — the spotlight should frame a control with its label, and a
 *    hole cut to a bare 20px icon reads as a smudge. Prefer marking a
 *    container that always exists over one that renders conditionally; if the
 *    element can be absent, the overlay degrades gracefully but the step
 *    teaches nothing.
 *
 *    Parameterise it when the surrounding component is generic —
 *    `data-tutorial-target={`app-tile-${id}`}` on the dashboard's AppTile gives
 *    every app a handle from a single line, and a new app gets one for free.
 *
 * 2. Add the step to a sequence below, naming that target.
 *
 * 3. If it is an action step, write `done`. It must read ONLY from
 *    `TutorialWorld`; widen that interface (and the director that fills it) if
 *    you need something new, rather than reaching into a store from here.
 *
 * Two rules the spec enforces, so breaking them fails the suite rather than
 * the player: step ids are unique within a sequence, and every sequence ENDS
 * on an informational step — a tour that ends on an action can strand anyone
 * for whom that action becomes impossible.
 */

export type TutorialSequenceId = "first_boot" | "hardware_unlocked";

/**
 * Icon keys rather than components, so this module stays free of JSX and the
 * spec harness can transpile it. `TUTORIAL_ICONS` in the overlay maps them.
 */
export type TutorialIconId =
  | "compass"
  | "health"
  | "ticket"
  | "list"
  | "check"
  | "bolt"
  | "wrench";

/**
 * The narrow slice of live state the tutorial is allowed to read.
 *
 * Narrow on purpose: a predicate that can see the whole infra store is a
 * predicate that will eventually depend on something the tutorial has no
 * business knowing, and it could not be built in a test without standing up
 * the entire simulation.
 */
export interface TutorialWorld {
  /** Operator level — gates which sequences are eligible at all. */
  level: number;
  /** `appId` of every open host window. */
  openAppIds: string[];
  /** The ticket selected in the Ticket Center, if any. */
  selectedTicketId: string | null;
  /** Status by ticket id, for "has this been accepted / resolved" questions. */
  ticketStatus: Record<string, string>;
  /** Ticket ids the operator has resolved. Used by the closing beat. */
  resolvedCount: number;
}

export interface TutorialStep {
  id: string;
  /**
   * The `data-tutorial-target` value to spotlight, or null for a centred card
   * with no cutout. A step whose target is missing from the DOM degrades to
   * the centred presentation rather than pointing at nothing — see the
   * overlay's detached mode.
   */
  target: string | null;
  icon: TutorialIconId;
  title: string;
  body: string;
  /** Preferred side of the target. The overlay flips it when it will not fit. */
  side: "top" | "bottom" | "left" | "right";
  /**
   * Absent ⇒ informational, advanced by the button. Present ⇒ the step is
   * waiting on the world, and the button is replaced by a waiting indicator.
   */
  done?: (w: TutorialWorld) => boolean;
}

export interface TutorialSequence {
  id: TutorialSequenceId;
  /** Shown in the card's header rail. */
  title: string;
  /**
   * Is this sequence worth starting right now? Evaluated continuously against
   * live state by the director, so a tour can be waiting for a level, an app,
   * or anything else the world can answer.
   */
  when: (w: TutorialWorld) => boolean;
  steps: TutorialStep[];
}

/** Status values that mean the operator has taken ownership of a ticket. */
const OWNED = new Set(["accepted", "in_progress", "resolved", "closed"]);

export const TUTORIAL_SEQUENCES: TutorialSequence[] = [
  {
    id: "first_boot",
    title: "First shift",
    // The only tour that runs unprompted, and only for someone who has not
    // started working yet. Level 1 with nothing resolved is as close as this
    // app gets to "has never played".
    when: (w) => w.level === 1 && w.resolvedCount === 0,
    steps: [
      {
        id: "welcome",
        target: null,
        icon: "compass",
        side: "bottom",
        title: "This is DeskOS",
        body: "You are the IT department at Sterling Trust. Every part of this estate is a real system with real state — power budgets, address space, backup tiers. Six screens and you will have closed your first ticket.",
      },
      {
        id: "health",
        target: "dash-health",
        icon: "health",
        side: "right",
        title: "The estate, in one number",
        body: "Health is derived from the whole estate every time you look at it, and faults compound rather than average out. When it drops, something downstream is genuinely broken.",
      },
      {
        id: "open-itsm",
        target: "app-tile-itsm",
        icon: "ticket",
        side: "top",
        title: "Open the Ticket Center",
        body: "Your queue lives here. Requests arrive on their own throughout the shift, so this is the screen you will come back to most.",
        done: (w) => w.openAppIds.includes("itsm"),
      },
      {
        id: "select-ticket",
        target: "ticket-queue",
        icon: "list",
        side: "right",
        title: "Pick your first request",
        body: "Each row is a person waiting on you, with an SLA clock already running. Open the one closest to breaching — severity and time left are both on the row.",
        done: (w) => w.selectedTicketId !== null,
      },
      {
        id: "accept",
        target: "ticket-actions",
        icon: "check",
        side: "top",
        title: "Take ownership",
        body: "Accepting a ticket assigns it to you and starts your clock on it. Read the report first — the symptom the user describes is often two steps downstream of the actual fault.",
        done: (w) =>
          w.selectedTicketId !== null && OWNED.has(w.ticketStatus[w.selectedTicketId] ?? "new"),
      },
      {
        id: "how-it-closes",
        target: "ticket-actions",
        icon: "wrench",
        side: "top",
        title: "Nothing here closes the ticket",
        body: "There is no resolve button, and that is the point. Go and fix the thing the ticket is about — reseat the module, free the port, restore the share — and the ticket closes itself, paying out XP and budget when the estate agrees it is fixed.",
      },
    ],
  },
  {
    id: "hardware_unlocked",
    title: "The bench",
    // Fires the first time the operator can actually use the bench, which is
    // the moment the lesson is worth anything.
    when: (w) => w.level >= 3,
    steps: [
      {
        id: "bench-open",
        target: "app-tile-hardwarelab",
        icon: "wrench",
        side: "top",
        title: "The Hardware Lab is open to you",
        body: "Physical faults cannot be fixed from a terminal. The bench is where you open the chassis, seat the part, flash firmware and image a disk.",
        done: (w) => w.openAppIds.includes("hardwarelab"),
      },
      {
        id: "bench-deeplink",
        target: null,
        icon: "bolt",
        side: "bottom",
        title: "Let the ticket drive",
        body: "Hardware tickets carry a button that opens the bench with the right device already selected. Use it rather than hunting the hostname — it is the same door, and it cannot pick the wrong machine.",
      },
    ],
  },
];

export function sequenceById(id: TutorialSequenceId): TutorialSequence | undefined {
  return TUTORIAL_SEQUENCES.find((s) => s.id === id);
}

/**
 * The sequence that should be running, or null.
 *
 * Deterministic: declaration order breaks ties, so two eligible tours always
 * resolve the same way rather than depending on which store updated first.
 */
export function eligibleSequence(
  w: TutorialWorld,
  completed: readonly string[],
): TutorialSequenceId | null {
  const done = new Set(completed);
  for (const seq of TUTORIAL_SEQUENCES) {
    if (done.has(seq.id)) continue;
    if (seq.when(w)) return seq.id;
  }
  return null;
}

/** Is this step waiting on the world, rather than on a button? */
export function isActionStep(step: TutorialStep): boolean {
  return typeof step.done === "function";
}

/**
 * Where the tour should be, given where it is and what the world looks like.
 *
 * Walks FORWARD past every action step already satisfied and stops at the
 * first step that still has something to say — an informational step always
 * stops it, because being already-true is not a concept there.
 *
 * Returns an index one past the last step when the sequence is finished, which
 * the caller treats as completion.
 */
export function advanceIndex(
  seq: TutorialSequence,
  from: number,
  w: TutorialWorld,
): number {
  let i = Math.max(0, from);
  while (i < seq.steps.length) {
    const step = seq.steps[i];
    if (!isActionStep(step)) break;
    if (!step.done!(w)) break;
    i++;
  }
  return i;
}

/** Clamp an index onto a sequence; -1 when the sequence is over. */
export function stepAt(seq: TutorialSequence, index: number): TutorialStep | null {
  return index >= 0 && index < seq.steps.length ? seq.steps[index] : null;
}
