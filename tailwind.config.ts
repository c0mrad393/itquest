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
        gray: {
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
        },

        /* Surfaces, back to front. `panel`/`panelalt` are the historical
           names and stay as aliases so existing markup keeps working. */
        sunken: v("surface-sunken"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        panel: v("surface"),
        panelalt: v("surface-2"),
        edge: v("edge"),
        term: v("term"),
        "term-fg": v("term-fg"),

        /* Accents */
        info: v("info"),
        "info-strong": v("info-strong"),
        accent: v("accent"),
        "accent-strong": v("accent-strong"),
        warn: v("warn"),
        "warn-strong": v("warn-strong"),
        danger: v("danger"),
        "danger-strong": v("danger-strong"),

        /**
         * Emerald and amber are used directly in dozens of status indicators.
         * Mapping them onto the accent tokens means those keep their meaning
         * and gain light-mode contrast without a component-by-component sweep.
         */
        emerald: {
          300: v("accent-strong"),
          400: v("accent"),
          500: v("accent"),
        },
        amber: {
          200: v("warn-strong"),
          300: v("warn-strong"),
          400: v("warn"),
          500: v("warn"),
          600: v("warn-strong"),
        },
        red: { 300: v("danger-strong"), 500: v("danger") },
        sky: { 300: v("info-strong"), 500: v("info") },
        violet: { 300: v("info-strong"), 500: v("info") },
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
        panel: "0 1px 2px rgb(0 0 0 / calc(var(--shadow-strength) * 0.5)), 0 8px 24px rgb(0 0 0 / calc(var(--shadow-strength) * 0.6))",
      },
    },
  },
  plugins: [],
};

export default config;
