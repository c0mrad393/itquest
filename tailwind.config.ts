import type { Config } from "tailwindcss";

/**
 * Every colour resolves through a CSS custom property defined in
 * app/theme.css, so switching `.theme-dark` / `.theme-light` on <html>
 * re-themes the whole product — including the nested ServerOS and DeskOS
 * surfaces — without any component knowing a theme exists.
 *
 * `rgb(var(--x) / <alpha-value>)` rather than a plain var reference: the app
 * leans hard on opacity modifiers (`bg-info/15`, `text-gray-500/60`), and the
 * alpha placeholder is what keeps those working.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * A full 50–950 scale for one accent family, built from its three role tokens.
 *
 * WHY EVERY SHADE, including ones nothing uses today. v0.9.0 mapped only the
 * shades it found in the codebase, so the ones it missed fell through to stock
 * Tailwind — pale tints designed to sit on dark grounds, rendering at 1.3:1 on
 * the new white panels. Enumerating the whole scale closes the hole
 * permanently: there is no shade left that can resolve to an unthemed value,
 * and a `text-rose-800` written next month lands correctly with no follow-up.
 *
 * The three roles map by INTENT, not by lightness. In this codebase the low
 * shades were always chosen as "readable tint on a dark panel" and the high
 * shades as "dark wash behind it" — so the low end becomes `-text` (which
 * flips to dark ink in light mode) and the high end becomes `-deep` (which
 * flips to a pale wash), exactly like the inverted grey ramp.
 */
const family = (name: string) => {
  const text = v(`${name}-text`);
  const base = v(`${name}-base`);
  const deep = v(`${name}-deep`);
  return {
    50: text,
    100: text,
    200: text,
    300: text,
    400: base,
    500: base,
    600: base,
    700: deep,
    800: deep,
    900: deep,
    950: deep,
    DEFAULT: base,
  };
};

/** The neutral ramp, reused for `slate`/`zinc`/`neutral`/`stone` aliases. */
const neutral = {
  50: v("g-50"),
  100: v("g-100"),
  200: v("g-200"),
  300: v("g-300"),
  400: v("g-400"),
  500: v("g-500"),
  600: v("g-600"),
  700: v("g-700"),
  800: v("g-800"),
  900: v("g-900"),
  950: v("surface-sunken"),
};

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /**
         * The neutral ramp is REDEFINED, not extended. ~950 existing
         * `text-gray-*` utilities were written for a dark UI; theme.css
         * inverts this ramp in light mode so each one keeps its intent
         * (bright stays prominent, dim stays secondary) in both themes.
         */
        gray: neutral,
        slate: neutral,
        zinc: neutral,
        neutral: neutral,
        stone: neutral,

        /* Surfaces, back to front. `panel`/`panelalt` are the historical
           names and stay as aliases so existing markup keeps working. */
        sunken: v("surface-sunken"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        panel: v("surface"),
        panelalt: v("surface-2"),
        edge: v("edge"),
        "edge-strong": v("edge-strong"),
        term: v("term"),
        "term-fg": v("term-fg"),

        /* Remote-session chrome — see components/host/remote/RemoteChrome.tsx */
        "remote-tint": v("remote-tint"),
        "remote-edge": v("remote-edge"),
        "remote-bar": v("remote-bar"),
        "remote-bar-fg": v("remote-bar-fg"),

        /**
         * BRAND — the one vivid colour in the product that does NOT mean a
         * status. Split by job: a fill dark enough to carry white text can
         * never double as readable text itself.
         */
        brand: {
          DEFAULT: v("brand-fill"),
          fill: v("brand-fill"),
          hover: v("brand-fill-hover"),
          on: v("brand-on"),
          text: v("brand-text"),
          soft: v("brand-soft"),
        },

        /* Semantic accents, still addressable by their short names. */
        info: v("info-base"),
        "info-strong": v("info-text"),
        accent: v("accent-base"),
        "accent-strong": v("accent-text"),
        warn: v("warn-base"),
        "warn-strong": v("warn-text"),
        danger: v("danger-base"),
        "danger-strong": v("danger-text"),

        /**
         * Raw Tailwind family names, remapped wholesale onto the semantic
         * families. Existing status indicators keep their meaning and gain
         * correct light-mode contrast without a component-by-component sweep;
         * anything written later cannot fall through to an unthemed value.
         */
        emerald: family("accent"),
        green: family("accent"),
        teal: family("accent"),
        lime: family("accent"),
        amber: family("warn"),
        yellow: family("warn"),
        orange: family("warn"),
        red: family("danger"),
        rose: family("danger"),
        pink: family("danger"),
        sky: family("info"),
        blue: family("info"),
        cyan: family("info"),
        indigo: family("info"),
        violet: family("violet"),
        purple: family("violet"),
        fuchsia: family("violet"),
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        // A slightly softer default: the old UI was all hard 4px corners.
        DEFAULT: "0.375rem",
      },
      boxShadow: {
        panel:
          "0 1px 2px rgb(0 0 0 / calc(var(--shadow-strength) * 0.5)), 0 8px 24px rgb(0 0 0 / calc(var(--shadow-strength) * 0.6))",
        /* Remote windows sit "further away" than host windows. */
        remote:
          "0 0 0 1px rgb(var(--remote-edge) / 0.55), 0 10px 40px rgb(0 0 0 / calc(var(--shadow-strength) * 0.9))",
      },
    },
  },
  plugins: [],
};

export default config;
