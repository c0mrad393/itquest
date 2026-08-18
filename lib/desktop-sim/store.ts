"use client";

/**
 * ITQuest — Desktop simulator store
 * =================================
 * A thin shell over `parts.ts`, for the same reason the rig store was thin:
 * every rule is a pure function, so a different renderer — or a test — can ask
 * the same questions and get the same answers.
 *
 * Session-scoped. A half-built PC surviving a reload is not a state anyone
 * asked to keep.
 */

import { create } from "zustand";
import {
  EMPTY_BUILD,
  canInstall,
  connect,
  install,
  nextStep,
  report,
  reset,
  type BuildReport,
  type BuildState,
  type CableId,
  type PartId,
  type Step,
} from "./parts";

interface DesktopSimStore {
  build: BuildState;
  /** Part the operator has picked up off the desk, if any. */
  held: PartId | null;
  /** Part under the cursor, for the snap highlight. */
  hovered: PartId | null;

  pick: (id: PartId | null) => void;
  hover: (id: PartId | null) => void;
  place: (id: PartId) => void;
  route: (id: CableId) => void;
  restart: () => void;

  /** Derived on read — no completion flag to fall out of sync. */
  status: () => BuildReport;
  guidance: () => Step | null;
  placeable: (id: PartId) => boolean;
}

export const useDesktopSimStore = create<DesktopSimStore>((set, get) => ({
  build: EMPTY_BUILD,
  held: null,
  hovered: null,

  pick: (id) => set((s) => ({ held: s.held === id ? null : id })),
  hover: (id) => set({ hovered: id }),

  // Illegal placements are refused inside the model, so a view that forgets to
  // check `canInstall` gets "nothing happened" rather than an impossible build.
  place: (id) => set((s) => ({ build: install(s.build, id), held: null })),
  route: (id) => set((s) => ({ build: connect(s.build, id) })),
  restart: () => set({ build: reset(), held: null, hovered: null }),

  status: () => report(get().build),
  guidance: () => nextStep(get().build),
  placeable: (id) => canInstall(get().build, id),
}));
