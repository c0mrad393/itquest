/**
 * TriageOS — Tutorial store
 * =========================
 * Which tour is running, how far through it the operator is, and which tours
 * they have already been through.
 *
 * The split is the usual one for this codebase, applied to onboarding:
 *
 *   STORED     `completedSequences` — nothing can derive it, it survives a
 *              world reset, and it is the only field written to disk.
 *   STORED     `currentStepIndex` — monotonic, session-scoped. See flow.ts for
 *              why the tutorial's position is stored while everything else in
 *              this codebase is derived.
 *   DERIVED    whether a step is satisfied, and which tour is eligible. Both
 *              are pure functions of live state living in flow.ts; the
 *              director calls them and pushes the result in here.
 *
 * This store deliberately holds NO opinion about the world. It cannot read the
 * infra store, the ticket store or the DOM. That keeps the tour's rules in one
 * pure module rather than smeared between a store and a component.
 */

"use client";

import { create } from "zustand";
import { clearProgress, loadProgress, saveProgress } from "./progress";
import { TUTORIAL_SEQUENCES, type TutorialSequenceId } from "./flow";

interface TutorialStore {
  /** The tour currently on screen, or null. */
  activeSequence: TutorialSequenceId | null;
  /** Position within `activeSequence`. Meaningless when nothing is active. */
  currentStepIndex: number;
  /** Tours already seen. Persisted; never repeats. */
  completedSequences: TutorialSequenceId[];
  /**
   * True once progress has been read from storage.
   *
   * The director refuses to start anything until this flips, otherwise the
   * first render — which happens before localStorage is read — would look
   * exactly like a brand-new operator and flash the welcome card at someone
   * who finished the tour months ago.
   */
  ready: boolean;

  hydrate: () => void;
  startTutorial: (id: TutorialSequenceId) => void;
  /** Advance one step. Completes the tour when it runs off the end. */
  nextStep: () => void;
  /** Jump to a specific index — used by the director to skip satisfied steps. */
  goToStep: (index: number) => void;
  /** Mark the active tour finished and take it off screen. */
  completeTutorial: () => void;
  /** "Skip tour": finishes the active one only, leaving later tours eligible. */
  skipActive: () => void;
  /** "Never show these": marks every declared sequence complete. */
  skipAll: () => void;
  /** Settings escape hatch — clears the record so the tours run again. */
  resetTutorials: () => void;
}

/** Persist and store in one move, so the two can never drift apart. */
function commit(completed: TutorialSequenceId[]): { completedSequences: TutorialSequenceId[] } {
  saveProgress(completed);
  return { completedSequences: completed };
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  activeSequence: null,
  currentStepIndex: 0,
  completedSequences: [],
  ready: false,

  hydrate: () => {
    const known = new Set<string>(TUTORIAL_SEQUENCES.map((s) => s.id));
    // Filter against the sequences that actually exist: a stored id from a
    // removed tour would otherwise sit in the list forever, and — worse — a
    // renamed one would silently suppress its replacement.
    const completed = loadProgress().filter((id): id is TutorialSequenceId => known.has(id));
    set({ completedSequences: completed, ready: true });
  },

  startTutorial: (id) => {
    if (get().completedSequences.includes(id)) return;
    set({ activeSequence: id, currentStepIndex: 0 });
  },

  nextStep: () => {
    const { activeSequence, currentStepIndex } = get();
    if (!activeSequence) return;
    const seq = TUTORIAL_SEQUENCES.find((s) => s.id === activeSequence);
    if (!seq) return;
    const next = currentStepIndex + 1;
    if (next >= seq.steps.length) {
      get().completeTutorial();
      return;
    }
    set({ currentStepIndex: next });
  },

  goToStep: (index) => {
    const { activeSequence, currentStepIndex } = get();
    if (!activeSequence) return;
    const seq = TUTORIAL_SEQUENCES.find((s) => s.id === activeSequence);
    if (!seq) return;
    // Forward only. The director recomputes from live state on every change,
    // and world state that flickers backwards (a window closing, a filter
    // hiding the selected ticket) must never rewind the lesson.
    if (index <= currentStepIndex) return;
    if (index >= seq.steps.length) {
      get().completeTutorial();
      return;
    }
    set({ currentStepIndex: index });
  },

  completeTutorial: () => {
    const { activeSequence, completedSequences } = get();
    if (!activeSequence) return;
    const completed = completedSequences.includes(activeSequence)
      ? completedSequences
      : [...completedSequences, activeSequence];
    set({ activeSequence: null, currentStepIndex: 0, ...commit(completed) });
  },

  skipActive: () => get().completeTutorial(),

  skipAll: () => {
    const all = TUTORIAL_SEQUENCES.map((s) => s.id);
    set({ activeSequence: null, currentStepIndex: 0, ...commit(all) });
  },

  resetTutorials: () => {
    clearProgress();
    set({ activeSequence: null, currentStepIndex: 0, completedSequences: [], ready: true });
  },
}));
