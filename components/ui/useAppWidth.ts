"use client";

/**
 * ITQuest — how wide is this app, right now
 * ==========================================
 * The width of the element an app is rendered into, measured live.
 *
 * ── WHY NOT A BREAKPOINT ────────────────────────────────────────────────────
 *
 * `sm:` and `md:` answer a question about the BROWSER VIEWPORT. These apps
 * live in windows the operator drags to any size they like, so a 380-pixel
 * Ticket Center and a maximised one on the same 27-inch screen resolve every
 * media query identically. Half the apps here have no breakpoints at all and
 * adding some would not have helped: it would have changed their layout when
 * the browser was resized, which is not the thing that moved.
 *
 * ── WHY NOT ASK THE WINDOW MANAGER ──────────────────────────────────────────
 *
 * `WindowFrame` has `win.w`, but it is wrong in the two cases that matter: a
 * maximised window is laid out at `100%` and never writes its pixel width
 * back, and during a resize gesture the frame is painted directly to the DOM
 * each frame without touching React, so the store's value lags the pointer by
 * the whole drag.
 *
 * Observing the element is right in all three cases, costs one observer per
 * app that asks, and needs no plugin.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Default width below which a two-pane app should show one pane.
 *
 * Measured rather than guessed: the Ticket Center's queue will not go below
 * 16rem and its detail needs roughly 20rem to read as a document rather than a
 * column of orphaned words, so the split stops being worth having a little
 * over 600 pixels. Apps with different geometry pass their own.
 */
export const NARROW_PX = 620;

export function useAppWidth<T extends HTMLElement>(threshold: number = NARROW_PX): {
  ref: React.RefObject<T>;
  width: number;
  /** Null until the first measurement, so nothing flashes the wrong layout. */
  narrow: boolean | null;
} {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure once up front: the observer fires on its own schedule, and an
    // app that renders wide for a frame and then snaps is the flash this hook
    // exists to avoid.
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width, narrow: width === 0 ? null : width < threshold };
}
