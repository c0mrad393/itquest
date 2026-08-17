"use client";

/**
 * ITQuest — Hardware bench store
 * ==============================
 * The live rig on the bench. Deliberately a THIN shell: every action delegates
 * to a pure transition in `rig.ts` and writes the result back.
 *
 * That thinness is the deliverable, not an accident of style. The brief asks
 * that this state be mappable onto a 3D canvas later, which is only true if the
 * rules are not in here — a WebGL scene would import the same `canRemove` and
 * `removePart` and behave identically. If any gating logic lived in this file,
 * a second view would have to reimplement it and the two would drift on the
 * first edge case.
 *
 * Session-scoped, not persisted: a bench is a workspace, and a half-torn-down
 * machine surviving a reload would be a state nobody asked to keep. The
 * SCENARIO is what a ticket owns; the teardown in progress is not.
 */

import { create } from "zustand";
import {
  buildDesktopRig,
  insertPart,
  nextAction,
  post,
  removePart,
  setCable,
  toggleFastener,
  type PostResult,
  type Rig,
  type RigFault,
} from "./rig";

interface HardwareStore {
  rig: Rig;
  /** Which scenario is loaded, so the UI can name the job. */
  fault: RigFault;
  /** Slot the operator has selected in the blueprint, if any. */
  selected: string | null;

  loadScenario: (fault: RigFault) => void;
  select: (slotId: string | null) => void;

  /** Screws and clips share one action — both are "release before it moves". */
  toggleClip: (slotId: string, fastenerId: string) => void;
  unfastenScrew: (slotId: string, fastenerId: string) => void;

  connectCable: (cableId: string) => void;
  disconnectCable: (cableId: string) => void;

  removeComponent: (slotId: string) => void;
  insertComponent: (slotId: string, partId: string) => void;

  /** Derived, never stored — see the note on `post`. */
  postResult: () => PostResult;
  hint: () => { slotId: string; hint: string } | null;
}

export const useHardwareStore = create<HardwareStore>((set, get) => ({
  rig: buildDesktopRig("faulty-ram"),
  fault: "faulty-ram",
  selected: null,

  loadScenario: (fault) => set({ rig: buildDesktopRig(fault), fault, selected: null }),
  select: (slotId) => set({ selected: slotId }),

  /*
   * `toggleClip` and `unfastenScrew` are separate entry points because the
   * brief names them separately and because they read differently at the call
   * site — but they are the same transition underneath, since the model already
   * distinguishes a clip from a screw by its `kind`. Two implementations of one
   * rule is how the two get to disagree later.
   */
  toggleClip: (slotId, fastenerId) => set((s) => ({ rig: toggleFastener(s.rig, slotId, fastenerId) })),
  unfastenScrew: (slotId, fastenerId) => set((s) => ({ rig: toggleFastener(s.rig, slotId, fastenerId) })),

  connectCable: (cableId) => set((s) => ({ rig: setCable(s.rig, cableId, true) })),
  disconnectCable: (cableId) => set((s) => ({ rig: setCable(s.rig, cableId, false) })),

  // Both refuse illegal moves inside the model rather than here, so a view that
  // forgets to check `canRemove` gets "nothing happened" instead of a torn rig.
  removeComponent: (slotId) => set((s) => ({ rig: removePart(s.rig, slotId) })),
  insertComponent: (slotId, partId) => set((s) => ({ rig: insertPart(s.rig, slotId, partId) })),

  postResult: () => post(get().rig),
  hint: () => nextAction(get().rig),
}));
