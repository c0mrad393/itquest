"use client";

/**
 * Scenario Library — every ticket family the estate can raise.
 *
 * ── THE SCREEN WHOSE JOB IS TO NOT LIE ──────────────────────────────────────
 *
 * Everything here is computed from the ticket library at render time, not from
 * a table somebody maintains. A family added to `procedural.ts` appears here
 * with no second edit; one removed disappears. The alternative — a curated
 * catalogue — is wrong within a week, and wrong in the worst direction, since
 * the one screen meant to tell you what exists becomes the one that misleads.
 *
 * ── IT REPORTS ON ITSELF ────────────────────────────────────────────────────
 *
 * Counting is the easy half. The column that earns its place is whether a
 * family can BIND to the estate it is sized against: a template that cannot is
 * not missing content, it is silent content — the factory skips it without
 * complaint and nothing anywhere says so. The same goes for one that binds
 * only sometimes, which is worse, because it looks fine whenever you check.
 *
 * The phase selector is the point of the screen: the free tier never leaves
 * growth phase 1, so "what does a free operator actually have" is a question
 * this page can answer rather than estimate.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { AdminPage, Card, FilterGroup, Pill, Stat, Toolbar, type Tone } from "@/components/admin/AdminShell";
import { describeLibrary, summarise, type LibraryEntry } from "@/lib/admin/library";
import { TIERS } from "@/lib/platform/tiers";
import type { GrowthPhase } from "@/lib/core";

const PHASES: { value: GrowthPhase; short: string; label: string }[] = [
  { value: 1, short: "P1", label: "Phase 1 · Startup — the only estate the free tier ever sees" },
  { value: 2, short: "P2", label: "Phase 2 · Small business" },
  { value: 3, short: "P3", label: "Phase 3 · Mid-market" },
  { value: 4, short: "P4", label: "Phase 4 · Enterprise" },
];

const TIER_SHORT: Record<string, string> = {
  Tier_1_Easy: "T1",
  Tier_2_Medium: "T2",
  Tier_3_Hard: "T3",
  Tier_4_Expert: "T4",
};

export default function ScenarioLibraryPage() {
  const [phase, setPhase] = useState<GrowthPhase>(1);
  const [track, setTrack] = useState<string>("all");
  const [origin, setOrigin] = useState<"all" | "procedural" | "authored">("all");
  const [query, setQuery] = useState("");

  /*
   * Three estates per phase, twelve binding attempts each. Enough to tell a
   * family that never binds from one that binds every time, which is the
   * distinction the last two columns exist to make — and cheap enough to
   * recompute when the phase changes.
   */
  const entries = useMemo(() => describeLibrary(phase), [phase]);
  const stats = useMemo(() => summarise(entries), [entries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (track !== "all" && e.track !== track) return false;
      if (origin === "procedural" && !e.procedural) return false;
      if (origin === "authored" && e.procedural) return false;
      if (q && !`${e.family} ${e.tags.join(" ")} ${e.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, track, origin, query]);

  const freeCap = TIERS.free.levelCap;
  const problems = stats.unhostable.length + stats.unreliable.length + stats.unplayable.length;

  return (
    <AdminPage
      title="Scenario Library"
      blurb="Every ticket family the estate can raise, counted from the library rather than a list."
    >
      {/*
        No mock-data banner here on purpose, and it is the one page in this
        panel that does not need one: these numbers are not fixtures, they are
        the real content library being measured.
      */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Families" value={String(stats.families)} />
        <Stat label="Templates" value={String(stats.templates)} />
        <Stat
          label={`Free reaches (L1–${freeCap})`}
          value={`${stats.reachableBy(freeCap)}`}
        />
        <Stat label="Pro reaches" value={String(stats.reachableBy(null))} />
        <Stat
          label="Needing attention"
          value={String(problems)}
          tone={problems > 0 ? "warn" : undefined}
        />
      </div>

      <Toolbar query={query} onQuery={setQuery} placeholder="Search family, tag or category…">
        {/*
          The phase selector is the point of this screen, so it is not a
          filter among filters: it changes which estate everything below is
          being measured against.
        */}
        <div className="flex items-center gap-1" role="group" aria-label="Estate size">
          {PHASES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPhase(p.value)}
              aria-pressed={phase === p.value}
              title={p.label}
              className={`rounded px-1.5 py-0.5 text-[11px] transition ${
                phase === p.value ? "bg-info/15 text-info" : "text-gray-500 hover:bg-panelalt hover:text-gray-300"
              }`}
            >
              {p.short}
            </button>
          ))}
        </div>
        <FilterGroup
          label="Track"
          value={track}
          onChange={setTrack}
          options={Object.keys(stats.byTrack).sort()}
        />
        <FilterGroup
          label="Origin"
          value={origin}
          onChange={setOrigin}
          options={["procedural", "authored"] as const}
        />
      </Toolbar>

      {problems > 0 && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] leading-relaxed text-gray-300">
          <span className="font-semibold text-warn-strong">
            {problems} famil{problems === 1 ? "y" : "ies"} will not behave here.
          </span>{" "}
          A family that cannot bind to this estate is skipped silently — it is not missing content, it
          is content nobody will ever be handed and nothing will report. One that binds only
          sometimes is harder still, because it looks correct every time you check.
        </div>
      )}

      <Card title="Families" subtitle={`${rows.length} of ${stats.families} shown`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-edge text-left text-[10.5px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 font-medium">Family</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Track</th>
                <th className="px-3 py-2 font-medium">Tiers</th>
                <th className="px-3 py-2 text-right font-medium">From level</th>
                <th className="px-3 py-2 text-right font-medium">Templates</th>
                <th className="px-3 py-2 font-medium">On this estate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <LibraryRow key={e.family} entry={e} freeCap={freeCap} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[12px] text-gray-500">
                    Nothing matches those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminPage>
  );
}

function LibraryRow({ entry, freeCap }: { entry: LibraryEntry; freeCap: number | null }) {
  const free = freeCap === null || entry.minLevel <= freeCap;
  const state: { label: string; tone: Tone } = !entry.binds
    ? { label: "Cannot bind", tone: "bad" }
    : !entry.reliable
      ? { label: "Binds sometimes", tone: "warn" }
      : !entry.playable
        ? { label: "Not interactive", tone: "warn" }
        : { label: "Ready", tone: "ok" };

  return (
    <tr className="border-b border-edge/60 last:border-0 hover:bg-panelalt/60">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-gray-100">{entry.family}</span>
          {!entry.procedural && <Pill tone="neutral">authored</Pill>}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-gray-500">{entry.tags.join(" · ")}</div>
      </td>
      <td className="px-3 py-2 text-gray-300">{entry.category}</td>
      <td className="px-3 py-2 text-gray-400">{entry.track}</td>
      <td className="px-3 py-2 font-mono text-[11px] text-gray-400">
        {entry.tiers.map((t) => TIER_SHORT[t] ?? t).sort().join(" ")}
      </td>
      <td className="px-3 py-2 text-right">
        {/* The free tier's ceiling is the line that decides who ever sees this. */}
        <span className={free ? "text-gray-200" : "text-info"}>{entry.minLevel}</span>
        {!free && <span className="ml-1.5 text-[10px] text-info">Pro</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono text-gray-400">{entry.templateIds.length}</td>
      <td className="px-3 py-2">
        <Pill tone={state.tone}>{state.label}</Pill>
      </td>
    </tr>
  );
}
