"use client";

/**
 * Placeholder body for host apps not yet implemented. Keeps the desktop fully
 * navigable in Phase 2; each is replaced by its real component in a later phase.
 */

import { HOST_APP_REGISTRY, type HostAppId } from "@/lib/core";

const PHASE_NOTE: Partial<Record<HostAppId, string>> = {
  mail: "Corporate mail client — arrives with the Dialogue Engine (Phase 5).",
  gateway: "Remote Gateway Manager — arrives with nested sessions (Phase 3).",
  toolbox: "Tech Toolbox & Documentation Center — content pass (Phase 5+).",
  leaderboard: "Global leaderboard — arrives with gamification (Phase 6).",
  settings: "Workstation settings — polish pass (Phase 6).",
};

export default function PlaceholderApp({ appId }: { appId: HostAppId }) {
  const meta = HOST_APP_REGISTRY[appId];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-panel p-8 text-center">
      <div className="text-5xl opacity-80">{meta.icon}</div>
      <div className="text-base font-semibold text-gray-100">{meta.title}</div>
      <p className="max-w-sm text-xs leading-relaxed text-gray-500">{meta.description}</p>
      <div className="mt-2 rounded-full border border-edge bg-panelalt px-3 py-1 text-[11px] text-info">
        {PHASE_NOTE[appId] ?? "Coming in a later phase."}
      </div>
    </div>
  );
}
