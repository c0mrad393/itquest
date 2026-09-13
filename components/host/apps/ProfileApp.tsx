"use client";

/**
 * My Profile (Level-0 host app — Identity layer)
 * ----------------------------------------------
 * Fetches the authenticated operator from the auth session and offers:
 *   - Profile customization (username + avatar: presets / Google photo / URL)
 *   - Gamification dashboard (level, XP, SLA success rate, leaderboard rank)
 *   - Log out (terminates the session and returns to the landing page)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/host/session";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useSlaStore } from "@/lib/sla/store";
import { toNextLevel } from "@/lib/progression/standing";
import { useJobTitle, useStanding } from "@/lib/progression/use-standing";
import { rankForXp } from "@/lib/host/leaderboard-data";
import { AVATAR_PALETTES, isImageAvatar } from "@/lib/core";
import Avatar from "../Avatar";
import { AppIcon } from "@/components/ui/app-icons";
import { TRACK_META, SPECIALISATION_THRESHOLD, dominantTrack, trackShares } from "@/lib/progression/tracks";

export default function ProfileApp() {
  const router = useRouter();
  // v0.7.0: one local operator, no account. The profile IS the host user.
  const updateProfile = useSessionStore((s) => s.updateProfile);
  const setHostUser = useHostStore((s) => s.setUserProfile);

  const hostUser = useHostStore((s) => s.host.user);
  const tickets = useTicketStore((s) => s.tickets);
  const breached = useSlaStore((s) => s.breached);

  const [username, setUsername] = useState(hostUser.displayName);
  const [customUrl, setCustomUrl] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  // ── Gamification stats (live sim state; XP mirrors the synced profile) ──
  const xp = hostUser.xp;
  // `levelForXp(xp)` here was the uncapped figure — the same number the
  // taskbar was capping, rendered as though it were the same question.
  const standing = useStanding();
  const title = useJobTitle();
  const next = toNextLevel(standing);
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
  const breachCount = Object.values(breached).filter(Boolean).length;
  const slaRate =
    resolved.length === 0
      ? null
      : Math.round(((resolved.length - Math.min(breachCount, resolved.length)) / resolved.length) * 100);
  const rank = rankForXp(xp);

  function saveUsername() {
    const clean = username.trim();
    if (!clean || clean === hostUser.displayName) return;
    updateProfile({ username: clean });
    setHostUser({ displayName: clean });
    flash();
  }

  function pickAvatar(avatar: string) {
    updateProfile({ avatar });
    setHostUser({ avatar });
    flash();
  }

  function flash() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto term-scroll bg-panel p-5 text-sm text-gray-200">
      {/* Identity header */}
      <div className="flex items-center gap-4 rounded-xl border border-edge bg-panelalt p-4">
        <Avatar value={hostUser.avatar} name={hostUser.displayName} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-gray-50">{hostUser.displayName}</div>
          {/* The same title the Career track panel below shows. These were two
              different answers on one screen. */}
          <div className="truncate text-[11px] text-gray-500">{title}</div>
        </div>
        {savedFlash && (
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-semibold text-accent">
            <span className="inline-flex items-center gap-1"><AppIcon id="check" size={12} /> Saved</span>
          </span>
        )}
      </div>

      {/* Career track — where the experience actually went */}
      <section className="rounded-xl border border-edge bg-panelalt p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Career track
          </span>
          <span className="ml-auto text-[13px] font-semibold text-gray-100">
            {title}
          </span>
        </div>
        <div className="mb-3 text-[10px] text-gray-600">
          {dominantTrack(hostUser.skills)
            ? "Your title follows whichever discipline you work most — it moves as your habits do."
            : `Specialise by resolving more in one discipline (${SPECIALISATION_THRESHOLD.toLocaleString()} XP in a track).`}
        </div>
        <div className="space-y-1.5">
          {trackShares(hostUser.skills).map(({ track, xp: txp, pct }) => {
            const meta = TRACK_META[track];
            const lead = dominantTrack(hostUser.skills) === track;
            return (
              <div key={track} className="flex items-center gap-2.5">
                <span className={`w-4 shrink-0 ${meta.color}`}>
                  <AppIcon id={meta.iconId} size={13} />
                </span>
                <span className={`w-20 shrink-0 text-[11px] ${lead ? "font-semibold text-gray-100" : "text-gray-400"}`}>
                  {meta.label}
                </span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-500/25">
                  <span
                    className={`block h-full rounded-full ${lead ? "bg-info" : "bg-gray-600"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[10px] text-gray-500">
                  {txp.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gamification dashboard */}
      <section className="rounded-xl border border-edge bg-panelalt p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Operator record
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Level" value={String(standing.level)} accent="text-info" />
          <Stat label="Total XP" value={xp.toLocaleString()} accent="text-gray-100" />
          <Stat label="IT Budget" value={`${hostUser.budget.toLocaleString()} Cr`} accent="text-emerald-300" />
          <Stat
            label="SLA success"
            value={slaRate === null ? "—" : `${slaRate}%`}
            accent={slaRate === null ? "text-gray-500" : slaRate >= 80 ? "text-emerald-300" : "text-warn"}
          />
          <Stat label="Global rank" value={`#${rank}`} accent="text-amber-300" />
        </div>
        <div className="mt-3">
          {/*
            At the plan's ceiling this stops being a progress bar and says so.
            Running one towards level 5 on a plan that ends at 4 would be the
            product promising something it has decided not to give.
          */}
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>
              {next
                ? `Progress to level ${standing.level + 1}`
                : `Level ${standing.level} — where this plan ends`}
            </span>
            <span>
              {next ? (
                `${xp.toLocaleString()} / ${next.need.toLocaleString()} XP`
              ) : standing.held ? (
                <span className="text-gray-400">
                  {standing.banked} level{standing.banked === 1 ? "" : "s"} banked ·{" "}
                  {xp.toLocaleString()} XP
                </span>
              ) : (
                `${xp.toLocaleString()} XP`
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className={`h-full rounded-full ${
                next ? "bg-gradient-to-r from-sky-400 to-emerald-400" : "bg-gray-500/40"
              }`}
              style={{ width: next ? `${Math.min(100, Math.round((xp / next.need) * 100))}%` : "100%" }}
            />
          </div>
        </div>
      </section>

      {/* Customization */}
      <section className="rounded-xl border border-edge bg-panelalt p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Profile customization
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Display username</span>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={32}
              className="flex-1 rounded-lg border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-info"
            />
            <button
              onClick={() => void saveUsername()}
              disabled={!username.trim() || username.trim() === hostUser.displayName}
              className="rounded-lg bg-brand-fill px-4 py-2 text-xs font-bold text-brand-on transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </label>

        <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Avatar colour</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {AVATAR_PALETTES.map((pal) => (
            <button
              key={pal.id}
              onClick={() => void pickAvatar(pal.id)}
              title={pal.label}
              aria-label={pal.label}
              className={`rounded-full p-0.5 transition ${
                hostUser.avatar === pal.id
                  ? "ring-2 ring-info ring-offset-2 ring-offset-panelalt"
                  : "ring-1 ring-edge hover:ring-gray-500"
              }`}
            >
              <Avatar value={pal.id} name={hostUser.displayName} className="h-8 w-8" />
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[10px] text-gray-600">
          Your monogram is drawn from your username — rename above and it follows.
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="…or paste an image URL (https://…)"
            className="flex-1 rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs outline-none placeholder:text-gray-600 focus:border-info"
          />
          <button
            onClick={() => customUrl.trim() && void pickAvatar(customUrl.trim())}
            disabled={!isImageAvatar(customUrl.trim())}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-gray-200 hover:bg-edge disabled:cursor-not-allowed disabled:opacity-40"
          >
            Use image
          </button>
        </div>
      </section>

      {/* Save */}
      <section className="flex items-center justify-between rounded-xl border border-edge bg-panelalt p-4">
        <div>
          <div className="text-xs font-semibold text-gray-200">Return to the title screen</div>
          <div className="text-[10px] text-gray-500">
            Your progress is saved on this device and will be waiting under Continue.
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border border-edge px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-info/60 hover:text-info"
        >
          Title screen
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg bg-gray-500/15 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}
