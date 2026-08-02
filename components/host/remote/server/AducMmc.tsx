"use client";

/**
 * AducMmc — Active Directory Users and Computers, styled as a real MMC snap-in.
 * MMC chrome (menu + toolbar), a left console tree (Domain → Builtin, Computers,
 * Domain Controllers, Users, department OUs) and a right detail pane listing
 * user / computer / group objects with authentic icons. Double-click a user for
 * its Properties, including the [Remote Connect] action that mounts the endpoint.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { adAccountStatus, type ADUser, type TargetNode, type WindowsNodeState } from "@/lib/core";
import EndpointSession from "../endpoints/EndpointSession";

type Row =
  | { kind: "user"; user: ADUser }
  | { kind: "computer"; name: string; os: string }
  | { kind: "group"; name: string; desc: string };

const ICON = { user: "🧑‍💼", computer: "🖥️", group: "👥", ou: "📁", domain: "🌐", builtin: "🗂️" };

const BUILTIN_GROUPS = [
  { name: "Administrators", desc: "Administrators have complete and unrestricted access" },
  { name: "Domain Admins", desc: "Designated administrators of the domain" },
  { name: "Remote Desktop Users", desc: "Members are granted the right to logon remotely" },
  { name: "Users", desc: "Users are prevented from making system-wide changes" },
  { name: "Backup Operators", desc: "Can override security to back up files" },
];

export default function AducMmc({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const nodes = useInfraStore((s) => s.infra.nodes);
  const unlock = useInfraStore((s) => s.unlockADUser);
  const setEnabled = useInfraStore((s) => s.setADUserEnabled);

  const ad = node?.activeDirectory;
  const [sel, setSel] = useState<string>("Users");
  const [propsUser, setPropsUser] = useState<string | null>(null);
  const [remoteNodeId, setRemoteNodeId] = useState<string | null>(null);

  const departments = useMemo(() => (ad ? Array.from(new Set(ad.users.map((u) => u.department))).sort() : []), [ad]);

  if (!node || !ad) return <div className="flex h-full items-center justify-center text-[12px] text-gray-500">This server does not host Active Directory.</div>;

  // Remote session overlay (from a user's Properties → Remote Connect).
  if (remoteNodeId) {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex shrink-0 items-center gap-2 border-b border-[#c8c8c8] bg-[#eaeaea] px-3 py-1 text-[11px] text-[#1f1f1f]">
          <button onClick={() => setRemoteNodeId(null)} className="rounded border border-[#b0b0b0] bg-white px-2 py-0.5 hover:bg-[#f0f0f0]">← Back to ADUC</button>
          <span className="text-[#666]">Remote session established via Active Directory</span>
        </div>
        <div className="min-h-0 flex-1"><EndpointSession nodeId={remoteNodeId} onDisconnect={() => setRemoteNodeId(null)} /></div>
      </div>
    );
  }

  const rows: Row[] = (() => {
    if (sel === "Builtin") return BUILTIN_GROUPS.map((g) => ({ kind: "group", name: g.name, desc: g.desc }));
    if (sel === "Computers") return ad.computers.map((c) => ({ kind: "computer", name: c.name, os: c.os }));
    if (sel === "Domain Controllers") return ad.computers.filter((c) => /-PDC-|-BDC-|-DC-/i.test(c.name)).map((c) => ({ kind: "computer", name: c.name, os: c.os }));
    if (sel === "Users") return ad.users.map((u) => ({ kind: "user", user: u } as Row));
    // department OU
    return ad.users.filter((u) => u.department === sel).map((u) => ({ kind: "user", user: u } as Row));
  })();

  const user = propsUser ? ad.users.find((u) => u.samAccountName === propsUser) ?? null : null;
  const assignedNode = user?.assignedNodeId ? nodes[user.assignedNodeId] : undefined;

  return (
    <div className="relative flex h-full flex-col bg-[#f0f0f0] text-[12px] text-[#1f1f1f]">
      {/* MMC menu bar */}
      <div className="flex items-center gap-4 border-b border-[#d0d0d0] bg-[#f6f6f6] px-3 py-1 text-[12px] text-[#333]">
        {["File", "Action", "View", "Help"].map((m) => <span key={m} className="cursor-default hover:text-black">{m}</span>)}
      </div>
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-[#d0d0d0] bg-[#eee] px-3 py-1 text-[13px] text-[#555]">
        <span title="Back">◀</span><span title="Forward">▶</span><span className="text-[#ccc]">|</span>
        <span title="Up">⬆️</span><span title="Refresh">🔄</span><span title="Properties">📄</span>
        <span className="ml-auto text-[10px] text-[#888]">Console Root · Active Directory Users and Computers</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Console tree */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-[#d0d0d0] bg-white py-1">
          <TreeRoot label={`Active Directory Users and Computers [ ${node.hostname} ]`}>
            <TreeNode icon={ICON.domain} label={ad.domainDns} depth={1} isBranch>
              <TreeLeaf icon={ICON.builtin} label="Builtin" active={sel === "Builtin"} onClick={() => setSel("Builtin")} />
              <TreeLeaf icon={ICON.ou} label="Computers" active={sel === "Computers"} onClick={() => setSel("Computers")} />
              <TreeLeaf icon="🧭" label="Domain Controllers" active={sel === "Domain Controllers"} onClick={() => setSel("Domain Controllers")} />
              <TreeLeaf icon={ICON.ou} label="Users" active={sel === "Users"} onClick={() => setSel("Users")} />
              {departments.map((d) => (
                <TreeLeaf key={d} icon={ICON.ou} label={d} active={sel === d} onClick={() => setSel(d)} />
              ))}
            </TreeNode>
          </TreeRoot>
        </div>

        {/* Detail pane */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 grid grid-cols-[1fr_130px_1fr] gap-2 border-b border-[#d0d0d0] bg-[#f3f3f3] px-3 py-1 text-[11px] font-semibold text-[#555]">
            <span>Name</span><span>Type</span><span>Description</span>
          </div>
          {rows.length === 0 && <div className="p-4 text-[11px] text-gray-500">There are no items to show in this view.</div>}
          {rows.map((r, i) => (
            <RowView key={i} row={r} onOpen={(sam) => setPropsUser(sam)} />
          ))}
          <div className="px-3 py-1.5 text-[10px] text-[#888]">{rows.length} object(s)</div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 border-t border-[#d0d0d0] bg-[#f3f3f3] px-3 py-0.5 text-[10px] text-[#666]">
        <span>{ad.users.length} users</span><span>{ad.computers.length} computers</span>
        {ad.users.filter((u) => u.locked).length > 0 && <span className="text-red-600">🔒 {ad.users.filter((u) => u.locked).length} locked</span>}
      </div>

      {user && (
        <UserProperties
          user={user}
          assignedNode={assignedNode}
          onUnlock={() => unlock(nodeId, user.samAccountName)}
          onToggleEnabled={() => setEnabled(nodeId, user.samAccountName, !user.enabled)}
          onRemote={() => user.assignedNodeId && setRemoteNodeId(user.assignedNodeId)}
          onClose={() => setPropsUser(null)}
        />
      )}
    </div>
  );
}

function RowView({ row, onOpen }: { row: Row; onOpen: (sam: string) => void }) {
  if (row.kind === "user") {
    const status = adAccountStatus(row.user);
    return (
      <button onDoubleClick={() => onOpen(row.user.samAccountName)} title="Double-click for Properties"
        className="grid w-full grid-cols-[1fr_130px_1fr] items-center gap-2 border-b border-[#f0f0f0] px-3 py-1 text-left hover:bg-[#cde0f4]">
        <span className="flex min-w-0 items-center gap-2"><span>{row.user.locked ? "🔒" : ICON.user}</span><span className="truncate">{row.user.displayName}</span></span>
        <span className="text-[#555]">User{status !== "Active" ? ` · ${status}` : ""}</span>
        <span className="truncate text-[#555]">{row.user.title}</span>
      </button>
    );
  }
  if (row.kind === "computer") {
    return (
      <div className="grid w-full grid-cols-[1fr_130px_1fr] items-center gap-2 border-b border-[#f0f0f0] px-3 py-1 hover:bg-[#eef4fb]">
        <span className="flex min-w-0 items-center gap-2"><span>{ICON.computer}</span><span className="truncate">{row.name}</span></span>
        <span className="text-[#555]">Computer</span><span className="truncate text-[#555]">{row.os}</span>
      </div>
    );
  }
  return (
    <div className="grid w-full grid-cols-[1fr_130px_1fr] items-center gap-2 border-b border-[#f0f0f0] px-3 py-1 hover:bg-[#eef4fb]">
      <span className="flex min-w-0 items-center gap-2"><span>{ICON.group}</span><span className="truncate">{row.name}</span></span>
      <span className="text-[#555]">Security Group</span><span className="truncate text-[#555]">{row.desc}</span>
    </div>
  );
}

// ── Tree atoms ───────────────────────────────────────────────────────────────

function TreeRoot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-1 px-2 py-0.5 text-[#1f1f1f]"><span>🗃️</span><span className="truncate">{label}</span></div>
      <div>{children}</div>
    </div>
  );
}
function TreeNode({ icon, label, depth, isBranch, children }: { icon: string; label: string; depth: number; isBranch?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5 text-[#1f1f1f]" style={{ paddingLeft: 8 + depth * 12 }}><span className="text-[9px] text-[#666]">{isBranch ? "▾" : ""}</span><span>{icon}</span><span className="truncate">{label}</span></div>
      <div>{children}</div>
    </div>
  );
}
function TreeLeaf({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-1.5 py-0.5 pl-9 pr-2 text-left ${active ? "bg-[#cde0f4] text-[#12395f]" : "text-[#333] hover:bg-[#eef4fb]"}`}>
      <span>{icon}</span><span className="truncate">{label}</span>
    </button>
  );
}

// ── User Properties dialog ───────────────────────────────────────────────────

const OS_LABEL: Record<string, { name: string; protocol: string; icon: string }> = {
  windows: { name: "Windows", protocol: "RDP", icon: "🪟" }, macos: { name: "macOS", protocol: "RDP", icon: "🍎" }, linux: { name: "Linux", protocol: "SSH", icon: "🐧" },
};

function UserProperties({ user, assignedNode, onUnlock, onToggleEnabled, onRemote, onClose }: {
  user: ADUser; assignedNode: TargetNode | undefined; onUnlock: () => void; onToggleEnabled: () => void; onRemote: () => void; onClose: () => void;
}) {
  const status = adAccountStatus(user);
  const os = assignedNode ? OS_LABEL[assignedNode.os] : undefined;
  const online = assignedNode ? assignedNode.connection.online : false;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-3" onClick={onClose}>
      <div className="flex max-h-full w-[380px] flex-col overflow-hidden rounded-sm border border-[#7a7a7a] bg-[#f0f0f0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2 bg-[#f6f6f6] px-3 py-1.5 text-[12px]">
          <span>{ICON.user}</span><span className="font-semibold">{user.displayName} Properties</span>
          <button onClick={onClose} className="ml-auto flex h-6 w-8 items-center justify-center hover:bg-[#e81123] hover:text-white">✕</button>
        </div>
        {/* tabs */}
        <div className="flex shrink-0 gap-0 border-b border-[#c8c8c8] bg-[#e8e8e8] px-2 pt-1 text-[11px]">
          {["General", "Account", "Member Of", "Dial-in"].map((t, i) => (
            <span key={t} className={`border border-b-0 px-3 py-1 ${i === 1 ? "rounded-t bg-white border-[#c8c8c8]" : "border-transparent text-[#666]"}`}>{t}</span>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-white p-4 text-[12px]">
          <Field label="Full name" value={user.displayName} />
          <Field label="User logon (UPN)" value={user.upn} />
          <Field label="SAM account" value={user.samAccountName} />
          <Field label="Title / Dept" value={`${user.title} · ${user.department}`} />
          <Field label="Member of" value={user.memberOf.join(", ") || "Domain Users"} />
          <div className="flex items-center gap-2 pt-1">
            <span className="w-28 text-[#555]">Account status</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${status === "Locked" ? "bg-red-100 text-red-700" : status === "Disabled" ? "bg-gray-200 text-gray-600" : "bg-emerald-100 text-emerald-700"}`}>{status}{user.locked ? ` · ${user.badPwdCount} bad attempts` : ""}</span>
          </div>

          {/* Assigned workstation + Remote Connect */}
          <div className="mt-2 rounded border border-[#d0d0d0] bg-[#f7f7f7] p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#777]">Managed device</div>
            {assignedNode ? (
              <div className="flex items-center gap-2">
                <span className="text-base">{os?.icon}</span>
                <div className="min-w-0"><div className="truncate">{assignedNode.hostname}</div><div className="truncate text-[10px] text-[#888]">{os?.name} · {assignedNode.connection.ip}</div></div>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${online ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>{online ? "Online" : "Offline"}</span>
              </div>
            ) : <div className="text-[11px] text-[#999]">No workstation mapped to this account.</div>}
          </div>
        </div>
        {/* action buttons */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#c8c8c8] bg-[#f0f0f0] px-3 py-2">
          <button onClick={onUnlock} disabled={!user.locked} className="rounded-sm border border-[#adadad] bg-white px-3 py-1 text-[12px] hover:bg-[#e5f1fb] disabled:cursor-not-allowed disabled:text-[#aaa]">Unlock account</button>
          <button onClick={onToggleEnabled} className="rounded-sm border border-[#adadad] bg-white px-3 py-1 text-[12px] hover:bg-[#e5f1fb]">{user.enabled ? "Disable" : "Enable"}</button>
          {assignedNode && (
            <button onClick={onRemote} disabled={!online} className="ml-auto rounded-sm border border-[#0067c0] bg-[#0078d4] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#106ebe] disabled:cursor-not-allowed disabled:border-[#ccc] disabled:bg-[#ccc]">🛰️ Remote Connect ({os?.protocol})</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[#555]">{label}</span>
      <span className="min-w-0 flex-1 truncate rounded-sm border border-[#c8c8c8] bg-[#fbfbfb] px-2 py-0.5 font-mono text-[11px]">{value}</span>
    </div>
  );
}
