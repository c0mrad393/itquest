"use client";

/**
 * Active Directory → Users & Computers (GUI)
 * ------------------------------------------
 * Lists local + domain accounts from the shared VMState and lets the operator
 * unlock locked-out accounts — the canonical Tier-1 Helpdesk task.
 */

import { useVMStore } from "@/lib/vm/store";

export default function ActiveDirectoryApp() {
  const users = useVMStore((s) => s.vm.users);
  const unlock = useVMStore((s) => s.unlockUser);

  return (
    <div className="p-3 text-sm">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">
        corp.internal · Directory
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-2 py-1 font-semibold">Account</th>
            <th className="px-2 py-1 font-semibold">Scope</th>
            <th className="px-2 py-1 font-semibold">Groups</th>
            <th className="px-2 py-1 font-semibold">State</th>
            <th className="px-2 py-1 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username} className="border-t border-edge/60 align-top">
              <td className="px-2 py-2 text-gray-200">{u.username}</td>
              <td className="px-2 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    u.scope === "domain" ? "bg-info/15 text-info" : "bg-gray-700/40 text-gray-400"
                  }`}
                >
                  {u.scope}
                </span>
              </td>
              <td className="px-2 py-2 text-[11px] text-gray-500">{u.groups.join(", ")}</td>
              <td className="px-2 py-2">
                {u.locked ? (
                  <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">
                    🔒 locked ({u.failedLogins} fails)
                  </span>
                ) : (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    active
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right">
                <button
                  onClick={() => unlock(u.username)}
                  disabled={!u.locked}
                  className="rounded border border-accent/40 px-2 py-1 text-[11px] text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Unlock
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
