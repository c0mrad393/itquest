"use client";

/**
 * DevTools — ticket bench (DR build)
 * ==================================
 * Every ticket class in the game, searchable, one click to dispatch.
 *
 * ── WHY THIS REPLACED THE FAMILY DROPDOWN ───────────────────────────────────
 *
 * The old spawner listed FAMILIES — `gen-lockout`, `sec-t2-ransomware` — and
 * picked a random variant from each. That is the right shape for simulating
 * the RNG event loop and the wrong shape for testing, which is what a bench is
 * for. Testing means "give me exactly this one, now", and a dropdown of sixty
 * opaque ids that each expand into something else cannot do that.
 *
 * So this lists TEMPLATES, shows what each one is (category, tier, whether its
 * win-condition is actually playable), and dispatches the one named.
 *
 * ── WHY FAULT INJECTION IS ON BY DEFAULT ────────────────────────────────────
 *
 * `spawnIncident` skips `injectFault` on purpose: a reactive incident is a
 * ticket ABOUT a world that already failed. A bench spawn is the opposite —
 * nothing has failed, and for a systemic template like the ransomware event
 * the fault is the entire thing being tested. Spawning it without the fault
 * would produce a ticket describing an encryption event that never happened,
 * which is worse than useless because it looks like it worked.
 *
 * The toggle stays visible so the other behaviour is still reachable, and the
 * copy says which is which.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { ticketLibrary } from "@/lib/tickets/factory";
import { IconAlert, IconPlus, IconSearch } from "@/components/ui/icons";

const TIER_LABEL: Record<string, string> = {
  Tier_1_Easy: "T1",
  Tier_2_Medium: "T2",
  Tier_3_Hard: "T3",
  Tier_4_Expert: "T4",
};

export default function TicketBench({ say }: { say: (s: string) => void }) {
  const infra = useInfraStore((s) => s.infra);
  const spawnTemplate = useTicketStore((s) => s.spawnTemplate);
  const [query, setQuery] = useState("");
  const [injectFault, setInjectFault] = useState(true);

  /*
   * The whole library, collapsed to one row per FAMILY for the procedural
   * templates and one row per template for the hand-authored ones.
   *
   * Procedural ids look like `gen-lockout-1-3` — family, tier, variant — and
   * there are 189 of them across 60 families. Listing every variant would bury
   * the twelve hand-written scenarios that actually have bespoke
   * win-conditions, which are the ones a developer usually wants. The variant
   * still spawns; the list just does not make you scroll past 188 siblings.
   */
  const rows = useMemo(() => {
    const lib = ticketLibrary(infra);
    const seen = new Map<string, { id: string; label: string; category: string; tier: string; playable: boolean; tags: string[]; variants: number }>();

    for (const t of Object.values(lib)) {
      const m = /^(gen-.+?)-\d+-\d+$/.exec(t.id);
      const key = m ? m[1] : t.id;
      const prev = seen.get(key);
      if (prev) {
        prev.variants += 1;
        continue;
      }
      seen.set(key, {
        id: t.id,
        label: key,
        category: t.category,
        tier: TIER_LABEL[t.difficulty] ?? t.difficulty,
        playable: t.playable,
        tags: t.tags,
        variants: 1,
      });
    }

    const q = query.trim().toLowerCase();
    return [...seen.values()]
      .filter(
        (r) =>
          !q ||
          r.label.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }, [infra, query]);

  function fire(templateId: string, label: string) {
    const t = spawnTemplate(templateId, infra, { injectFault });
    if (!t) {
      say(`${label}: this world cannot host it (no valid context)`);
      return;
    }
    useDialogueStore.getState().syncConversations();
    useNotificationStore.getState().push({
      kind: "info",
      title: `${t.code} injected`,
      body: t.title,
      badge: "Debug",
    });
    say(`spawned ${label} -> ${t.code}${injectFault ? " (fault injected)" : ""}`);
  }

  const grouped = useMemo(() => {
    const out = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = out.get(r.category);
      if (list) list.push(r);
      else out.set(r.category, [r]);
    }
    return [...out.entries()];
  }, [rows]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 rounded border border-edge bg-sunken px-1.5 py-1">
        <IconSearch size={11} className="shrink-0 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all ticket classes…"
          className="min-w-0 flex-1 bg-transparent text-[10px] text-gray-200 outline-none placeholder:text-gray-600"
          aria-label="Search ticket classes"
        />
        <span className="shrink-0 font-mono text-[9px] text-gray-500">{rows.length}</span>
      </div>

      <label className="flex items-start gap-1.5 rounded border border-edge px-1.5 py-1">
        <input
          type="checkbox"
          checked={injectFault}
          onChange={(e) => setInjectFault(e.target.checked)}
          className="mt-0.5 h-3 w-3 shrink-0 accent-brand-fill"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] text-gray-200">Inject the world fault</span>
          <span className="block text-[9px] leading-snug text-gray-500">
            On: break the world the way the ticket describes — required for systemic classes like
            ransomware. Off: spawn the ticket only, matching how a reactive incident arrives.
          </span>
        </span>
      </label>

      <div className="max-h-64 overflow-y-auto rounded border border-edge">
        {grouped.length === 0 && (
          <p className="px-2 py-4 text-center text-[10px] text-gray-500">
            Nothing matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {grouped.map(([category, list]) => (
          <div key={category}>
            <div className="sticky top-0 border-b border-edge bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
              {category}
            </div>
            {list.map((r) => (
              <button
                key={r.label}
                onClick={() => fire(r.id, r.label)}
                className="flex w-full items-baseline gap-1.5 border-b border-edge/40 px-1.5 py-1 text-left transition last:border-0 hover:bg-brand-soft/10"
              >
                <span className="shrink-0 font-mono text-[8px] text-gray-600">{r.tier}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-gray-200">
                  {r.label}
                </span>
                {r.variants > 1 && (
                  <span className="shrink-0 font-mono text-[8px] text-gray-600">
                    {r.variants}v
                  </span>
                )}
                {/* A template whose win-condition is not yet interactive can be
                    spawned but never resolved, and the bench must say so — a
                    developer chasing "why won't this close" deserves the answer
                    before they start rather than after. */}
                {!r.playable && (
                  <span
                    className="shrink-0 text-warn-strong"
                    title="Win-condition is not interactive in this build — it can be spawned but not resolved."
                  >
                    <IconAlert size={9} />
                  </span>
                )}
                <IconPlus size={9} className="shrink-0 text-gray-500" />
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="text-[9px] leading-relaxed text-gray-600">
        Spawns through the same builder the queue generator uses, so the ticket is bound to this
        world and its win-condition grades normally. Procedural families collapse to one row and
        spawn a random variant.
      </p>
    </div>
  );
}
