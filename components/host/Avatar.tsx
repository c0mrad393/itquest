"use client";

/**
 * Avatar — an operator's likeness, drawn rather than picked.
 *
 * Either an https image (a Google account photo / custom URL) or a generated
 * monogram: initials on a two-stop gradient chosen from `avatar` when it names
 * a palette, otherwise hashed from the display name so everyone gets a stable,
 * distinct colour. No emoji — see lib/core/identity.ts.
 *
 * Size comes from `className` (h-* / w-*); the monogram scales with the box, so
 * one component serves the 24px taskbar and the 96px profile header alike.
 */

import { initialsOf, isImageAvatar, paletteFor } from "@/lib/core";

export default function Avatar({
  value,
  name,
  className = "h-10 w-10",
  title,
}: {
  /** Palette id, or an https image URL. */
  value: string;
  /** Display name the monogram is derived from. */
  name: string;
  className?: string;
  title?: string;
}) {
  if (isImageAvatar(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={name}
        title={title ?? name}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const p = paletteFor(value, name);
  const initials = initialsOf(name);
  // Keyed by palette so two avatars on screen can't collide on the gradient id.
  const gid = `av-${p.id}`;

  return (
    <svg
      viewBox="0 0 40 40"
      className={`shrink-0 rounded-full ${className}`}
      role="img"
      aria-label={name}
    >
      <title>{title ?? name}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${gid})`} />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill={p.fg}
        fontSize={initials.length > 1 ? 15 : 18}
        fontWeight={600}
        letterSpacing="0.5"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}
