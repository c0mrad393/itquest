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

interface Row {
  name: string;
  role: string;
  avatar: string;
  xp: number;
  resolved: number;
  breaches: number;
  csat: number | null; // null = no data yet
  you?: boolean;
}

/** Seeded rival field (static until multiplayer sync lands). */
const RIVALS: Row[] = [
  { name: "D. Okafor", role: "Tier-3 SRE", avatar: "🧑🏿‍💻", xp: 12480, resolved: 61, breaches: 2, csat: 91 },
  { name: "M. Ivanova", role: "SecOps Analyst", avatar: "👩🏻‍💻", xp: 9310, resolved: 44, breaches: 4, csat: 88 },
  { name: "K. Tanaka", role: "Tier-2 Sysadmin", avatar: "👨🏻‍💼", xp: 7420, resolved: 39, breaches: 6, csat: 84 },
  { name: "S. Weber", role: "NetOps Engineer", avatar: "🧔🏼", xp: 5150, resolved: 28, breaches: 3, csat: 86 },
  { name: "A. Haddad", role: "Helpdesk Lead", avatar: "👩🏽", xp: 3890, resolved: 33, breaches: 9, csat: 79 },
];

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
        <span className="text-xl">🏆</span>
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
            <span className={`font-mono text-xs ${i < 3 ? "text-amber-300" : "text-gray-500"}`}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-lg">{r.avatar}</span>
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
