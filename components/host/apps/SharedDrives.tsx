"use client";

/**
 * Shared Drives — enterprise file shares and their access lists (v0.5.0)
 * ======================================================================
 * The second half of the access-request loop. Adding a user to a group in
 * ADUC grants nothing on its own; granting a group rights here reaches nobody
 * who is not in it. Both have to be true, which is exactly why real access
 * requests get half-done and why this app and the directory console are
 * deliberately separate.
 *
 * Like ADUC it is bound to the estate: no live file server, no shares. And
 * because an ACL names GROUPS, it also needs the directory to resolve them —
 * a domain controller outage stops share work too, which is the cascade the
 * player is meant to feel.
 *
 * The "Effective access" checker is the honest part. It resolves nested groups
 * and Windows deny-wins semantics, and reports the ONE thing to fix — the same
 * function the ticket win-conditions grade with.
 *
 * SVG and CSS indicators only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  SHARE_ACCESS_LABEL,
  accessBlocker,
  accessForUser,
  directoryReach,
  effectiveGroups,
  fileServiceReach,
  type ActiveDirectoryState,
  type FileShare,
  type ShareAccess,
} from "@/lib/core";
import { AppHeader, CountPill } from "./AppChrome";
import ServiceDown from "./ServiceDown";
import {
  IconAlert,
  IconBan,
  IconCheck,
  IconFolder,
  IconPlus,
  IconUsers,
  IconX,
} from "@/components/ui/icons";

const LEVELS: ShareAccess[] = ["read", "change", "full"];

export default function SharedDrives({ embedded = false }: { embedded?: boolean } = {}) {
  const infra = useInfraStore((s) => s.infra);
  const setAce = useInfraStore((s) => s.shareSetAce);
  const removeAce = useInfraStore((s) => s.shareRemoveAce);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [checkSam, setCheckSam] = useState("");

  const fsReach = fileServiceReach(infra);
  const dirReach = directoryReach(infra);
  const server = fsReach.node;
  const shares = useMemo(() => server?.shares ?? [], [server]);

  // Embedded means we are already inside a session on this host.
  if (!fsReach.reachable || !server) {
    return embedded ? null : <ServiceDown title="File Server Unreachable" reach={fsReach} />;
  }

  const ad = dirReach.node && "activeDirectory" in dirReach.node ? dirReach.node.activeDirectory : undefined;
  const selected = shares.find((s) => s.id === selectedId) ?? shares[0] ?? null;

  function act(result: string | null, okText: string) {
    setNotice(result ? { kind: "err", text: result } : { kind: "ok", text: okText });
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      {!embedded && (
        <AppHeader iconId="folder" title="Shared Drives" subtitle={`\\\\${server.hostname}`}>
          <CountPill label="shares" value={shares.length} />
          <span className="ml-2 flex items-center gap-1.5 text-[10px] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SMB on {server.hostname}
          </span>
        </AppHeader>
      )}

      {/* The directory is a dependency even here — you cannot manage an access
          list of groups you cannot look up. */}
      {!dirReach.reachable && (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/40 bg-amber-500/[0.07] px-4 py-1.5 text-[11px] text-amber-200">
          <IconAlert size={12} className="mt-0.5 shrink-0" />
          <span>
            Access lists are read-only: {dirReach.reason} Group names cannot be resolved until the directory is
            back. {dirReach.remedy}
          </span>
        </div>
      )}

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
        {/* ── Shares ───────────────────────────────────────────────────── */}
        <div className="flex w-[19rem] shrink-0 flex-col border-r border-edge">
          <div className="border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Shares
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {shares.map((sh) => (
              <button
                key={sh.id}
                onClick={() => { setSelectedId(sh.id); setNotice(null); }}
                className={`mb-1.5 w-full rounded-md border p-2 text-left transition ${
                  selected?.id === sh.id ? "border-info bg-info/10" : "border-edge hover:border-info/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <IconFolder size={12} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-100">{sh.name}</span>
                  <span className="shrink-0 font-mono text-[9px] text-gray-500">{sh.sizeGb} GB</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[9px] text-gray-600">{sh.path}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {sh.acl.slice(0, 4).map((a) => (
                    <span
                      key={a.groupName}
                      className={`rounded px-1 py-0.5 font-mono text-[8px] ${
                        a.deny ? "bg-danger/15 text-danger" : "bg-info/10 text-info"
                      }`}
                    >
                      {a.deny ? "deny " : ""}
                      {a.groupName}
                    </span>
                  ))}
                  {sh.acl.length === 0 && (
                    <span className="font-mono text-[8px] text-amber-300">no access list</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail ───────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selected ? (
            <p className="text-[11px] text-gray-500">This server has no shares.</p>
          ) : (
            <ShareDetail
              key={selected.id}
              share={selected}
              ad={ad}
              editable={dirReach.reachable}
              checkSam={checkSam}
              setCheckSam={setCheckSam}
              onGrant={(group, level, deny) =>
                act(
                  setAce(selected.id, group, level, deny),
                  `${group} now has ${deny ? "an explicit Deny" : SHARE_ACCESS_LABEL[level]} on ${selected.name}.`,
                )
              }
              onRevoke={(group) => act(removeAce(selected.id, group), `${group} removed from ${selected.name}.`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail pane ─────────────────────────────────────────────────────────────

function ShareDetail({
  share,
  ad,
  editable,
  checkSam,
  setCheckSam,
  onGrant,
  onRevoke,
}: {
  share: FileShare;
  ad?: ActiveDirectoryState;
  editable: boolean;
  checkSam: string;
  setCheckSam: (v: string) => void;
  onGrant: (group: string, level: ShareAccess, deny?: boolean) => void;
  onRevoke: (group: string) => void;
}) {
  const [addGroup, setAddGroup] = useState("");
  const [addLevel, setAddLevel] = useState<ShareAccess>("change");

  const candidate = ad?.users.find(
    (u) => u.samAccountName.toLowerCase() === checkSam.trim().toLowerCase(),
  );
  const effective = ad && candidate ? accessForUser(ad, share, candidate.samAccountName) : null;
  const why = ad && candidate ? accessBlocker(ad, share, candidate.samAccountName, "read") : null;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <IconFolder size={14} className="text-info" />
          <span className="text-sm font-semibold text-gray-100">{share.name}</span>
          <span className="font-mono text-[11px] text-info">{share.path}</span>
          <span className="ml-auto font-mono text-[10px] text-gray-500">{share.sizeGb} GB</span>
        </div>
        <p className="text-[11px] text-gray-400">
          {share.description} · owned by {share.owner}
        </p>
      </section>

      {/* ── Access list ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <IconUsers size={11} /> Access list
        </h3>

        {share.acl.length === 0 ? (
          <p className="mb-2 text-[11px] text-amber-300">
            Nobody has been granted anything. Only Domain Admins can reach this share.
          </p>
        ) : (
          <ul className="mb-2 space-y-1">
            {share.acl.map((ace) => (
              <li
                key={ace.groupName}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] ${
                  ace.deny ? "border-danger/40 bg-danger/[0.06]" : "border-edge bg-panel/60"
                }`}
              >
                {ace.deny ? (
                  <IconBan size={11} className="shrink-0 text-danger" />
                ) : (
                  <IconCheck size={11} className="shrink-0 text-emerald-400" />
                )}
                <span className="min-w-0 flex-1 truncate text-gray-100">{ace.groupName}</span>
                {ace.deny ? (
                  <span className="shrink-0 font-mono text-[10px] text-danger">DENY</span>
                ) : (
                  <select
                    value={ace.access}
                    disabled={!editable}
                    onChange={(e) => onGrant(ace.groupName, e.target.value as ShareAccess)}
                    className="shrink-0 rounded border border-edge bg-panel px-1 py-0.5 font-mono text-[10px] text-gray-200 disabled:text-gray-600"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {SHARE_ACCESS_LABEL[l]}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => onRevoke(ace.groupName)}
                  disabled={!editable}
                  aria-label={`Remove ${ace.groupName}`}
                  className="shrink-0 rounded p-0.5 text-gray-500 hover:text-danger disabled:text-gray-700"
                >
                  <IconX size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Deny is listed first in the explanation because it is the reason
            an operator's "but they ARE in the group" turns out to be true. */}
        {share.acl.some((a) => a.deny) && (
          <p className="mb-2 text-[10px] text-danger">
            An explicit Deny beats every grant on this share, including Full control.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={addGroup}
            onChange={(e) => setAddGroup(e.target.value)}
            disabled={!editable || !ad}
            className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-1 text-[11px] text-gray-200 disabled:text-gray-600"
          >
            <option value="">Add a group&hellip;</option>
            {(ad?.groups ?? [])
              .filter((g) => !share.acl.some((a) => a.groupName === g.name))
              .map((g) => (
                <option key={g.sid} value={g.name}>
                  {g.name}
                </option>
              ))}
          </select>
          <select
            value={addLevel}
            onChange={(e) => setAddLevel(e.target.value as ShareAccess)}
            disabled={!editable}
            className="rounded border border-edge bg-panel px-1.5 py-1 text-[11px] text-gray-200 disabled:text-gray-600"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {SHARE_ACCESS_LABEL[l]}
              </option>
            ))}
          </select>
          <button
            onClick={() => { onGrant(addGroup, addLevel); setAddGroup(""); }}
            disabled={!editable || !addGroup}
            className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-[11px] text-gray-200 hover:bg-panel disabled:text-gray-600"
          >
            <IconPlus size={11} /> Grant
          </button>
        </div>
      </section>

      {/* ── Effective access ────────────────────────────────────────── */}
      <section className="rounded-lg border border-edge bg-panelalt/50 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Effective access
        </h3>
        <div className="mb-2 flex items-center gap-2">
          <input
            value={checkSam}
            onChange={(e) => setCheckSam(e.target.value)}
            placeholder="Logon name, e.g. j.doe"
            className="min-w-0 flex-1 rounded border border-edge bg-panel px-2 py-1 font-mono text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
          />
        </div>

        {!ad ? (
          <p className="text-[11px] text-gray-500">The directory is unreachable, so membership cannot be resolved.</p>
        ) : !checkSam.trim() ? (
          <p className="text-[11px] text-gray-500">
            Enter a logon name to resolve their groups against this access list, nested groups and all.
          </p>
        ) : !candidate ? (
          <p className="text-[11px] text-amber-300">No account named {checkSam.trim()} in the directory.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-gray-300">{candidate.displayName}</span>
              <span className="font-mono text-[10px] text-gray-500">{candidate.department}</span>
              <span className={`ml-auto font-mono ${effective ? "text-emerald-300" : "text-danger"}`}>
                {effective ? SHARE_ACCESS_LABEL[effective] : "No access"}
              </span>
            </div>
            {why && <p className="text-[10px] leading-relaxed text-amber-300">{why}</p>}
            <p className="font-mono text-[9px] leading-relaxed text-gray-600">
              groups: {effectiveGroups(ad, candidate.samAccountName).join(", ") || "none"}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
