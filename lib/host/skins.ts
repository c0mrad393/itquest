"use client";

/**
 * ITQuest — Desktop skins
 * =======================
 * Named looks: Standard, Cyber Hacker, Clean Corporate, High Contrast.
 *
 * ── A SECOND DIMENSION, NOT A REPLACEMENT ───────────────────────────────────
 *
 * The obvious build makes each skin a complete theme and drops the existing
 * light/dark split into it. That doubles to eight palettes to maintain, and —
 * worse — it takes the operator's system preference away: choosing "Cyber
 * Hacker" would silently opt them out of light mode, which is an accessibility
 * setting, not a taste one.
 *
 * So a skin is ORTHOGONAL to lightness. `.theme-light` / `.theme-dark` keeps
 * owning how bright the surfaces are; `[data-skin]` overrides only the tokens
 * that carry personality — the brand hue, the edges, the taskbar's opacity,
 * corner radius, the font. Every skin works in both themes because neither
 * knows about the other.
 *
 * Two exceptions are declared honestly rather than hidden:
 *
 *   - Cyber Hacker is a dark aesthetic. In light mode it keeps light surfaces
 *     (the preference wins) and expresses itself through hue and geometry
 *     instead. It does not fight the theme.
 *   - High Contrast raises contrast in BOTH themes and is the one skin that
 *     touches the neutral ramp, because that is the entire point of it.
 *
 * ── WHY THE VALUES LIVE IN CSS, NOT HERE ────────────────────────────────────
 *
 * This module is the registry — ids, labels, descriptions, persistence. The
 * actual token values are in theme.css under `[data-skin="…"]` selectors, next
 * to the tokens they override, so a palette change is one file rather than a
 * hunt across a store and a stylesheet.
 */

import { create } from "zustand";

const KEY = "itquest-skin";

export type SkinId = "standard" | "cyber" | "corporate" | "contrast";

export interface SkinMeta {
  id: SkinId;
  label: string;
  /** One line, shown under the label in Appearance. */
  blurb: string;
  /** Two swatch colours for the preview chip, as literal hex. */
  swatch: [string, string];
}

export const SKINS: SkinMeta[] = [
  {
    id: "standard",
    label: "DeskOS Standard",
    blurb: "The default. Electric indigo on soft panels, rounded corners.",
    swatch: ["#4f57f6", "#0f141c"],
  },
  {
    id: "cyber",
    label: "Cyber Hacker",
    blurb: "Terminal green, hard edges, monospaced chrome and a near-opaque taskbar.",
    swatch: ["#22e08a", "#04120b"],
  },
  {
    id: "corporate",
    label: "Clean Corporate",
    blurb: "Muted steel blue, generous spacing, softened shadows. Quiet by design.",
    swatch: ["#3b71c9", "#f2f5fa"],
  },
  {
    id: "contrast",
    label: "High Contrast",
    blurb: "Maximum separation: heavier borders, stronger ink, no translucency.",
    swatch: ["#ffd400", "#000000"],
  },
];

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === "string" && SKINS.some((s) => s.id === v);
}

/**
 * Stamp the skin on <html>.
 *
 * An ATTRIBUTE rather than a class, deliberately: `applyTheme` in theme.ts
 * manipulates the class list and would have to know which of the classes it
 * finds are skins and which are themes. Separate namespaces mean neither
 * function can clobber the other, which matters because they run
 * independently on boot.
 */
export function applySkin(skin: SkinId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skin;
}

function readStored(): SkinId {
  if (typeof window === "undefined") return "standard";
  try {
    const raw = localStorage.getItem(KEY);
    return isSkinId(raw) ? raw : "standard";
  } catch {
    return "standard";
  }
}

interface SkinStore {
  skin: SkinId;
  ready: boolean;
  init: () => void;
  setSkin: (skin: SkinId) => void;
}

export const useSkinStore = create<SkinStore>((set) => ({
  skin: "standard",
  ready: false,

  init: () => {
    const skin = readStored();
    applySkin(skin);
    set({ skin, ready: true });
  },

  setSkin: (skin) => {
    applySkin(skin);
    try {
      localStorage.setItem(KEY, skin);
    } catch {
      /* preference not persisted; the session still honours it */
    }
    set({ skin });
  },
}));
