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
import { useAuthStore } from "@/lib/auth/store";
import { useHostStore } from "@/lib/host/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useSlaStore } from "@/lib/sla/store";
import { levelForXp, xpForLevel } from "@/lib/scenario/scoring";
import { rankForXp } from "@/lib/host/leaderboard-data";
import { AVATAR_PRESETS, isImageAvatar } from "@/lib/core";
import Avatar from "../Avatar";

const PROVIDER_META = {
  google: { label: "Google account", color: "bg-sky-500/15 text-sky-300" },
  password: { label: "Email account", color: "bg-violet-500/15 text-violet-300" },
  guest: { label: "Guest session", color: "bg-gray-500/20 text-gray-400" },
} as const;

export default function ProfileApp() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const hostUser = useHostStore((s) => s.host.user);
  const tickets = useTicketStore((s) => s.tickets);
  const breached = useSlaStore((s) => s.breached);

  const [username, setUsername] = useState(profile?.username ?? hostUser.displayName);
  const [customUrl, setCustomUrl] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center bg-panel text-xs text-gray-600">
        No active session.
      </div>
    );
  }

  const provider = PROVIDER_META[profile.provider];

  // ── Gamification stats (live sim state; XP mirrors the synced profile) ──
  const xp = hostUser.xp;
  const level = levelForXp(xp);
  const nextXp = xpForLevel(level + 1);
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
  const breachCount = Object.values(breached).filter(Boolean).length;
  const slaRate =
    resolved.length === 0
      ? null
      : Math.round(((resolved.length - Math.min(breachCount, resolved.length)) / resolved.length) * 100);
  const rank = rankForXp(xp);

  async function saveUsername() {
    const clean = username.trim();
    if (!clean || clean === profile!.username) return;
    await updateProfile({ username: clean });
    flash();
  }

  async function pickAvatar(avatar: string) {
    await updateProfile({ avatar });
    flash();
  }

  function flash() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function logout() {
    await signOut();
    router.replace("/");
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto term-scroll bg-panel p-5 text-sm text-gray-200">
      {/* Identity header */}
      <div className="flex items-center gap-4 rounded-xl border border-edge bg-panelalt p-4">
        <Avatar value={profile.avatar} className="h-16 w-16 text-4xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-gray-50">{profile.username}</div>
          <div className="truncate text-[11px] text-gray-500">{profile.email ?? "no email (guest)"}</div>
          <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${provider.color}`}>
            {provider.label}
          </span>
        </div>
        {savedFlash && (
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-semibold text-accent">
            ✓ Saved
          </span>
        )}
      </div>

      {/* Gamification dashboard */}
      <section className="rounded-xl border border-edge bg-panelalt p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Operator record
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Level" value={String(level)} accent="text-info" />
          <Stat label="Total XP" value={xp.toLocaleString()} accent="text-gray-100" />
          <Stat
            label="SLA success"
            value={slaRate === null ? "—" : `${slaRate}%`}
            accent={slaRate === null ? "text-gray-500" : slaRate >= 80 ? "text-emerald-300" : "text-warn"}
          />
          <Stat label="Global rank" value={`#${rank}`} accent="text-amber-300" />
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Progress to level {level + 1}</span>
            <span>
              {xp.toLocaleString()} / {nextXp.toLocaleString()} XP
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
              style={{ width: `${Math.min(100, Math.round((xp / nextXp) * 100))}%` }}
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
              disabled={!username.trim() || username.trim() === profile.username}
              className="rounded-lg bg-info px-4 py-2 text-xs font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </label>

        <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Avatar</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {AVATAR_PRESETS.map((a) => (
            <button
              key={a}
              onClick={() => void pickAvatar(a)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
                profile.avatar === a
                  ? "border-info bg-info/20"
                  : "border-edge bg-panel hover:border-gray-500"
              }`}
            >
              {a}
            </button>
          ))}
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

      {/* Account actions */}
      <section className="flex items-center justify-between rounded-xl border border-edge bg-panelalt p-4">
        <div>
          <div className="text-xs font-semibold text-gray-200">Sign out of TriageOS</div>
          <div className="text-[10px] text-gray-500">
            Ends this session and returns to the landing page. Your save stays on this device
            {profile.provider !== "guest" ? "; your XP is synced to your account." : "."}
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-lg border border-danger/50 px-4 py-2 text-xs font-bold text-danger transition hover:bg-danger hover:text-white"
        >
          Log out
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg bg-black/20 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}
