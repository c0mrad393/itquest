"use client";

/**
 * The Phase 1 placeholder for a section that has a route but no screen yet.
 *
 * It lists what the section WILL hold, drawn from the same mock fixtures the
 * built pages use, so the reader can see the shape of the data even though the
 * table is not written. An empty state that says only "coming soon" tells the
 * reader nothing they did not already know from the sidebar badge.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import Link from "next/link";
import AdminIcon from "./AdminIcon";
import { ADMIN_SECTIONS } from "@/lib/admin/nav";
import { ADMIN_USERS, SUBSCRIPTIONS, ACTIVE_SCENARIOS, openTickets } from "@/lib/admin/mock-data";

/** What each unbuilt section already has fixtures for. */
const PREVIEW: Record<string, { stat: string; points: string[] }> = {
  users: {
    stat: `${ADMIN_USERS.length} accounts in the fixture`,
    points: [
      "Role and status filters across every org",
      "Per-user progression, completions and last-seen",
      "Suspend, reset progress and reassign org",
    ],
  },
  tickets: {
    stat: `${openTickets()} open across ${ACTIVE_SCENARIOS.length} runs`,
    points: [
      "Support requests raised by operators mid-scenario",
      "Triage queue with assignment and SLA",
      "Link a ticket back to the run that produced it",
    ],
  },
  subscriptions: {
    stat: `${SUBSCRIPTIONS.length} accounts, ${SUBSCRIPTIONS.reduce((n, s) => n + s.seats, 0)} seats`,
    points: [
      "Seat allocation and utilisation per org",
      "Plan, renewal date and billing contact",
      "Trial-to-pilot-to-enterprise transitions",
    ],
  },
  settings: {
    stat: "Platform-wide configuration",
    points: [
      "Default scenario pack and difficulty floor",
      "Data retention and export policy",
      "SSO, webhooks and API credentials",
    ],
  },
};

export default function ComingSoon({ slug }: { slug: string }) {
  const section = ADMIN_SECTIONS.find((s) => s.slug === slug);
  const preview = PREVIEW[slug];

  return (
    <div className="rounded-lg border border-dashed border-edge bg-surface/50 p-8">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-edge bg-surface-2 text-gray-500">
          <AdminIcon id={section?.iconId ?? "settings"} size={19} />
        </span>
        <h2 className="mt-3 text-[15px] font-semibold text-gray-100">Not built yet</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
          Phase 1 ships the dashboard and the simulator bench. This section has its route, its
          navigation and its fixtures — it does not have its screen.
        </p>

        {preview && (
          <div className="mt-5 w-full rounded-md border border-edge bg-surface p-4 text-left">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Planned · {preview.stat}
            </div>
            <ul className="space-y-1.5">
              {preview.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-[12px] text-gray-400">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/admin"
          className="mt-5 rounded-md border border-edge px-3 py-1.5 text-[12px] text-gray-300 transition hover:bg-panelalt"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
