"use client";

/**
 * Section icons for the admin nav.
 *
 * Local to the admin panel rather than added to the shared set: these are six
 * navigational glyphs for one surface, and the shared icon module is already
 * carrying a hundred simulation-domain icons. Keeping them here means the
 * admin panel can be lifted out whole.
 *
 * SVG only — no emoji.
 */

import type { AdminIconId } from "@/lib/admin/nav";

const PATHS: Record<AdminIconId, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0112 0" />
      <path d="M16.5 5.5a3.2 3.2 0 010 6M17 20a6 6 0 00-2-4.5" />
    </>
  ),
  simulator: (
    <>
      <rect x="2.5" y="5" width="19" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M6.5 11.5l2.5-2.5 2.5 3 3-4 2.5 3.5" />
    </>
  ),
  tickets: (
    <>
      <path d="M3 8.5A1.5 1.5 0 014.5 7h15A1.5 1.5 0 0121 8.5v2a2 2 0 000 4v2a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 16.5v-2a2 2 0 000-4z" />
      <path d="M13 7v11" strokeDasharray="2 2" />
    </>
  ),
  library: (
    <>
      <path d="M4 4.5v15M8 4.5v15" />
      <rect x="11.5" y="4.5" width="4" height="15" rx="1" />
      <path d="M18.2 5.3l2.6 14.2" />
    </>
  ),
  subscriptions: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3" />
    </>
  ),
};

export default function AdminIcon({
  id,
  size = 16,
  className = "",
}: {
  id: AdminIconId;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[id]}
    </svg>
  );
}
