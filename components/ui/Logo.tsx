"use client";

/**
 * ITQuest — the mark
 * ==================
 * A bracket, a cursor and a waypoint.
 *
 * ── WHAT IT IS SAYING ───────────────────────────────────────────────────────
 *
 * The product is two ideas at once: a terminal (IT) and a progression (Quest).
 * Most attempts at that end up as a monitor with a swoosh, because the literal
 * route — draw a computer, draw an arrow — has nothing left to combine. So the
 * mark uses the one glyph that already means "command line" to everybody who
 * would play this: the angle bracket of a shell prompt.
 *
 * The bracket opens to the right and a filled diamond sits in its mouth: a map
 * waypoint, the quest half, placed exactly where a prompt's cursor would blink.
 * One shape reads as both, which is the only reason to combine them at all.
 *
 * ── WHY IT IS DRAWN, NOT SET IN TYPE ────────────────────────────────────────
 *
 * A wordmark that depends on a font is a wordmark that changes when the font
 * fails to load, and this one appears on a boot screen where nothing else has
 * loaded yet. The glyph is geometry; only the word beside it is type, and the
 * word is allowed to reflow.
 *
 * `currentColor` throughout, so it inherits — the mark works in a taskbar, on
 * the landing page's near-black, and on a boot screen, without variants.
 *
 * SVG only — no emoji.
 */

export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      {/* The prompt bracket. Round joins so it reads as drawn rather than cut. */}
      <path
        d="M8 9L15 16L8 23"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The waypoint, sitting where the cursor blinks. */}
      <path d="M23.5 12.5L27 16L23.5 19.5L20 16L23.5 12.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * "IT" and "Quest" carry different weights so the compound reads as one word
 * with two halves rather than as two words — the same trick the product name
 * is doing.
 */
export function Logo({
  size = 24,
  className = "",
  markClassName = "",
}: {
  size?: number;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} className={markClassName} />
      <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.66 }}>
        <span className="font-bold">IT</span>
        <span className="font-normal opacity-90">Quest</span>
      </span>
    </span>
  );
}
