"use client";

/**
 * TriageOS — Field Ops / Dispatch store
 * =====================================
 * Session state for the Hardware Lab: which workshop steps a ticket has
 * completed (provisioning), and the live field-dispatch countdowns. When a
 * dispatch timer hits 0 it flips the target node online + healthy via the
 * infra store, and the TicketReconciler then auto-resolves the hardware ticket.
 */

import { create } from "zustand";
import { useInfraStore } from "@/lib/infra/store";
import type { WorkshopStage } from "./types";

export type DispatchStatus = "pending" | "in_progress" | "completed";

export interface DispatchState {
  ticketId: string;
  targetNodeId: string;
  status: DispatchStatus;
  timeLeft: number; // seconds
  total: number; // seconds
  note: string;
}

/** Per-ticket cross-stage results the imaging phase reads (fault logic). */
export interface StageResult {
  /** Assembly left screws/battery/cables incomplete → imaging power-faults. */
  assemblyFaulty?: boolean;
  assemblyFault?: string;
  /** BIOS met the ticket's required states. */
  biosOk?: boolean;
}

interface FieldOpsState {
  /** Per-ticket completed workshop stages. */
  steps: Record<string, Partial<Record<WorkshopStage, boolean>>>;
  /** Per-ticket cross-stage results. */
  results: Record<string, StageResult>;
  /** Per-ticket field dispatch. */
  dispatches: Record<string, DispatchState>;

  completeStep: (ticketId: string, step: WorkshopStage) => void;
  setResult: (ticketId: string, patch: StageResult) => void;
  isProvisioned: (ticketId: string, required: WorkshopStage[]) => boolean;
  startDispatch: (ticketId: string, targetNodeId: string, seconds: number) => void;
  /** 1 Hz tick from the headless HardwareDispatchEngine. */
  tick: () => void;
  clear: (ticketId: string) => void;
  reset: () => void;
}

const IN_TRANSIT_NOTE = "Field technician is moving the unit to rack 4B…";
const DONE_NOTE = "Physical swap complete — device powered on and back online.";

export const useFieldOpsStore = create<FieldOpsState>((set, get) => ({
  steps: {},
  results: {},
  dispatches: {},

  completeStep: (ticketId, step) =>
    set((s) => ({
      steps: { ...s.steps, [ticketId]: { ...s.steps[ticketId], [step]: true } },
    })),

  setResult: (ticketId, patch) =>
    set((s) => ({
      results: { ...s.results, [ticketId]: { ...s.results[ticketId], ...patch } },
    })),

  isProvisioned: (ticketId, required) => {
    const done = get().steps[ticketId] ?? {};
    return required.every((r) => done[r]);
  },

  startDispatch: (ticketId, targetNodeId, seconds) =>
    set((s) => ({
      dispatches: {
        ...s.dispatches,
        [ticketId]: { ticketId, targetNodeId, status: "in_progress", timeLeft: seconds, total: seconds, note: IN_TRANSIT_NOTE },
      },
    })),

  tick: () => {
    const { dispatches } = get();
    const active = Object.values(dispatches).filter((d) => d.status === "in_progress");
    if (active.length === 0) return;

    const completed: DispatchState[] = [];
    set((s) => {
      const next: Record<string, DispatchState> = { ...s.dispatches };
      for (const d of active) {
        const timeLeft = d.timeLeft - 1;
        if (timeLeft <= 0) {
          next[d.ticketId] = { ...d, timeLeft: 0, status: "completed", note: DONE_NOTE };
          completed.push(next[d.ticketId]);
        } else {
          next[d.ticketId] = { ...d, timeLeft };
        }
      }
      return { dispatches: next };
    });

    // Flip the physical node online + healthy; the reconciler resolves the ticket.
    for (const d of completed) {
      useInfraStore.getState().completeHardwareReplacement(d.targetNodeId);
    }
  },

  clear: (ticketId) =>
    set((s) => {
      const steps = { ...s.steps };
      const dispatches = { ...s.dispatches };
      const results = { ...s.results };
      delete steps[ticketId];
      delete dispatches[ticketId];
      delete results[ticketId];
      return { steps, dispatches, results };
    }),

  reset: () => set({ steps: {}, results: {}, dispatches: {} }),
}));
