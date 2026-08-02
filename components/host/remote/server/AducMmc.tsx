"use client";

/**
 * AducMmc — Active Directory Users and Computers (functional MMC snap-in)
 * =======================================================================
 * MMC chrome (menu + toolbar + action bar), a console tree (Domain → Builtin,
 * Computers, Domain Controllers, Users, department OUs) and a detail pane of
 * user / computer / group objects.
 *
 * Fully interactive: right-click (or the action bar) to Reset Password, create
 * a New User, or open Properties — where Job Title / Department are editable
 * and the Member Of tab adds/removes security groups. Every action mutates the
 * shared InfrastructureState, so the reconciler can resolve AD tickets from it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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

type Dialog =
  | { kind: "props"; sam: string }
  | { kind: "reset"; sam: string }
  | { kind: "new"; ou: string }
  | null;

export default function AducMmc({ nodeId }: { nodeId: string }) {
  const node = useInfraStore((s) => s.infra.nodes[nodeId]) as WindowsNodeState | undefined;
  const nodes = useInfraStore((s) => s.infra.nodes);
  const ad = node?.activeDirectory;

  const [sel, setSel] = useState<string>("Users");
  const [selectedSam, setSelectedSam] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sam: string } | null>(null);
  const [remoteNodeId, setRemoteNodeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const departments = useMemo(
    () => (ad ? Array.from(new Set(ad.users.map((u) => u.department))).sort() : []),
    [ad],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!node || !ad) {
    return <div className="flex h-full items-center justify-center text-[12px] text-gray-500">This server does not host Active Directory.</div>;
  }

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
    if (sel === "Groups") return ad.groups.map((g) => ({ kind: "group", name: g.name, desc: (g as { description?: string }).description ?? `${g.scope} · ${g.category} group` }));
    if (sel === "Computers") return ad.computers.map((c) => ({ kind: "computer", name: c.name, os: c.os }));
    if (sel === "Domain Controllers") return ad.computers.filter((c) => /-PDC-|-BDC-|-DC-/i.test(c.name)).map((c) => ({ kind: "computer", name: c.name, os: c.os }));
    if (sel === "Users") return ad.users.map((u) => ({ kind: "user", user: u } as Row));
    return ad.users.filter((u) => u.department === sel).map((u) => ({ kind: "user", user: u } as Row));
  })();

  const currentOu = departments.includes(sel) ? sel : "";
  const selectedUser = selectedSam ? ad.users.find((u) => u.samAccountName === selectedSam) ?? null : null;

  return (
    <div className="relative flex h-full flex-col bg-[#f0f0f0] text-[12px] text-[#1f1f1f]" onClick={() => setMenu(null)}>
      {/* MMC menu bar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-[#d0d0d0] bg-[#f6f6f6] px-3 py-1 text-[12px] text-[#333]">
        {["File", "Action", "View", "Help"].map((m) => <span key={m} className="cursor-default hover:text-black">{m}</span>)}
      </div>

      {/* toolbar + action bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#d0d0d0] bg-[#eee] px-3 py-1 text-[13px] text-[#555]">
        <span title="Back">◀</span><span title="Forward">▶</span><span className="text-[#ccc]">|</span>
        <span title="Up">⬆️</span><span title="Refresh">🔄</span><span className="text-[#ccc]">|</span>
        <ActionBtn label="New User" icon="➕" onClick={() => setDialog({ kind: "new", ou: currentOu || "Marketing" })} />
        <ActionBtn label="Reset Password" icon="🔑" disabled={!selectedUser} onClick={() => selectedUser && setDialog({ kind: "reset", sam: selectedUser.samAccountName })} />
        <ActionBtn label="Properties" icon="📄" disabled={!selectedUser} onClick={() => selectedUser && setDialog({ kind: "props", sam: selectedUser.samAccountName })} />
        <span className="ml-auto text-[10px] text-[#888]">Console Root · Active Directory Users and Computers</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Console tree */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-[#d0d0d0] bg-white py-1">
          <div className="flex items-center gap-1 px-2 py-0.5"><span>🗃️</span><span className="truncate">Active Directory Users and Computers [ {node.hostname} ]</span></div>
          <div className="flex items-center gap-1 py-0.5 pl-3"><span className="text-[9px] text-[#666]">▾</span><span>{ICON.domain}</span><span className="truncate">{ad.domainDns}</span></div>
          <TreeLeaf icon={ICON.builtin} label="Builtin" active={sel === "Builtin"} onClick={() => setSel("Builtin")} />
          <TreeLeaf icon={ICON.ou} label="Computers" active={sel === "Computers"} onClick={() => setSel("Computers")} />
          <TreeLeaf icon="🧭" label="Domain Controllers" active={sel === "Domain Controllers"} onClick={() => setSel("Domain Controllers")} />
          <TreeLeaf icon={ICON.group} label="Groups" active={sel === "Groups"} onClick={() => setSel("Groups")} />
          <TreeLeaf icon={ICON.ou} label="Users" active={sel === "Users"} onClick={() => setSel("Users")} />
          {departments.map((d) => (
            <TreeLeaf key={d} icon={ICON.ou} label={d} active={sel === d} onClick={() => setSel(d)} />
          ))}
        </div>

        {/* Detail pane */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 grid grid-cols-[1fr_130px_1fr] gap-2 border-b border-[#d0d0d0] bg-[#f3f3f3] px-3 py-1 text-[11px] font-semibold text-[#555]">
            <span>Name</span><span>Type</span><span>Description</span>
          </div>
          {rows.length === 0 && <div className="p-4 text-[11px] text-gray-500">There are no items to show in this view.</div>}
          {rows.map((r, i) => (
            <RowView
              key={i}
              row={r}
              selected={r.kind === "user" && r.user.samAccountName === selectedSam}
              onSelect={(sam) => setSelectedSam(sam)}
              onOpen={(sam) => setDialog({ kind: "props", sam })}
              onContext={(sam, x, y) => { setSelectedSam(sam); setMenu({ x, y, sam }); }}
            />
          ))}
          <div className="px-3 py-1.5 text-[10px] text-[#888]">{rows.length} object(s)</div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[#d0d0d0] bg-[#f3f3f3] px-3 py-0.5 text-[10px] text-[#666]">
        <span>{ad.users.length} users</span><span>{ad.computers.length} computers</span><span>{ad.groups.length} groups</span>
        {ad.users.filter((u) => u.locked).length > 0 && <span className="text-red-600">🔒 {ad.users.filter((u) => u.locked).length} locked</span>}
      </div>

      {/* Context menu */}
      {menu && (
        <div className="absolute z-40 w-52 rounded-sm border border-[#b0b0b0] bg-white py-1 text-[12px] shadow-lg" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <MenuItem label="Reset Password…" onClick={() => { setDialog({ kind: "reset", sam: menu.sam }); setMenu(null); }} />
          <MenuItem label="Properties" onClick={() => { setDialog({ kind: "props", sam: menu.sam }); setMenu(null); }} />
          <div className="my-1 border-t border-[#e5e5e5]" />
          <MenuItem label="New User…" onClick={() => { setDialog({ kind: "new", ou: currentOu || "Marketing" }); setMenu(null); }} />
        </div>
      )}

      {/* Dialogs */}
      {dialog?.kind === "reset" && (
        <ResetPasswordDialog nodeId={nodeId} sam={dialog.sam} ad={ad} onClose={() => setDialog(null)} onDone={(m) => { setToast(m); setDialog(null); }} />
      )}
      {dialog?.kind === "new" && (
        <NewUserDialog nodeId={nodeId} ad={ad} defaultOu={dialog.ou} onClose={() => setDialog(null)} onDone={(m, sam) => { setToast(m); setDialog(null); setSelectedSam(sam); }} />
      )}
      {dialog?.kind === "props" && (() => {
        const u = ad.users.find((x) => x.samAccountName === dialog.sam);
        if (!u) return null;
        return (
          <UserProperties
            nodeId={nodeId}
            user={u}
            allGroups={ad.groups.map((g) => g.name)}
            assignedNode={u.assignedNodeId ? nodes[u.assignedNodeId] : undefined}
            departments={ad.ous.map((o) => o.name)}
            onRemote={() => { if (u.assignedNodeId) { setRemoteNodeId(u.assignedNodeId); setDialog(null); } }}
            onClose={() => setDialog(null)}
            onSaved={(m) => setToast(m)}
          />
        );
      })()}

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-[#0067c0] bg-[#dff0fb] px-3 py-1.5 text-[11px] text-[#12395f] shadow">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// ── Rows / tree / atoms ──────────────────────────────────────────────────────

function RowView({ row, selected, onSelect, onOpen, onContext }: {
  row: Row; selected: boolean; onSelect: (sam: string) => void; onOpen: (sam: string) => void;
  onContext: (sam: string, x: number, y: number) => void;
}) {
  if (row.kind === "user") {
    const status = adAccountStatus(row.user);
    return (
      <button
        onClick={() => onSelect(row.user.samAccountName)}
        onDoubleClick={() => onOpen(row.user.samAccountName)}
        onContextMenu={(e) => {
          e.preventDefault();
          const host = (e.currentTarget.closest(".relative.flex.h-full") as HTMLElement) ?? e.currentTarget;
          const r = host.getBoundingClientRect();
          onContext(row.user.samAccountName, e.clientX - r.left, e.clientY - r.top);
        }}
        title="Double-click for Properties · right-click for actions"
        className={`grid w-full grid-cols-[1fr_130px_1fr] items-center gap-2 border-b border-[#f0f0f0] px-3 py-1 text-left ${selected ? "bg-[#cde0f4]" : "hover:bg-[#eef4fb]"}`}
      >
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

function TreeLeaf({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-1.5 py-0.5 pl-9 pr-2 text-left ${active ? "bg-[#cde0f4] text-[#12395f]" : "text-[#333] hover:bg-[#eef4fb]"}`}>
      <span>{icon}</span><span className="truncate">{label}</span>
    </button>
  );
}

function ActionBtn({ label, icon, onClick, disabled }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[#333] hover:border-[#b0c8e0] hover:bg-[#e5f1fb] disabled:cursor-not-allowed disabled:text-[#aaa] disabled:hover:border-transparent disabled:hover:bg-transparent">
      <span>{icon}</span>{label}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full px-3 py-1 text-left hover:bg-[#cde0f4]">{label}</button>;
}

// ── Dialog shell ─────────────────────────────────────────────────────────────

function DialogShell({ title, icon, wide, onClose, children, footer }: {
  title: string; icon: string; wide?: boolean; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-3" onClick={onClose}>
      <div className={`flex max-h-full ${wide ? "w-[440px]" : "w-[380px]"} flex-col overflow-hidden rounded-sm border border-[#7a7a7a] bg-[#f0f0f0] shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2 bg-[#f6f6f6] px-3 py-1.5 text-[12px]">
          <span>{icon}</span><span className="font-semibold">{title}</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto flex h-6 w-8 items-center justify-center hover:bg-[#e81123] hover:text-white">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">{children}</div>
        <div className="flex shrink-0 items-center gap-2 border-t border-[#c8c8c8] bg-[#f0f0f0] px-3 py-2">{footer}</div>
      </div>
    </div>
  );
}

const btnPrimary = "rounded-sm border border-[#0067c0] bg-[#0078d4] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#106ebe] disabled:cursor-not-allowed disabled:border-[#ccc] disabled:bg-[#ccc]";
const btnPlain = "rounded-sm border border-[#adadad] bg-white px-3 py-1 text-[12px] hover:bg-[#e5f1fb] disabled:cursor-not-allowed disabled:text-[#aaa]";

// ── Reset Password ───────────────────────────────────────────────────────────

function ResetPasswordDialog({ nodeId, sam, ad, onClose, onDone }: {
  nodeId: string; sam: string; ad: NonNullable<WindowsNodeState["activeDirectory"]>; onClose: () => void; onDone: (msg: string) => void;
}) {
  const reset = useInfraStore((s) => s.resetADUserPassword);
  const user = ad.users.find((u) => u.samAccountName === sam);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;

  function apply() {
    if (!pw.trim()) { setErr("The password cannot be empty."); return; }
    if (pw !== confirm) { setErr("The passwords do not match."); return; }
    reset(nodeId, sam, pw, mustChange);
    onDone(`Password reset for ${user!.displayName}${mustChange ? " · must change at next logon" : ""}`);
  }

  return (
    <DialogShell title="Reset Password" icon="🔑" onClose={onClose}
      footer={<><span className="text-[10px] text-[#777]">{user.upn}</span><button onClick={onClose} className={`ml-auto ${btnPlain}`}>Cancel</button><button onClick={apply} className={btnPrimary}>OK</button></>}>
      <div className="space-y-3 p-4 text-[12px]">
        <div className="text-[#333]">Reset the password for <span className="font-semibold">{user.displayName}</span> ({user.samAccountName}).</div>
        <LabeledInput label="New password" type="password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} autoFocus />
        <LabeledInput label="Confirm password" type="password" value={confirm} onChange={(v) => { setConfirm(v); setErr(null); }} />
        <label className="flex items-center gap-2 pt-1 text-[12px] text-[#333]">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
          User must change password at next logon
        </label>
        {user.locked && <div className="rounded-sm border border-[#f0c000] bg-[#fff8e0] px-2 py-1 text-[11px] text-[#7a5c00]">This account is currently locked out. Resetting the password will also unlock it.</div>}
        {err && <div className="text-[11px] text-red-600">{err}</div>}
      </div>
    </DialogShell>
  );
}

// ── New User wizard ──────────────────────────────────────────────────────────

function NewUserDialog({ nodeId, ad, defaultOu, onClose, onDone }: {
  nodeId: string; ad: NonNullable<WindowsNodeState["activeDirectory"]>; defaultOu: string;
  onClose: () => void; onDone: (msg: string, sam: string) => void;
}) {
  const create = useInfraStore((s) => s.createADUser);
  const ous = ad.ous.map((o) => o.name);
  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [sam, setSam] = useState("");
  const [ou, setOu] = useState(ous.includes(defaultOu) ? defaultOu : ous[0] ?? "");
  const [title, setTitle] = useState("");
  const [pw, setPw] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [groups, setGroups] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const touched = useRef(false);

  // Auto-suggest the logon name from first/last until the admin edits it.
  useEffect(() => {
    if (touched.current) return;
    const s = first && last ? `${first[0]}.${last}`.toLowerCase() : "";
    setSam(s);
  }, [first, last]);

  const ouGroups = ad.groups.map((g) => g.name).filter((g) => g !== "Domain Users");

  function next() {
    if (!first.trim() || !last.trim()) { setErr("First and last name are required."); return; }
    if (!sam.trim()) { setErr("A user logon name is required."); return; }
    if (ad.users.some((u) => u.samAccountName.toLowerCase() === sam.trim().toLowerCase())) { setErr("That logon name already exists in the domain."); return; }
    setErr(null); setStep(2);
  }
  function finish() {
    if (!pw.trim()) { setErr("A password is required."); return; }
    create(nodeId, {
      firstName: first.trim(), lastName: last.trim(), samAccountName: sam.trim().toLowerCase(),
      password: pw, mustChangePassword: mustChange, department: ou, title: title.trim() || "Staff",
      memberOf: [ou, ...groups],
    });
    onDone(`Created ${first} ${last} (${sam}) in ${ou}`, sam.trim().toLowerCase());
  }

  return (
    <DialogShell title={`New Object — User (step ${step} of 2)`} icon="➕" wide onClose={onClose}
      footer={
        <>
          <span className="text-[10px] text-[#777]">Create in: {ou}</span>
          <button onClick={onClose} className={`ml-auto ${btnPlain}`}>Cancel</button>
          {step === 2 && <button onClick={() => setStep(1)} className={btnPlain}>&lt; Back</button>}
          {step === 1 ? <button onClick={next} className={btnPrimary}>Next &gt;</button> : <button onClick={finish} className={btnPrimary}>Finish</button>}
        </>
      }>
      <div className="space-y-3 p-4 text-[12px]">
        {step === 1 ? (
          <>
            <LabeledInput label="First name" value={first} onChange={(v) => { setFirst(v); setErr(null); }} autoFocus />
            <LabeledInput label="Last name" value={last} onChange={(v) => { setLast(v); setErr(null); }} />
            <LabeledInput label="User logon name" value={sam} onChange={(v) => { touched.current = true; setSam(v); setErr(null); }} suffix={`@${ad.domainDns}`} />
            <LabeledSelect label="Create in (OU)" value={ou} onChange={setOu} options={ous} />
            <LabeledInput label="Job title" value={title} onChange={setTitle} placeholder="e.g. Marketing Associate" />
          </>
        ) : (
          <>
            <LabeledInput label="Password" type="password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} autoFocus />
            <label className="flex items-center gap-2 text-[12px] text-[#333]">
              <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
              User must change password at next logon
            </label>
            <div className="pt-1">
              <div className="mb-1 text-[11px] font-semibold text-[#555]">Member of (security groups)</div>
              <div className="max-h-32 overflow-y-auto rounded-sm border border-[#c8c8c8] bg-white p-1">
                {ouGroups.map((g) => (
                  <label key={g} className="flex items-center gap-2 px-1 py-0.5 hover:bg-[#eef4fb]">
                    <input type="checkbox" checked={groups.includes(g)} onChange={(e) => setGroups((prev) => (e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)))} />
                    <span className="truncate">{g}</span>
                  </label>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-[#888]">&quot;Domain Users&quot; and the {ou} group are added automatically.</div>
            </div>
          </>
        )}
        {err && <div className="text-[11px] text-red-600">{err}</div>}
      </div>
    </DialogShell>
  );
}

// ── User Properties (editable + Member Of) ───────────────────────────────────

const OS_LABEL: Record<string, { name: string; protocol: string; icon: string }> = {
  windows: { name: "Windows", protocol: "RDP", icon: "🪟" }, macos: { name: "macOS", protocol: "RDP", icon: "🍎" }, linux: { name: "Linux", protocol: "SSH", icon: "🐧" },
};

function UserProperties({ nodeId, user, allGroups, departments, assignedNode, onRemote, onClose, onSaved }: {
  nodeId: string; user: ADUser; allGroups: string[]; departments: string[];
  assignedNode: TargetNode | undefined; onRemote: () => void; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const updateProfile = useInfraStore((s) => s.updateADUserProfile);
  const setGroups = useInfraStore((s) => s.setADUserGroups);
  const setEnabled = useInfraStore((s) => s.setADUserEnabled);
  const unlock = useInfraStore((s) => s.unlockADUser);

  const [tab, setTab] = useState<"general" | "account" | "memberof">("general");
  const [title, setTitle] = useState(user.title);
  const [dept, setDept] = useState(user.department);
  const [memberOf, setMemberOf] = useState<string[]>(user.memberOf);
  const [addPick, setAddPick] = useState("");

  const status = adAccountStatus(user);
  const os = assignedNode ? OS_LABEL[assignedNode.os] : undefined;
  const online = assignedNode ? assignedNode.connection.online : false;
  const dirty = title !== user.title || dept !== user.department || memberOf.join("|") !== user.memberOf.join("|");
  const addable = allGroups.filter((g) => !memberOf.includes(g)).sort();

  function apply() {
    if (title !== user.title || dept !== user.department) {
      updateProfile(nodeId, user.samAccountName, { title, department: dept, description: title });
    }
    if (memberOf.join("|") !== user.memberOf.join("|")) setGroups(nodeId, user.samAccountName, memberOf);
    onSaved(`Saved changes to ${user.displayName}`);
  }

  return (
    <DialogShell title={`${user.displayName} Properties`} icon={ICON.user} onClose={onClose}
      footer={
        <>
          <button onClick={() => unlock(nodeId, user.samAccountName)} disabled={!user.locked} className={btnPlain}>Unlock</button>
          <button onClick={() => setEnabled(nodeId, user.samAccountName, !user.enabled)} className={btnPlain}>{user.enabled ? "Disable" : "Enable"}</button>
          <button onClick={onClose} className={`ml-auto ${btnPlain}`}>Cancel</button>
          <button onClick={apply} disabled={!dirty} className={btnPrimary}>Apply</button>
        </>
      }>
      {/* tabs */}
      <div className="flex gap-0 border-b border-[#c8c8c8] bg-[#e8e8e8] px-2 pt-1 text-[11px]">
        {([["general", "General"], ["account", "Account"], ["memberof", "Member Of"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`border border-b-0 px-3 py-1 ${tab === id ? "rounded-t border-[#c8c8c8] bg-white font-semibold" : "border-transparent text-[#666] hover:text-[#222]"}`}>{label}</button>
        ))}
      </div>

      <div className="space-y-2 p-4 text-[12px]">
        {tab === "general" && (
          <>
            <ReadOnly label="Full name" value={user.displayName} />
            <LabeledInput label="Job title" value={title} onChange={setTitle} />
            <LabeledSelect label="Department" value={dept} onChange={setDept} options={departments.includes(dept) ? departments : [dept, ...departments]} />
            <ReadOnly label="Email" value={user.email} />
            <div className="mt-2 rounded border border-[#d0d0d0] bg-[#f7f7f7] p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#777]">Managed device</div>
              {assignedNode ? (
                <div className="flex items-center gap-2">
                  <span className="text-base">{os?.icon}</span>
                  <div className="min-w-0"><div className="truncate">{assignedNode.hostname}</div><div className="truncate text-[10px] text-[#888]">{os?.name} · {assignedNode.connection.ip}</div></div>
                  <button onClick={onRemote} disabled={!online} className={`ml-auto ${btnPrimary}`}>🛰️ Remote Connect ({os?.protocol})</button>
                </div>
              ) : <div className="text-[11px] text-[#999]">No workstation mapped to this account.</div>}
            </div>
          </>
        )}

        {tab === "account" && (
          <>
            <ReadOnly label="User logon (UPN)" value={user.upn} />
            <ReadOnly label="SAM account" value={user.samAccountName} />
            <ReadOnly label="OU" value={user.ou} />
            <div className="flex items-center gap-2 pt-1">
              <span className="w-28 text-[#555]">Account status</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${status === "Locked" ? "bg-red-100 text-red-700" : status === "Disabled" ? "bg-gray-200 text-gray-600" : "bg-emerald-100 text-emerald-700"}`}>
                {status}{user.locked ? ` · ${user.badPwdCount} bad attempts` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-28 text-[#555]">Must change pw</span>
              <span className={user.mustChangePassword ? "text-[#12395f]" : "text-[#888]"}>{user.mustChangePassword ? "Yes — at next logon" : "No"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-28 text-[#555]">Password set</span>
              <span className="text-[#555]">{user.passwordLastSet ? new Date(user.passwordLastSet).toLocaleString() : "—"}</span>
            </div>
          </>
        )}

        {tab === "memberof" && (
          <>
            <div className="mb-1 text-[11px] font-semibold text-[#555]">Member of</div>
            <div className="max-h-40 overflow-y-auto rounded-sm border border-[#c8c8c8] bg-white">
              {memberOf.map((g) => (
                <div key={g} className="flex items-center gap-2 border-b border-[#f2f2f2] px-2 py-1 last:border-b-0">
                  <span>{ICON.group}</span><span className="min-w-0 flex-1 truncate">{g}</span>
                  <button
                    onClick={() => setMemberOf((p) => p.filter((x) => x !== g))}
                    disabled={g === "Domain Users"}
                    title={g === "Domain Users" ? "The primary group cannot be removed" : "Remove"}
                    className="rounded-sm border border-[#adadad] bg-white px-1.5 py-0.5 text-[10px] hover:bg-[#fde7e9] disabled:cursor-not-allowed disabled:text-[#bbb]"
                  >Remove</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <select value={addPick} onChange={(e) => setAddPick(e.target.value)} className="min-w-0 flex-1 rounded-sm border border-[#c8c8c8] bg-white px-2 py-1 text-[12px]">
                <option value="">— select a group to add —</option>
                {addable.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <button onClick={() => { if (addPick) { setMemberOf((p) => [...p, addPick]); setAddPick(""); } }} disabled={!addPick} className={btnPlain}>Add</button>
            </div>
            {dirty && <div className="pt-1 text-[10px] text-[#0067c0]">Unsaved changes — click Apply to commit to the directory.</div>}
          </>
        )}
      </div>
    </DialogShell>
  );
}

// ── form atoms ───────────────────────────────────────────────────────────────

function LabeledInput({ label, value, onChange, type = "text", placeholder, suffix, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; suffix?: string; autoFocus?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[#555]">{label}</span>
      <input type={type} value={value} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-sm border border-[#c8c8c8] bg-white px-2 py-1 text-[12px] outline-none placeholder:text-[#aaa] focus:border-[#0078d4]" />
      {suffix && <span className="shrink-0 text-[10px] text-[#888]">{suffix}</span>}
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[#555]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded-sm border border-[#c8c8c8] bg-white px-2 py-1 text-[12px] focus:border-[#0078d4]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[#555]">{label}</span>
      <span className="min-w-0 flex-1 truncate rounded-sm border border-[#c8c8c8] bg-[#fbfbfb] px-2 py-1 font-mono text-[11px] text-[#444]">{value}</span>
    </div>
  );
}
