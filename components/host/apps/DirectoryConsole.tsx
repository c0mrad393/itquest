"use client";

/**
 * Active Directory Users & Computers (v0.5.0)
 * ===========================================
 * An RSAT-style console running on the operator's own workstation and talking
 * to the domain controller over the network — which is exactly why it can
 * fail. If the DC's rack has tripped, or the chassis is powered down, or NTDS
 * has been stopped, this app shows the fault and the trail to it instead of
 * pretending the directory is fine.
 *
 * There is a second, nested ADUC reachable by remoting INTO the DC. Both edit
 * the same `activeDirectory` on the same node; this one is the everyday
 * console, that one is what you fall back to when the network is the problem.
 *
 * Three panes, the way the real MMC is laid out: OUs and groups on the left,
 * the objects in the selection in the middle, the selected object on the
 * right.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  directoryReach,
  effectiveGroups,
  type ADGroup,
  type ADUser,
} from "@/lib/core";
import { AppHeader, CountPill } from "./AppChrome";
import ServiceDown from "./ServiceDown";
import {
  IconAlert,
  IconCheck,
  IconFolder,
  IconLock,
  IconPlus,
  IconSearch,
  IconUsers,
  IconX,
} from "@/components/ui/icons";

type Scope = { kind: "ou"; name: string } | { kind: "group"; name: string } | { kind: "all" };

export default function DirectoryConsole() {
  const infra = useInfraStore((s) => s.infra);
  const setMembership = useInfraStore((s) => s.adSetGroupMembership);
  const createGroup = useInfraStore((s) => s.adCreateGroup);
  const unlock = useInfraStore((s) => s.unlockADUser);
  const setEnabled = useInfraStore((s) => s.setADUserEnabled);

  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selectedSam, setSelectedSam] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // The gate. Subscribed to the whole estate, so tripping the DC's PDU on the
  // Datacenter Floor closes this console on the next frame.
  const reach = directoryReach(infra);
  const dc = reach.node;
  const ad = dc && "activeDirectory" in dc ? dc.activeDirectory : undefined;

  const users = useMemo(() => {
    if (!ad) return [];
    const q = query.trim().toLowerCase();
    return ad.users
      .filter((u) => {
        if (scope.kind === "ou" && u.department !== scope.name) return false;
        if (scope.kind === "group" && !effectiveGroups(ad, u.samAccountName).includes(scope.name)) return false;
        if (!q) return true;
        return (
          u.samAccountName.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.title.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [ad, scope, query]);

  if (!reach.reachable || !ad || !dc) {
    return <ServiceDown title="Domain Controller Unreachable" reach={reach} />;
  }

  const selected = ad.users.find((u) => u.samAccountName === selectedSam) ?? users[0] ?? null;

  function act(result: string | null, okText: string) {
    setNotice(result ? { kind: "err", text: result } : { kind: "ok", text: okText });
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <AppHeader iconId="users" title="Active Directory Users &amp; Computers" subtitle={ad.domainDns}>
        <CountPill label="accounts" value={ad.users.length} />
        <CountPill label="groups" value={ad.groups.length} />
        <span className="ml-2 flex items-center gap-1.5 text-[10px] text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          bound to {dc.hostname}
        </span>
      </AppHeader>

      {notice && (
        <div
          className={`flex shrink-0 items-start gap-2 border-b px-4 py-1.5 text-[11px] ${
            notice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200"
              : "border-amber-500/40 bg-amber-500/[0.07] text-amber-200"
          }`}
        >
          {notice.kind === "ok" ? <IconCheck size={12} className="mt-0.5 shrink-0" /> : <IconAlert size={12} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-200">
            <IconX size={11} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Tree ─────────────────────────────────────────────────────── */}
        <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-edge p-2">
          <TreeBtn active={scope.kind === "all"} onClick={() => setScope({ kind: "all" })} icon={<IconFolder size={12} />}>
            {ad.netbios}
          </TreeBtn>

          <Section>Organizational units</Section>
          {ad.ous.map((ou) => (
            <TreeBtn
              key={ou.dn}
              indent
              active={scope.kind === "ou" && scope.name === ou.name}
              onClick={() => setScope({ kind: "ou", name: ou.name })}
              icon={<IconFolder size={11} />}
            >
              {ou.name}
            </TreeBtn>
          ))}

          <Section>Security groups</Section>
          {ad.groups.map((g) => (
            <TreeBtn
              key={g.sid}
              indent
              active={scope.kind === "group" && scope.name === g.name}
              onClick={() => setScope({ kind: "group", name: g.name })}
              icon={<IconUsers size={11} />}
              trailing={String(memberCount(ad.groups, g))}
            >
              {g.name}
            </TreeBtn>
          ))}

          <div className="mt-2 flex items-center gap-1 border-t border-edge pt-2">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="New group…"
              className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-1 text-[10px] outline-none placeholder:text-gray-600 focus:border-info"
            />
            <button
              onClick={() => {
                const err = createGroup(newGroup);
                act(err, `Created ${newGroup.trim()}.`);
                if (!err) setNewGroup("");
              }}
              disabled={!newGroup.trim()}
              aria-label="Create group"
              className="shrink-0 rounded border border-edge p-1 text-gray-300 hover:bg-panelalt disabled:text-gray-600"
            >
              <IconPlus size={11} />
            </button>
          </div>
        </div>

        {/* ── Objects ──────────────────────────────────────────────────── */}
        <div className="flex w-[19rem] shrink-0 flex-col border-r border-edge">
          <div className="flex items-center gap-1.5 border-b border-edge px-2 py-1.5">
            <IconSearch size={11} className="shrink-0 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-gray-600"
            />
            <span className="shrink-0 font-mono text-[9px] text-gray-500">{users.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {users.length === 0 && (
              <p className="px-1 py-3 text-[11px] text-gray-500">No accounts match this view.</p>
            )}
            {users.slice(0, 200).map((u) => (
              <button
                key={u.samAccountName}
                onClick={() => setSelectedSam(u.samAccountName)}
                className={`mb-1 flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left ${
                  selected?.samAccountName === u.samAccountName
                    ? "border-info bg-info/10"
                    : "border-transparent hover:border-edge"
                }`}
              >
                <span
                  title={u.locked ? "Locked" : u.enabled ? "Enabled" : "Disabled"}
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    u.locked ? "bg-amber-400" : u.enabled ? "bg-emerald-400" : "bg-gray-600"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-gray-100">{u.displayName}</span>
                  <span className="block truncate font-mono text-[9px] text-gray-500">
                    {u.samAccountName} · {u.department}
                  </span>
                </span>
                {u.locked && <IconLock size={10} className="shrink-0 text-amber-400" />}
              </button>
            ))}
            {users.length > 200 && (
              <p className="px-1 py-2 text-[10px] text-gray-600">
                {users.length - 200} more — narrow the search or pick an OU.
              </p>
            )}
          </div>
        </div>

        {/* ── Object detail ────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selected ? (
            <p className="text-[11px] text-gray-500">Select an account.</p>
          ) : (
            <UserDetail
              key={selected.samAccountName}
              user={selected}
              groups={ad.groups}
              memberships={effectiveGroups(ad, selected.samAccountName)}
              onToggleGroup={(g, on) =>
                act(
                  setMembership(selected.samAccountName, g, on),
                  on
                    ? `${selected.displayName} added to ${g}.`
                    : `${selected.displayName} removed from ${g}.`,
                )
              }
              onUnlock={() => {
                unlock(dc.nodeId, selected.samAccountName);
                setNotice({ kind: "ok", text: `${selected.displayName} unlocked.` });
              }}
              onSetEnabled={(on) => {
                setEnabled(dc.nodeId, selected.samAccountName, on);
                setNotice({ kind: "ok", text: `${selected.displayName} ${on ? "enabled" : "disabled"}.` });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail pane ─────────────────────────────────────────────────────────────

function UserDetail({
  user,
  groups,
  memberships,
  onToggleGroup,
  onUnlock,
  onSetEnabled,
}: {
  user: ADUser;
  groups: ADGroup[];
  memberships: string[];
  onToggleGroup: (group: string, on: boolean) => void;
  onUnlock: () => void;
  onSetEnabled: (on: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const owned = new Set(memberships);
  // Direct membership is what the console can toggle; nested membership is
  // shown but not editable, because you fix that on the parent group.
  const direct = new Set(user.memberOf);
  const shown = groups.filter((g) => !filter || g.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <IconUsers size={14} className="text-info" />
          <span className="text-sm font-semibold text-gray-100">{user.displayName}</span>
          <span className="font-mono text-[11px] text-info">{user.samAccountName}</span>
          {user.locked && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
              LOCKED
            </span>
          )}
          {!user.enabled && (
            <span className="rounded-full bg-gray-500/15 px-2 py-0.5 text-[9px] font-semibold text-gray-400">
              DISABLED
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono text-[10px] sm:grid-cols-3">
          <Fact label="Title" value={user.title} />
          <Fact label="Department" value={user.department} />
          <Fact label="UPN" value={user.upn} />
          <Fact label="Email" value={user.email} />
          <Fact label="OU" value={user.ou} />
          <Fact label="Bad password count" value={String(user.badPwdCount)} />
        </dl>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {user.locked && (
            <button onClick={onUnlock} className="rounded border border-emerald-400/50 px-2 py-1 text-emerald-300 hover:bg-emerald-400/10">
              Unlock account
            </button>
          )}
          <button
            onClick={() => onSetEnabled(!user.enabled)}
            className="rounded border border-edge px-2 py-1 text-gray-200 hover:bg-panel"
          >
            {user.enabled ? "Disable account" : "Enable account"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Member of</h3>
          <span className="font-mono text-[10px] text-gray-600">{memberships.length}</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter groups…"
            className="ml-auto w-40 rounded border border-edge bg-panel px-1.5 py-0.5 text-[10px] outline-none placeholder:text-gray-600 focus:border-info"
          />
        </div>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {shown.map((g) => {
            const isDirect = direct.has(g.name) || g.members.includes(user.samAccountName);
            const isNested = owned.has(g.name) && !isDirect;
            return (
              <li key={g.sid} className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-panel/60">
                <button
                  onClick={() => onToggleGroup(g.name, !isDirect)}
                  disabled={isNested}
                  title={isNested ? "Inherited through a nested group — change it on the parent" : undefined}
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    isDirect
                      ? "border-info bg-info/20 text-info"
                      : isNested
                        ? "cursor-not-allowed border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : "border-edge hover:border-info"
                  }`}
                >
                  {(isDirect || isNested) && <IconCheck size={9} />}
                </button>
                <span className={owned.has(g.name) ? "text-gray-100" : "text-gray-400"}>{g.name}</span>
                {isNested && <span className="font-mono text-[9px] text-amber-300">nested</span>}
                {g.description && (
                  <span className="ml-auto truncate pl-2 text-[9px] text-gray-600">{g.description}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ── atoms ───────────────────────────────────────────────────────────────────

function memberCount(groups: ADGroup[], g: ADGroup): number {
  return g.members.length;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 px-1.5 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-wider text-gray-600">
      {children}
    </div>
  );
}

function TreeBtn({
  active,
  onClick,
  icon,
  indent,
  trailing,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  indent?: boolean;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] ${
        indent ? "pl-4" : ""
      } ${active ? "bg-info/15 text-gray-100" : "text-gray-400 hover:bg-panelalt"}`}
    >
      <span className="shrink-0 text-gray-500">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && <span className="shrink-0 font-mono text-[9px] text-gray-600">{trailing}</span>}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className="truncate text-gray-200">{value}</dd>
    </div>
  );
}
