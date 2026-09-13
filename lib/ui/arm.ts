/**
 * ITQuest — the arm-before-firing state machine (pure)
 * =====================================================
 * The decision behind every two-press destructive control.
 *
 * ── WHY IT IS SEPARATE FROM THE HOOK ────────────────────────────────────────
 *
 * The SEQUENCE is the contract — press arms, pressing the same thing fires,
 * pressing something else moves the arm, a timeout drops it — and a sequence
 * is the part that can quietly break. The first version of this lived inside
 * `useArmed` and asked a `useState` updater whether to fire; updaters do not
 * run synchronously, so it read the value from before the press and the second
 * click never fired. A control that arms and cannot be fired is a worse defect
 * than the missing confirmation it was added to fix.
 *
 * Pure and outside React, the whole sequence can be exercised directly.
 */

export interface ArmState {
  /** The key currently armed, or null. */
  key: string | null;
}

export type ArmAction =
  | { type: "press"; key: string }
  /** The arm timer elapsed for this key. Ignored if something else is armed. */
  | { type: "expire"; key: string }
  | { type: "disarm" };

export interface ArmResult {
  state: ArmState;
  /** True when the caller should actually perform the destructive action. */
  fire: boolean;
}

export const IDLE: ArmState = { key: null };

export function armReduce(state: ArmState, action: ArmAction): ArmResult {
  switch (action.type) {
    case "press":
      // Firing also disarms: holding the arm after the deed would leave the
      // next press on the same control firing with no confirmation at all.
      return state.key === action.key
        ? { state: IDLE, fire: true }
        : { state: { key: action.key }, fire: false };

    case "expire":
      /*
       * Keyed on purpose. A timer started for one control must not disarm a
       * different one the operator armed in the meantime — otherwise arming A,
       * then B, then waiting out A's timer silently drops B's arm and the
       * operator's next press on B only re-arms it.
       */
      return state.key === action.key ? { state: IDLE, fire: false } : { state, fire: false };

    case "disarm":
      return { state: IDLE, fire: false };
  }
}
