"use client";

/**
 * User Management — accounts, roles and access across every org.
 *
 * A filterable roster with the three actions an administrator actually reaches
 * for: suspend, reset progress, and move someone between orgs.
 *
 * ── DESTRUCTIVE ACTIONS ARM BEFORE THEY FIRE ────────────────────────────────
 *
 * "Reset progress" throws away work somebody did. It confirms on a second
 * click even here, where it does nothing — the muscle memory an admin builds
 * against a mock is the muscle memory they bring to production.
 *
 * ── AND THEY REPORT WHAT THEY DID ───────────────────────────────────────────
 *
 * Phase 1 has no backend, so a button that visually "worked" would be lying.
 * Every action writes to the shared log and says the call was not sent.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import {
  ActionLog,
  AdminPage,
  Card,
  FilterGroup,
  MockBanner,
  Pill,
  Stat,
  Toolbar,
  useActionLog,
  type Tone,
} from "@/components/admin/AdminShell";
import {
  ADMIN_USERS,
  relativeTime,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from "@/lib/admin/mock-data";

const ROLES: readonly UserRole[] = ["student", "instructor", "admin"];
const STATUSES: readonly UserStatus[] = ["active", "idle", "suspended"];

const STATUS_TONE: Record<UserStatus, Tone> = {
  active: "ok",
  idle: "neutral",
  suspended: "bad",
};

const ROLE_TONE: Record<UserRole, Tone> = {
  student: "neutral",
  instructor: "info",
  admin: "warn",
};

export default function UserManagement() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "all">("all");
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [armedReset, setArmedReset] = useState<string | null>(null);
  const { lines, record, recordCall } = useActionLog();

  const orgs = useMemo(
    () => Array.from(new Set(ADMIN_USERS.map((u) => u.org).filter((o): o is string => Boolean(o)))).sort(),
    [],
  );
  const [org, setOrg] = useState<string | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ADMIN_USERS.filter(
      (u) =>
        (role === "all" || u.role === role) &&
        (status === "all" || u.status === status) &&
        (org === "all" || u.org === org) &&
        (q === "" || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [query, role, status, org]);

  function toggleSuspend(u: AdminUser) {
    const verb = u.status === "suspended" ? "Reactivate" : "Suspend";
    recordCall(`${verb} ${u.email}`);
  }

  function resetProgress(u: AdminUser) {
    if (armedReset !== u.id) {
      setArmedReset(u.id);
      record(`Reset progress requested for ${u.email} — click again to confirm`);
      window.setTimeout(() => setArmedReset((a) => (a === u.id ? null : a)), 4000);
      return;
    }
    setArmedReset(null);
    recordCall(`Reset progress confirmed for ${u.email} (level ${u.level}, ${u.scenariosCompleted} completions)`);
  }

  function reassign(u: AdminUser, to: string) {
    if (to === (u.org ?? "")) return;
    recordCall(`Move ${u.email} from ${u.org ?? "no org"} to ${to || "no org"}`);
  }

  const suspended = ADMIN_USERS.filter((u) => u.status === "suspended").length;

  return (
    <AdminPage title="User Management" blurb="Accounts, roles and access across every org.">
      <MockBanner />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={ADMIN_USERS.length} />
        <Stat label="Active now" value={ADMIN_USERS.filter((u) => u.status === "active").length} tone="ok" />
        <Stat label="Suspended" value={suspended} tone={suspended ? "bad" : "neutral"} />
        <Stat label="Orgs" value={orgs.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.75fr_1fr]">
        <Card title="Roster" subtitle={`${rows.length} of ${ADMIN_USERS.length} shown`} bodyClassName="p-0">
          <Toolbar query={query} onQuery={setQuery} placeholder="Search name or email…">
            <FilterGroup label="role" value={role} options={ROLES} onChange={setRole} />
            <FilterGroup label="status" value={status} options={STATUSES} onChange={setStatus} />
          </Toolbar>

          <div className="flex flex-wrap items-center gap-1 border-b border-edge px-3 py-1.5">
            <span className="mr-1 text-[10.5px] uppercase tracking-wider text-gray-600">Org</span>
            {(["all", ...orgs] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOrg(o)}
                aria-pressed={org === o}
                className={`rounded px-1.5 py-0.5 text-[11px] transition ${
                  org === o ? "bg-info/15 text-info" : "text-gray-500 hover:bg-panelalt hover:text-gray-300"
                }`}
              >
                {o === "all" ? "All" : o}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2 font-semibold">Account</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Org</th>
                  <th className="px-3 py-2 text-right font-semibold">Level</th>
                  <th className="px-3 py-2 text-right font-semibold">Done</th>
                  <th className="px-3 py-2 font-semibold">Last seen</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-edge/60 align-middle hover:bg-panelalt/40">
                    <td className="px-4 py-2.5">
                      <div className="text-[12.5px] text-gray-100">{u.name}</div>
                      <div className="font-mono text-[10.5px] text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={ROLE_TONE[u.role]}>{u.role}</Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={STATUS_TONE[u.status]}>{u.status}</Pill>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-400">{u.org ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-300">{u.level}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-400">
                      {u.scenariosCompleted}
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-500">{relativeTime(u.lastSeen)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleSuspend(u)}
                          className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-gray-300 transition hover:bg-panelalt"
                        >
                          {u.status === "suspended" ? "Reactivate" : "Suspend"}
                        </button>
                        <button
                          onClick={() => resetProgress(u)}
                          className={`rounded border px-1.5 py-0.5 text-[11px] transition ${
                            armedReset === u.id
                              ? "border-danger/60 bg-danger/15 text-danger-strong"
                              : "border-edge text-gray-400 hover:bg-panelalt"
                          }`}
                        >
                          {armedReset === u.id ? "Confirm reset" : "Reset"}
                        </button>
                        <select
                          value={u.org ?? ""}
                          onChange={(e) => reassign(u, e.target.value)}
                          aria-label={`Org for ${u.name}`}
                          className="h-6 rounded border border-edge bg-surface px-1 text-[11px] text-gray-300 outline-none focus:border-info/50"
                        >
                          <option value="">no org</option>
                          {orgs.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[12px] text-gray-600">
                      No accounts match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <ActionLog lines={lines} />
      </div>
    </AdminPage>
  );
}
