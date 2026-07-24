"use client";

/**
 * Active Directory Users & Computers (ADUC) — enterprise scale
 * ------------------------------------------------------------
 * Searchable, department-filterable, PAGED view over the DC's 100+ user
 * directory. Unlocking / enabling accounts mutates the shared node; unlocking
 * j.doe resolves the lockout ticket via the reconciler, exactly as a CLI fix
 * would. Built to stay smooth at hundreds of rows.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { adAccountStatus, type ADUser, type TargetNode, type WindowsNodeState } from "@/lib/core";
import EndpointSession from "../endpoints/EndpointSession";

const PAGE_SIZE = 12;

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-emerald-500/20 text-emerald-300",
  Locked: "bg-danger/20 text-danger",
  Disabled: "bg-gray-500/20 text-gray-400",
};

export default function ADUCPanel({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const nodes = useInfraStore((s) => s.infra.nodes);
  const unlock = useInfraStore((s) => s.unlockADUser);
  const setEnabled = useInfraStore((s) => s.setADUserEnabled);

  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Locked" | "Disabled">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [remoteNodeId, setRemoteNodeId] = useState<string | null>(null);

  const ad = node?.activeDirectory;

  const departments = useMemo(
    () => (ad ? Array.from(new Set(ad.users.map((u) => u.department))).sort() : []),
    [ad],
  );

  const filtered = useMemo(() => {
    if (!ad) return [];
    const q = query.trim().toLowerCase();
    return ad.users.filter((u) => {
      if (dept !== "all" && u.department !== dept) return false;
      if (statusFilter !== "all" && adAccountStatus(u) !== statusFilter) return false;
      if (q && !`${u.displayName} ${u.samAccountName} ${u.email} ${u.title}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [ad, query, dept, statusFilter]);

  if (!ad) {
    return <Empty text="This node does not host Active Directory." />;
  }

  const lockedCount = ad.users.filter((u) => u.locked).length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const user = ad.users.find((u) => u.samAccountName === selected) ?? null;
  const assignedNode = user?.assignedNodeId ? nodes[user.assignedNodeId] : undefined;

  // ── Live remote session (mounted from a Remote Connect action) ──────────────
  if (remoteNodeId) {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-panelalt px-3 py-1.5 text-[11px] text-gray-300">
          <button
            onClick={() => setRemoteNodeId(null)}
            className="rounded border border-edge px-2 py-0.5 text-gray-200 hover:bg-edge"
          >
            ← Back to ADUC
          </button>
          <span className="text-gray-500">Remote session established via Active Directory</span>
        </div>
        <div className="min-h-0 flex-1">
          <EndpointSession nodeId={remoteNodeId} onDisconnect={() => setRemoteNodeId(null)} />
        </div>
      </div>
    );
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-panelalt px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {ad.domainDns}
        </span>
        <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">
          {ad.users.length} users
        </span>
        {lockedCount > 0 && (
          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger">
            🔒 {lockedCount} locked
          </span>
        )}
        <input
          value={query}
          onChange={(e) => resetPage(setQuery)(e.target.value)}
          placeholder="Search name, login, email, title…"
          className="ml-auto w-56 rounded border border-edge bg-panel px-2 py-1 text-xs outline-none placeholder:text-gray-600 focus:border-info"
        />
        <select
          value={dept}
          onChange={(e) => resetPage(setDept)(e.target.value)}
          className="rounded border border-edge bg-panel px-2 py-1 text-xs text-gray-300 outline-none"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => resetPage(setStatusFilter)(e.target.value as typeof statusFilter)}
          className="rounded border border-edge bg-panel px-2 py-1 text-xs text-gray-300 outline-none"
        >
          <option value="all">Any status</option>
          <option value="Active">Active</option>
          <option value="Locked">Locked</option>
          <option value="Disabled">Disabled</option>
        </select>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* User table */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-edge">
          <div className="grid grid-cols-[1fr_120px_90px] gap-2 border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            <span>User</span>
            <span>Department</span>
            <span>Status</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto term-scroll">
            {rows.length === 0 && <Empty text="No accounts match these filters." />}
            {rows.map((u) => {
              const status = adAccountStatus(u);
              return (
                <button
                  key={u.samAccountName}
                  onClick={() => setSelected(u.samAccountName)}
                  className={`grid w-full grid-cols-[1fr_120px_90px] items-center gap-2 border-b border-edge/50 px-3 py-2 text-left ${
                    selected === u.samAccountName ? "bg-info/10" : "hover:bg-panelalt"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-100">
                      {u.locked ? "🔒 " : ""}{u.displayName}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-gray-500">
                      {u.samAccountName} · {u.title}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-gray-400">{u.department}</span>
                  <span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>
                      {status}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Pager */}
          <div className="flex items-center gap-2 border-t border-edge px-3 py-1.5 text-[11px] text-gray-400">
            <span>
              {filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1}–
              {Math.min(filtered.length, (clampedPage + 1) * PAGE_SIZE)} of {filtered.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="rounded border border-edge px-2 py-0.5 hover:bg-edge disabled:opacity-30"
              >
                ‹ Prev
              </button>
              <span className="font-mono">{clampedPage + 1}/{pageCount}</span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="rounded border border-edge px-2 py-0.5 hover:bg-edge disabled:opacity-30"
              >
                Next ›
              </button>
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="w-80 shrink-0 overflow-y-auto term-scroll">
          {user ? (
            <UserDetail
              user={user}
              assignedNode={assignedNode}
              onUnlock={() => unlock(nodeId, user.samAccountName)}
              onToggleEnabled={() => setEnabled(nodeId, user.samAccountName, !user.enabled)}
              onRemoteConnect={() => user.assignedNodeId && setRemoteNodeId(user.assignedNodeId)}
            />
          ) : (
            <Empty text="Select an account." />
          )}
        </div>
      </div>
    </div>
  );
}

const OS_LABEL: Record<string, { name: string; protocol: string; icon: string }> = {
  windows: { name: "Windows", protocol: "RDP", icon: "🪟" },
  macos: { name: "macOS", protocol: "RDP", icon: "🍎" },
  linux: { name: "Linux", protocol: "SSH", icon: "🐧" },
};

function UserDetail({
  user,
  assignedNode,
  onUnlock,
  onToggleEnabled,
  onRemoteConnect,
}: {
  user: ADUser;
  assignedNode: TargetNode | undefined;
  onUnlock: () => void;
  onToggleEnabled: () => void;
  onRemoteConnect: () => void;
}) {
  const status = adAccountStatus(user);
  const osMeta = assignedNode ? OS_LABEL[assignedNode.os] : undefined;
  const online = assignedNode ? assignedNode.connection.online : false;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-info/20 text-xl">
          {user.locked ? "🔒" : "👤"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-gray-50">{user.displayName}</div>
          <div className="truncate font-mono text-[11px] text-gray-500">{user.upn}</div>
        </div>
      </div>

      <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>
        {status}{user.locked ? ` · ${user.badPwdCount} bad attempts` : ""}
      </span>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label="Login" value={user.samAccountName} mono />
        <Row label="Title" value={user.title} />
        <Row label="Department" value={user.department} />
        <Row label="Email" value={user.email} mono />
        <Row label="Member of" value={user.memberOf.join(", ")} />
        <Row label="Password expires" value={user.passwordExpiresAt ? new Date(user.passwordExpiresAt).toLocaleDateString() : "Never"} />
        <Row label="Must change" value={user.mustChangePassword ? "Yes" : "No"} />
        <Row label="Last logon" value={user.lastLogon ? new Date(user.lastLogon).toLocaleString() : "—"} />
      </dl>

      {/* Assigned endpoint + Remote Connect (RDP/SSH) */}
      <div className="rounded-md border border-edge bg-panelalt/60 p-3">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
          Assigned workstation
        </div>
        {assignedNode ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-lg">{osMeta?.icon ?? "🖥️"}</span>
              <div className="min-w-0">
                <div className="truncate text-xs text-gray-100">{assignedNode.hostname}</div>
                <div className="truncate font-mono text-[10px] text-gray-500">
                  {osMeta?.name} · {assignedNode.connection.ip}
                </div>
              </div>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            <button
              onClick={onRemoteConnect}
              disabled={!online}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-info px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
            >
              🛰️ Remote Connect ({osMeta?.protocol ?? "RDP"})
            </button>
          </>
        ) : (
          <div className="text-[11px] text-gray-600">No workstation mapped to this account.</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
        <button
          onClick={onUnlock}
          disabled={!user.locked}
          className="rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
        >
          Unlock account
        </button>
        <button
          onClick={onToggleEnabled}
          className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-200 hover:bg-panelalt"
        >
          {user.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className={`truncate text-gray-200 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-xs text-gray-600">{text}</div>;
}
