"use client";

/**
 * Active Directory Users & Computers (ADUC)
 * -----------------------------------------
 * Interactive on the domain controller's ActiveDirectoryState. Unlocking
 * j.doe here mutates the shared node and (via the ticket reconciler) resolves
 * the TCK-4822 lockout ticket — the same outcome as a CLI unlock would produce.
 */

import { useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import type { ADUser, WindowsNodeState } from "@/lib/core";

export default function ADUCPanel({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const unlock = useInfraStore((s) => s.unlockADUser);
  const setEnabled = useInfraStore((s) => s.setADUserEnabled);
  const [selected, setSelected] = useState<string | null>(null);

  const ad = node?.activeDirectory;
  if (!ad) return <Empty text="This node does not host Active Directory." />;

  const user = ad.users.find((u) => u.samAccountName === selected) ?? null;

  return (
    <div className="flex h-full bg-panel text-sm text-gray-200">
      {/* Tree / list */}
      <div className="w-64 shrink-0 overflow-y-auto term-scroll border-r border-edge">
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {ad.domainDns}
        </div>
        {ad.ous.map((ou) => {
          const members = ad.users.filter((u) => u.ou === ou.dn);
          return (
            <div key={ou.dn} className="py-1">
              <div className="px-3 py-1 text-[11px] text-gray-400">📁 {ou.name}</div>
              {members.map((u) => (
                <button
                  key={u.samAccountName}
                  onClick={() => setSelected(u.samAccountName)}
                  className={`flex w-full items-center gap-2 px-5 py-1.5 text-left text-xs ${
                    selected === u.samAccountName ? "bg-info/15 text-info" : "hover:bg-panelalt"
                  }`}
                >
                  <span>{u.locked ? "🔒" : u.enabled ? "👤" : "🚫"}</span>
                  <span className="truncate">{u.displayName}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Detail */}
      <div className="min-w-0 flex-1 overflow-y-auto term-scroll p-4">
        {user ? (
          <UserDetail
            user={user}
            onUnlock={() => unlock(nodeId, user.samAccountName)}
            onToggleEnabled={() => setEnabled(nodeId, user.samAccountName, !user.enabled)}
          />
        ) : (
          <Empty text="Select an account to view its properties." />
        )}
      </div>
    </div>
  );
}

function UserDetail({
  user,
  onUnlock,
  onToggleEnabled,
}: {
  user: ADUser;
  onUnlock: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/20 text-2xl">
          {user.locked ? "🔒" : "👤"}
        </div>
        <div>
          <div className="text-base font-semibold text-gray-50">{user.displayName}</div>
          <div className="font-mono text-[11px] text-gray-500">{user.upn}</div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          {user.locked && (
            <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">
              🔒 Locked · {user.badPwdCount} bad attempts
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              user.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"
            }`}
          >
            {user.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Row label="samAccountName" value={user.samAccountName} />
        <Row label="Distinguished OU" value={user.ou} mono />
        <Row label="Member of" value={user.memberOf.join(", ")} />
        <Row label="Password expired" value={user.passwordExpired ? "Yes" : "No"} />
        <Row label="Must change at next logon" value={user.mustChangePassword ? "Yes" : "No"} />
        <Row
          label="Last logon"
          value={user.lastLogon ? new Date(user.lastLogon).toLocaleString() : "—"}
        />
      </dl>

      {user.description && (
        <div className="text-[11px] text-gray-500">{user.description}</div>
      )}

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
          {user.enabled ? "Disable account" : "Enable account"}
        </button>
        <button
          disabled
          className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-500"
          title="Password reset dialog — later phase"
        >
          Reset password…
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className={`text-gray-200 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-gray-600">{text}</div>;
}
