/**
 * EmptyState (v0.9.0)
 * ===================
 * A panel with nothing in it used to render as nothing at all, or as a bare
 * grey line of nine-pixel text. Both read as breakage to someone who does not
 * yet know what the panel is FOR — and "is this broken or am I done?" is the
 * question a beginner cannot answer on their own.
 *
 * So every empty surface now says three things in the same shape:
 *   - a muted glyph, so the space reads as designed rather than unpainted
 *   - a HEADING that states the condition ("Inbox zero")
 *   - one line of body copy that says what happens next, or what to do
 *
 * The distinction that matters: "nothing here yet" is calm, not an error.
 * Colour stays neutral; the alert palette is reserved for things that are
 * actually wrong.
 *
 * SVG icons only — no emoji.
 */

import type { ReactNode } from "react";

export default function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  /** For narrow sidebars and short panes, where the full version would clip. */
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "gap-1.5 px-4 py-8" : "gap-3 px-6 py-14"
      }`}
    >
      {icon && (
        <span
          className={`flex items-center justify-center rounded-full bg-surface-3 text-gray-500 ${
            compact ? "h-9 w-9" : "h-14 w-14"
          }`}
        >
          {icon}
        </span>
      )}
      <h3 className={`font-semibold text-gray-200 ${compact ? "text-[12px]" : "text-[15px]"}`}>
        {title}
      </h3>
      {body && (
        <p
          className={`max-w-[34ch] leading-relaxed text-gray-500 ${
            compact ? "text-[11px]" : "text-[13px]"
          }`}
        >
          {body}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
