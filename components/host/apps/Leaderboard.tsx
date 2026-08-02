"use client";

/**
 * Leaderboard (Level-0 host app, Phase 6)
 * ---------------------------------------
 * Global ranking by XP. The operator's row is LIVE — xp/level from the host
 * store, resolutions from the ticket queue, average CSAT from the dialogue
 * store, breaches from the SLA flags — ranked against a seeded field of rival
 * engineers. (Server-side sync via Supabase is the planned follow-up.)
 */

import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useSlaStore } from "@/lib/sla/store";
import { levelForXp } from "@/lib/scenario/scoring";
import { RIVALS, type LeaderboardEntry as Row } from "@/lib/host/leaderboard-data";
import Avatar from "../Avatar";
import { AppIcon } from "@/components/ui/app-icons";

export default function Leaderboard() {
  const user = useHostStore((s) => s.host.user);
  const tickets = useTicketStore((s) => s.tickets);
  const conversations = useDialogueStore((s) => s.conversations);
  const breached = useSlaStore((s) => s.breached);

  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
  const resolvedCsats = resolved
    .map((t) => conversations[t.id]?.csat)
    .filter((c): c is number => typeof c === "number");
  const avgCsat = resolvedCsats.length
    ? Math.round(resolvedCsats.reduce((a, b) => a + b, 0) / resolvedCsats.length)
    : null;

  const you: Row = {
    name: user.displayName,
    role: user.role,
    avatar: user.avatar,
    xp: user.xp,
    resolved: resolved.length,
    breaches: Object.values(breached).filter(Boolean).length,
    csat: avgCsat,
    you: true,
  };

  const rows = [...RIVALS, you].sort((a, b) => b.xp - a.xp);
  const yourRank = rows.findIndex((r) => r.you) + 1;

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <div className="flex items-center gap-3 border-b border-edge bg-panelalt px-4 py-3">
        <span className="text-amber-300"><AppIcon id="trophy" size={22} /></span>
        <div>
          <div className="text-sm font-semibold text-gray-100">Global Leaderboard</div>
          <div className="text-[11px] text-gray-500">Ranked by XP · SLA & CSAT tracked</div>
        </div>
        <span className="ml-auto rounded-full bg-info/15 px-3 py-1 text-xs font-semibold text-info">
          Your rank: #{yourRank}
        </span>
      </div>

      <div className="grid grid-cols-[44px_1fr_90px_70px_70px_70px] gap-2 border-b border-edge px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>#</span>
        <span>Engineer</span>
        <span className="text-right">XP</span>
        <span className="text-right">Lvl</span>
        <span className="text-right">Solved</span>
        <span className="text-right">CSAT</span>
      </div>

      <div className="flex-1 overflow-y-auto term-scroll">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`grid grid-cols-[44px_1fr_90px_70px_70px_70px] items-center gap-2 border-b border-edge/60 px-4 py-2.5 ${
              r.you ? "bg-info/10" : ""
            }`}
          >
            {/* Podium places get a metal-tinted medallion rather than a medal emoji. */}
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                i === 0
                  ? "bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/50"
                  : i === 1
                    ? "bg-slate-300/20 text-slate-200 ring-1 ring-slate-300/50"
                    : i === 2
                      ? "bg-orange-400/20 text-orange-300 ring-1 ring-orange-400/50"
                      : "text-gray-500"
              }`}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Avatar value={r.avatar} className="h-7 w-7 text-lg" />
              <span className="min-w-0">
                <span className="block truncate text-gray-100">
                  {r.name}
                  {r.you && <span className="ml-1.5 rounded bg-info/20 px-1 py-0.5 text-[9px] font-bold text-info">YOU</span>}
                </span>
                <span className="block truncate text-[10px] text-gray-500">{r.role}</span>
              </span>
            </span>
            <span className="text-right font-mono text-gray-100">{r.xp.toLocaleString()}</span>
            <span className="text-right font-mono text-gray-400">{levelForXp(r.xp)}</span>
            <span className="text-right font-mono text-gray-400">{r.resolved}</span>
            <span className="text-right font-mono">
              {r.csat === null ? (
                <span className="text-gray-600">—</span>
              ) : (
                <span className={r.csat >= 85 ? "text-emerald-300" : r.csat >= 70 ? "text-amber-300" : "text-danger"}>
                  {r.csat}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-edge px-4 py-2 text-[10px] text-gray-600">
        Breaching an SLA halves the XP reward; CSAT multiplies it. Rival stats are seeded until
        multiplayer sync (Supabase) lands.
      </div>
    </div>
  );
}
