"use client";

/**
 * ITQuest — Windows Update state, per node
 * ========================================
 * The live update state for every machine in the estate, and the handle a
 * ticket uses to break one.
 *
 * ── KEYED BY NODE, NOT GLOBAL ───────────────────────────────────────────────
 *
 * "The domain controller cannot reach WSUS" is a fact about one machine.
 * A single global update state would make every RDP session show the same
 * banner, so fixing one host would silently fix all of them and a
 * win-condition could not tell which machine the operator actually repaired.
 *
 * ── LAZY, SO A TICKET CAN PRE-BREAK A MACHINE ───────────────────────────────
 *
 * `stateFor` mints a healthy record on first read. That matters for ordering:
 * a ticket can call `inject` on a node the operator has never opened, and the
 * fault is waiting when they finally RDP in — rather than being overwritten by
 * a fresh state the moment the applet mounts.
 *
 * ── NOT IN THE SAVE ─────────────────────────────────────────────────────────
 *
 * Deliberately session-scoped. Persisting it would mean bumping the save
 * version (loadSave discards on any mismatch, throwing away every existing
 * estate) for state that a ticket re-injects on spawn anyway. When update
 * faults need to survive a reload, they should ride on the TICKET, which is
 * already persisted, rather than duplicating a second source of truth.
 */

import { create } from "zustand";
import {
  applyWsusPolicy,
  beginCheck,
  completeCheck,
  freshUpdateState,
  installPending,
  pauseUpdates,
  restartComplete,
  resumeUpdates,
  type PendingUpdate,
  type UpdateErrorCode,
  type WindowsUpdateState,
} from "./windows-update";

/** What a scan turns up on a machine that is genuinely behind. */
export const SAMPLE_PENDING: PendingUpdate[] = [
  {
    kb: "KB5035853",
    title: "2024-03 Cumulative Update for Windows Server",
    sizeMb: 812,
    category: "security",
  },
  {
    kb: "KB5035967",
    title: "Servicing Stack Update",
    sizeMb: 74,
    category: "quality",
  },
  {
    kb: "KB5001716",
    title: "Update for Windows Update Service components",
    sizeMb: 12,
    category: "quality",
  },
];

interface UpdateStore {
  byNode: Record<string, WindowsUpdateState>;

  /** The node's state, minting a healthy one on first read. */
  stateFor: (nodeId: string) => WindowsUpdateState;
  /** Replace a node's state wholesale. The escape hatch the others build on. */
  setFor: (nodeId: string, next: WindowsUpdateState) => void;

  check: (nodeId: string) => void;
  install: (nodeId: string) => void;
  restart: (nodeId: string) => void;
  pause: (nodeId: string) => void;
  resume: (nodeId: string) => void;
  setAutomatic: (nodeId: string, on: boolean) => void;
  setWsus: (nodeId: string, server: string | null) => void;

  /**
   * The ticket-engine door.
   *
   * `error` arms the NEXT scan or install to fail with that code; `pending`
   * seeds what a scan will find. Nothing here changes the visible phase
   * immediately — a machine that flipped to "failed" without the operator
   * having asked it to do anything would give the fault away before they had
   * looked, and finding the fault is the exercise.
   */
  inject: (nodeId: string, fault: { error?: UpdateErrorCode | null; pending?: PendingUpdate[] }) => void;
  /** Clear an armed fault. Used by DevTools and by a ticket that resolves. */
  clearFault: (nodeId: string) => void;
  /** Armed faults, separate from visible state. */
  faults: Record<string, { error: UpdateErrorCode | null; pending: PendingUpdate[] }>;
}

const NO_FAULT = { error: null, pending: SAMPLE_PENDING };

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  byNode: {},
  faults: {},

  stateFor: (nodeId) => get().byNode[nodeId] ?? freshUpdateState(),

  setFor: (nodeId, next) => set((s) => ({ byNode: { ...s.byNode, [nodeId]: next } })),

  check: (nodeId) => {
    const cur = get().stateFor(nodeId);
    const started = beginCheck(cur);
    // Refused (paused, or already busy): `beginCheck` returns the input
    // unchanged, and writing it back would still be correct but pointless.
    if (started === cur) return;
    get().setFor(nodeId, started);

    /*
     * A scan takes a beat. Real enough to read, short enough not to be a tax
     * on a student checking a dozen machines — and it is the only place the
     * "Checking for updates…" state is visible, so it cannot be instant.
     */
    window.setTimeout(() => {
      const fault = get().faults[nodeId] ?? NO_FAULT;
      get().setFor(nodeId, completeCheck(get().stateFor(nodeId), fault.pending, fault.error));
    }, 1400);
  },

  install: (nodeId) => {
    const fault = get().faults[nodeId] ?? NO_FAULT;
    const cur = get().stateFor(nodeId);
    if (cur.phase !== "available") return;
    get().setFor(nodeId, { ...cur, phase: "installing", progressPct: 0 });
    window.setTimeout(() => {
      // Re-read `cur` rather than closing over it: the operator may have
      // navigated, and installing onto a stale snapshot would resurrect it.
      const live = get().stateFor(nodeId);
      get().setFor(nodeId, installPending({ ...live, phase: "available" }, fault.error));
    }, 1600);
  },

  restart: (nodeId) => get().setFor(nodeId, restartComplete(get().stateFor(nodeId))),
  pause: (nodeId) => get().setFor(nodeId, pauseUpdates(get().stateFor(nodeId))),
  resume: (nodeId) => get().setFor(nodeId, resumeUpdates(get().stateFor(nodeId))),

  setAutomatic: (nodeId, on) => {
    const cur = get().stateFor(nodeId);
    // Group Policy wins. A managed machine's applet is read-only, which is the
    // whole reason a policy fault cannot be fixed from this screen.
    if (cur.managedByPolicy) return;
    get().setFor(nodeId, { ...cur, automaticUpdates: on });
  },

  setWsus: (nodeId, server) => get().setFor(nodeId, applyWsusPolicy(get().stateFor(nodeId), server)),

  inject: (nodeId, fault) =>
    set((s) => ({
      faults: {
        ...s.faults,
        [nodeId]: {
          error: fault.error ?? s.faults[nodeId]?.error ?? null,
          pending: fault.pending ?? s.faults[nodeId]?.pending ?? SAMPLE_PENDING,
        },
      },
    })),

  clearFault: (nodeId) =>
    set((s) => {
      const faults = { ...s.faults };
      delete faults[nodeId];
      return { faults };
    }),
}));
