"use client";

/**
 * ITQuest — arm before firing
 * ============================
 * The two-press guard for an action that cannot be undone.
 *
 * ── WHY IT IS SHARED RATHER THAN COPIED ─────────────────────────────────────
 *
 * The admin panel had this and the simulator did not, so one product ran two
 * policies on irreversible work: `/admin` made you confirm before throwing
 * away somebody's progress, while the Aether console deleted a firewall rule,
 * the gateway deleted a saved profile, the floor un-racked a server and
 * Appearance reset the whole desktop layout — each on a single click, with no
 * undo behind any of them.
 *
 * Copying the admin version into four more files would have made five places
 * to fix the next thing wrong with it. The LOGIC lives here; the button stays
 * native to each app, because a tool-rail icon button and a table-row link
 * should not be forced into one shape to share a behaviour.
 *
 * ── WHY IT DISARMS ITSELF ───────────────────────────────────────────────────
 *
 * An armed control that stays armed is a trap: the operator arms it, looks
 * away, comes back and presses what they now read as a normal button. It
 * disarms after a few seconds, and the timer is cleaned up on unmount rather
 * than left to fire into a component that is gone.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { armReduce, IDLE, type ArmState } from "@/lib/ui/arm";

export const ARM_TIMEOUT_MS = 4000;

export interface Armed {
  /** Is this key currently armed? Drives the label and the styling. */
  isArmed: (key: string) => boolean;
  /**
   * Press the control. Returns TRUE when the caller should actually do the
   * thing — that is, on the second press.
   *
   * Returning a boolean rather than taking a callback keeps the destructive
   * call at the call site, where it is visible in the component that owns it.
   */
  press: (key: string) => boolean;
  /** Drop the arm — for a cancel button, or when the context changes. */
  disarm: () => void;
}

export function useArmed(timeoutMs: number = ARM_TIMEOUT_MS): Armed {
  /*
   * THE REF IS THE SOURCE OF TRUTH, the state is only for rendering.
   *
   * `press` has to answer "should this fire?" during the click, and a
   * `useState` updater does not run synchronously — reading a flag it sets
   * would return the value from before the press, so the second click would
   * never fire and the control would be permanently un-pressable. The ref is
   * read and written in the same tick; the state exists so the label and the
   * styling re-render.
   */
  const armedRef = useRef<ArmState>(IDLE);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const disarm = useCallback(() => {
    clear();
    armedRef.current = armReduce(armedRef.current, { type: "disarm" }).state;
    setArmedKey(armedRef.current.key);
  }, [clear]);

  const press = useCallback(
    (key: string) => {
      clear();
      const { state, fire } = armReduce(armedRef.current, { type: "press", key });
      armedRef.current = state;
      setArmedKey(state.key);
      if (fire) return true;
      timer.current = setTimeout(() => {
        const expired = armReduce(armedRef.current, { type: "expire", key });
        armedRef.current = expired.state;
        setArmedKey(expired.state.key);
      }, timeoutMs);
      return false;
    },
    [clear, timeoutMs],
  );

  return {
    isArmed: useCallback((key: string) => armedKey === key, [armedKey]),
    press,
    disarm,
  };
}
