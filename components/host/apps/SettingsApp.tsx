"use client";

/**
 * Settings (Level-0 host app, Phase 6)
 * ------------------------------------
 * Operator profile, session/save status, manual save, and the simulation
 * reset (wipes the LocalStorage save and reboots into the fresh scenario
 * pack). Reset is a two-step confirm — it destroys progress.
 */

import { useState } from "react";
import { useHostStore } from "@/lib/host/store";
import { useInfraStore } from "@/lib/infra/store";
import { resetSimulation, saveNow, savedAt } from "@/lib/persistence/save";
import { levelForXp, xpForLevel } from "@/lib/scenario/scoring";

export default function SettingsApp() {
  const user = useHostStore((s) => s.host.user);
  const infra = useInfraStore((s) => s.infra);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(() =>
    typeof window === "undefined" ? null : savedAt(),
  );

  const level = levelForXp(user.xp);
  const nextLevelXp = xpForLevel(level + 1);
  const progressPct = Math.min(100, Math.round((user.xp / nextLevelXp) * 100));

  function onSave() {
    saveNow();
    setLastSaved(Date.now());
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto term-scroll bg-panel p-5 text-sm text-gray-200">
      {/* Profile */}
      <Section title="Operator profile">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-info/20 text-3xl">
            {user.avatar}
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold text-gray-100">{user.displayName}</div>
            <div className="text-[11px] text-gray-500">{user.role}</div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>
                  Level {level} · {user.xp.toLocaleString()} XP
                </span>
                <span>
                  next: {nextLevelXp.toLocaleString()} XP
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-edge">
                <div className="h-full rounded-full bg-info" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Session */}
      <Section title="Session">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Item label="Client environment" value={infra.clientOrg} />
          <Item label="Nodes" value={String(Object.keys(infra.nodes).length)} />
          <Item
            label="Last saved"
            value={lastSaved ? new Date(lastSaved).toLocaleTimeString() : "not saved yet"}
          />
          <Item label="Autosave" value="On (debounced)" />
        </div>
        <button
          onClick={onSave}
          className="mt-3 rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/20"
        >
          Save now
        </button>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <p className="mb-2 text-[11px] leading-relaxed text-gray-500">
          Resetting wipes the save (tickets, conversations, XP, node state) and reboots the
          workstation with a fresh scenario pack.
        </p>
        {confirmingReset ? (
          <div className="flex items-center gap-2">
            <button
              onClick={resetSimulation}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Yes, wipe everything
            </button>
            <button
              onClick={() => setConfirmingReset(false)}
              className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-300 hover:bg-panelalt"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="rounded-md border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
          >
            Reset simulation…
          </button>
        )}
      </Section>

      <div className="text-[10px] text-gray-600">
        TriageOS · client-side simulation · Next.js 14 + Zustand
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-panelalt p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      {children}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </div>
  );
}
