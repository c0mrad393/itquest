"use client";

/**
 * Centralized Fleet Policies console (v0.8.0)
 * ===========================================
 * Three panes, the way a policy management console has to be laid out: the
 * container tree on the left (domain root, then organizational units), the
 * policies linked to the selected container in the middle, and the settings
 * of the selected policy on the right.
 *
 * THE PANEL THAT MATTERS is "Resulting settings". Listing what a policy
 * CONTAINS is easy and teaches nothing; what an operator actually needs is
 * what is in force on this container and WHICH policy supplied it — because
 * the answer is routinely not the one they just edited. Every row names its
 * winner, and enforced rows say so.
 *
 * Classic sysadmin aesthetic: dense rows, hairline borders, monospace values,
 * no rounded cards. SVG and CSS indicators only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import {
  CFP,
  CFP_OBJECT,
  DOMAIN_ROOT,
  POLICY_KEYS,
  explainAbsence,
  linksFor,
  policyKeyMeta,
  resolvePolicies,
  type FleetPolicy,
  type PolicyKey,
  type PolicyValue,
} from "@/lib/core";
import { IconAlert, IconCheck, IconLock, IconPlus, IconX } from "@/components/ui/icons";

export default function FleetPolicies() {
  const infra = useInfraStore((s) => s.infra);
  const create = useInfraStore((s) => s.cfpCreatePolicy);
  const setSetting = useInfraStore((s) => s.cfpSetSetting);
  const setLink = useInfraStore((s) => s.cfpSetLink);
  const unlink = useInfraStore((s) => s.cfpUnlink);
  const setEnabled = useInfraStore((s) => s.cfpSetPolicyEnabled);
  const del = useInfraStore((s) => s.cfpDeletePolicy);
  const setBlock = useInfraStore((s) => s.cfpSetBlockInheritance);

  const [container, setContainer] = useState<string>(DOMAIN_ROOT);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const dc = Object.values(infra.nodes).find((n) => n.os === "windows" && !!n.activeDirectory);
  const ad = dc?.os === "windows" ? dc.activeDirectory : undefined;
  const state = infra.policy;

  const containers = useMemo(
    () => [
      { dn: DOMAIN_ROOT, label: ad?.netbios ?? "DOMAIN", depth: 0 },
      ...(ad?.ous ?? []).map((o) => ({
        dn: o.dn,
        label: o.name,
        depth: o.parentDn ? 2 : 1,
      })),
    ],
    [ad],
  );

  const linked = linksFor(state, container);
  const selected = state.policies.find((p) => p.id === policyId) ?? linked[0] ?? state.policies[0] ?? null;
  const resolved = useMemo(
    () => (container === DOMAIN_ROOT ? resolvePolicies(state, "") : resolvePolicies(state, container)),
    [state, container],
  );
  const blocked = state.blockedOus.includes(container);

  return (
    <div className="flex h-full flex-col bg-surface text-gray-200">
      {/* Ribbon */}
      <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-surface-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-gray-100">{CFP}</span>
        <span className="font-mono text-[9px] text-gray-500">
          {state.policies.length} objects · {state.blockedOus.length} blocking
        </span>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${CFP_OBJECT.toLowerCase()} name…`}
          className="ml-auto w-56 border border-edge bg-sunken px-2 py-1 text-[11px] outline-none placeholder:text-gray-600 focus:border-info"
        />
        <button
          onClick={() => {
            const err = create(newName);
            setNotice(err);
            if (!err) setNewName("");
          }}
          disabled={!newName.trim()}
          className="flex items-center gap-1 border border-edge bg-surface-3 px-2 py-1 text-[11px] text-gray-100 hover:bg-surface-3 disabled:text-gray-600"
        >
          <IconPlus size={11} /> New
        </button>
      </div>

      {notice && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-600/40 bg-amber-600/10 px-3 py-1 text-[11px] text-amber-200">
          <IconAlert size={11} />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><IconX size={10} /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Container tree ─────────────────────────────────────────────── */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-edge bg-surface-2">
          <div className="border-b border-edge px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
            Containers
          </div>
          {containers.map((c) => {
            const isBlocked = state.blockedOus.includes(c.dn);
            const count = linksFor(state, c.dn).length;
            return (
              <button
                key={c.dn}
                onClick={() => setContainer(c.dn)}
                className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] ${
                  container === c.dn ? "bg-info/20 text-gray-100" : "text-gray-400 hover:bg-gray-500/10"
                }`}
                style={{ paddingLeft: 8 + c.depth * 12 }}
              >
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {isBlocked && <IconLock size={9} className="shrink-0 text-amber-400" />}
                {count > 0 && <span className="shrink-0 font-mono text-[9px] text-gray-600">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Links on this container + resulting settings ───────────────── */}
        <div className="flex w-[20rem] shrink-0 flex-col border-r border-edge">
          <div className="flex items-center gap-1.5 border-b border-edge px-2 py-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Linked here</span>
            {container !== DOMAIN_ROOT && (
              <label className="ml-auto flex cursor-pointer items-center gap-1 text-[9px] text-gray-400">
                <input
                  type="checkbox"
                  checked={blocked}
                  onChange={(e) => setBlock(container, e.target.checked)}
                  className="h-2.5 w-2.5 accent-amber-500"
                />
                Block inheritance
              </label>
            )}
          </div>

          <div className="max-h-48 shrink-0 overflow-y-auto border-b border-edge">
            {linked.length === 0 && (
              <p className="px-2 py-2 text-[10px] leading-relaxed text-gray-600">
                Nothing linked here. Select a {CFP_OBJECT.toLowerCase()} on the right and link it.
              </p>
            )}
            {linked.map((p) => {
              const link = p.links.find((l) => l.target === container)!;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 border-b border-edge/40 px-2 py-1 text-[11px] ${
                    selected?.id === p.id ? "bg-info/10" : ""
                  }`}
                >
                  <button onClick={() => setPolicyId(p.id)} className="min-w-0 flex-1 truncate text-left text-gray-100">
                    {p.name}
                  </button>
                  <button
                    onClick={() => setLink(p.id, container, { enforced: !link.enforced })}
                    title="Enforced links survive blocked inheritance and beat closer links"
                    className={`shrink-0 px-1 font-mono text-[9px] ${
                      link.enforced ? "text-amber-300" : "text-gray-600 hover:text-gray-300"
                    }`}
                  >
                    ENF
                  </button>
                  <button
                    onClick={() => unlink(p.id, container)}
                    aria-label="Unlink"
                    className="shrink-0 text-gray-600 hover:text-danger"
                  >
                    <IconX size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* THE panel: what is actually in force here, and who won. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-edge px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
              Resulting settings
            </div>
            {resolved.size === 0 && (
              <p className="px-2 py-2 text-[10px] text-gray-600">Nothing applies to this container.</p>
            )}
            {[...resolved.values()].map((a) => (
              <div key={a.key} className="border-b border-edge/40 px-2 py-1">
                <div className="flex items-baseline gap-2 text-[10px]">
                  <span className="min-w-0 flex-1 truncate text-gray-300">{policyKeyMeta(a.key).label}</span>
                  <span className="shrink-0 font-mono text-info">{String(a.value)}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-gray-600">
                  <span className="min-w-0 truncate">via {a.policyName}</span>
                  {a.enforced && <span className="shrink-0 font-mono text-amber-400">enforced</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Policy detail ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!selected ? (
            <p className="p-4 text-[11px] text-gray-500">
              No {CFP_OBJECT.toLowerCase()} objects yet. Create one above.
            </p>
          ) : (
            <PolicyDetail
              key={selected.id}
              policy={selected}
              container={container}
              linkedHere={selected.links.some((l) => l.target === container)}
              onSet={(k, v) => setSetting(selected.id, k, v)}
              onLink={() => setLink(selected.id, container, {})}
              onToggleEnabled={() => setEnabled(selected.id, !selected.enabled)}
              onDelete={() => { del(selected.id); setPolicyId(null); }}
              absence={(k) => explainAbsence(state, container === DOMAIN_ROOT ? "" : container, k)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail pane ─────────────────────────────────────────────────────────────

function PolicyDetail({
  policy,
  container,
  linkedHere,
  onSet,
  onLink,
  onToggleEnabled,
  onDelete,
  absence,
}: {
  policy: FleetPolicy;
  container: string;
  linkedHere: boolean;
  onSet: (key: PolicyKey, value: PolicyValue | undefined) => void;
  onLink: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  absence: (key: PolicyKey) => string | null;
}) {
  const categories = [...new Set(POLICY_KEYS.map((k) => k.category))];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-gray-100">{policy.name}</span>
        {!policy.enabled && (
          <span className="bg-gray-600/30 px-1.5 py-0.5 font-mono text-[9px] text-gray-400">DISABLED</span>
        )}
        <span className="font-mono text-[9px] text-gray-600">
          {policy.links.length} link{policy.links.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex gap-1.5">
          {!linkedHere && (
            <button
              onClick={onLink}
              className="border border-edge bg-surface-3 px-2 py-0.5 text-[10px] text-gray-100 hover:bg-surface-3"
            >
              Link here
            </button>
          )}
          <button
            onClick={onToggleEnabled}
            className="border border-edge bg-surface-3 px-2 py-0.5 text-[10px] text-gray-100 hover:bg-surface-3"
          >
            {policy.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={onDelete}
            className="border border-danger/40 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        </div>
      </div>

      {policy.description && (
        <p className="border-b border-edge/60 px-3 py-1.5 text-[10px] text-gray-500">{policy.description}</p>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <div className="border-b border-edge/60 bg-surface-2/60 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
            {cat}
          </div>
          {POLICY_KEYS.filter((k) => k.category === cat).map((meta) => {
            const value = policy.settings[meta.key];
            const configured = value !== undefined;
            const why = configured ? absence(meta.key) : null;
            return (
              <div key={meta.key} className="border-b border-edge/40 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSet(meta.key, configured ? undefined : meta.fallback)}
                    aria-label={configured ? `Remove ${meta.label}` : `Configure ${meta.label}`}
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
                      configured ? "border-info bg-info/20 text-info" : "border-gray-600 hover:border-info"
                    }`}
                  >
                    {configured && <IconCheck size={9} />}
                  </button>
                  <span className={`min-w-0 flex-1 truncate text-[11px] ${configured ? "text-gray-100" : "text-gray-500"}`}>
                    {meta.label}
                  </span>
                  {configured && meta.kind === "boolean" && (
                    <select
                      value={String(value)}
                      onChange={(e) => onSet(meta.key, e.target.value === "true")}
                      className="shrink-0 border border-edge bg-sunken px-1 py-0.5 font-mono text-[10px] text-gray-200"
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  )}
                  {configured && meta.kind === "number" && (
                    <input
                      type="number"
                      value={Number(value)}
                      onChange={(e) => onSet(meta.key, Number(e.target.value))}
                      className="w-20 shrink-0 border border-edge bg-sunken px-1 py-0.5 text-right font-mono text-[10px] text-gray-200"
                    />
                  )}
                  {configured && meta.kind === "text" && (
                    <input
                      value={String(value)}
                      onChange={(e) => onSet(meta.key, e.target.value)}
                      placeholder="\\\\fs01\\Share"
                      className="w-44 shrink-0 border border-edge bg-sunken px-1 py-0.5 font-mono text-[10px] text-gray-200 placeholder:text-gray-700"
                    />
                  )}
                </div>
                <p className="mt-0.5 pl-5 text-[9px] leading-relaxed text-gray-600">{meta.hint}</p>
                {/* The console explaining why an edit did nothing — the single
                    most useful thing a policy tool can say. */}
                {why && <p className="mt-0.5 pl-5 text-[9px] leading-relaxed text-amber-400">{why}</p>}
              </div>
            );
          })}
        </div>
      ))}

      <p className="px-3 py-2 text-[9px] leading-relaxed text-gray-600">
        Closest container wins, except where a link is enforced — an enforced link survives blocked inheritance and
        beats anything nearer the account. Selected container: {container === DOMAIN_ROOT ? "domain root" : container}.
      </p>
    </div>
  );
}
