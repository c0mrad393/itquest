"use client";

/**
 * TriageOS — Fullscreen (HTML5 Fullscreen API)
 * ============================================
 * Lets the shell take over the monitor so it reads as a real OS rather than a
 * page. Kept in one module because the API is still vendor-prefixed on Safari
 * and the ceremony should not leak into components.
 *
 * The browser owns the truth here — the user can leave with Escape without
 * telling us — so state is read from `fullscreenElement` via an event listener
 * rather than tracked locally.
 */

import { useEffect, useState } from "react";

interface VendorDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
interface VendorElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

function currentElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as VendorDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function isFullscreen(): boolean {
  return currentElement() !== null;
}

export async function toggleFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const d = document as VendorDocument;
  try {
    if (currentElement()) {
      await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      return;
    }
    const el = document.documentElement as VendorElement;
    await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  } catch {
    // Denied (no user gesture, or blocked by policy) — the toggle simply
    // does nothing rather than throwing into a click handler.
  }
}

/** Live fullscreen state, correct even when the user leaves via Escape. */
export function useFullscreen(): [boolean, () => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  return [on, () => void toggleFullscreen()];
}
