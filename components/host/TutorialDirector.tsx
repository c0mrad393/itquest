"use client";

/**
 * TriageOS — Tutorial director (headless)
 * =======================================
 * The one place that connects the pure tour rules to the live simulation. It
 * renders nothing: it watches state, decides which tour should be running and
 * how far through it the operator is, and pushes both into the tutorial store.
 *
 * WHY A SEPARATE COMPONENT rather than logic inside the overlay: the overlay's
 * job is measurement and presentation, and it is the piece most likely to be
 * rewritten for looks. Progression rules that live inside a presentational
 * component get rewritten with it. This mirrors the existing headless engines
 * on the desktop (TicketEngine, SlaEngine, NetworkEngine) — same pattern, same
 * mounting point, same reason.
 *
 * It also subscribes to exactly the state the rules can read (`TutorialWorld`)
 * and nothing else, so a re-render here is cheap and the dependency surface is
 * visible in one screenful.
 */

import { useEffect, useMemo } from "react";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useTutorialStore } from "@/lib/tutorial/store";
import {
  advanceIndex,
  eligibleSequence,
  sequenceById,
  type TutorialWorld,
} from "@/lib/tutorial/flow";

export default function TutorialDirector() {
  const windows = useHostStore((s) => s.windows);
  const level = useHostStore((s) => s.host.user.level);
  const tickets = useTicketStore((s) => s.tickets);
  const selectedId = useTicketStore((s) => s.selectedId);

  const ready = useTutorialStore((s) => s.ready);
  const hydrate = useTutorialStore((s) => s.hydrate);
  const activeSequence = useTutorialStore((s) => s.activeSequence);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const completedSequences = useTutorialStore((s) => s.completedSequences);
  const startTutorial = useTutorialStore((s) => s.startTutorial);
  const goToStep = useTutorialStore((s) => s.goToStep);
  const completeTutorial = useTutorialStore((s) => s.completeTutorial);

  useEffect(() => hydrate(), [hydrate]);

  /**
   * The snapshot the rules read.
   *
   * Rebuilt whenever any input changes, which is the point — a predicate like
   * "is the Ticket Center open" has to be re-answered the instant a window
   * opens, not on a timer.
   */
  const world: TutorialWorld = useMemo(() => {
    const ticketStatus: Record<string, string> = {};
    let resolvedCount = 0;
    for (const t of tickets) {
      ticketStatus[t.id] = t.status;
      if (t.status === "resolved" || t.status === "closed") resolvedCount++;
    }
    return {
      level,
      openAppIds: windows.filter((w) => w.kind === "app").map((w) => w.appId as string),
      selectedTicketId: selectedId,
      ticketStatus,
      resolvedCount,
    };
  }, [level, windows, selectedId, tickets]);

  // ── Start an eligible tour ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || activeSequence) return;
    const next = eligibleSequence(world, completedSequences);
    if (next) startTutorial(next);
  }, [ready, activeSequence, world, completedSequences, startTutorial]);

  // ── Advance past steps the world has already satisfied ────────────────────
  useEffect(() => {
    if (!activeSequence) return;
    const seq = sequenceById(activeSequence);
    if (!seq) {
      // The stored id no longer names a real sequence (a tour was removed
      // mid-session). Retire it rather than rendering an overlay with no
      // content to show.
      completeTutorial();
      return;
    }
    const target = advanceIndex(seq, currentStepIndex, world);
    if (target >= seq.steps.length) {
      completeTutorial();
      return;
    }
    if (target > currentStepIndex) goToStep(target);
  }, [activeSequence, currentStepIndex, world, goToStep, completeTutorial]);

  return null;
}
