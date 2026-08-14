"use client";

/**
 * EDS — New account (v0.9.1)
 * ==========================
 * The store has had `edsCreateUser` since v0.8.0 with no way to reach it: every
 * onboarding ticket had to be solved by editing an account that already
 * existed. This is the missing form, and it is built as the reference example
 * of the release's form rules.
 *
 * WHAT IS VISIBLE BY DEFAULT — four fields. First name, last name, department,
 * job title. That is genuinely everything required to create a working
 * account, and a beginner handed an onboarding ticket can complete it without
 * once wondering what a UPN is.
 *
 * WHAT IS BEHIND "ADVANCED" — manager, extra security groups, and the
 * temporary password. All three have correct defaults: no manager set, Domain
 * Users only, and a generated password. Every one of them can be skipped and
 * the account still comes out right, which is the ONLY test for whether
 * something may be hidden. Nothing required is behind the toggle.
 *
 * WHAT THE FORM SHOWS THAT THE OPERATOR DID NOT TYPE — the login name it is
 * about to generate. The store derives it from the names and suffixes on
 * collision, and a provisioning form that conceals the identifier it is
 * creating teaches the wrong model of how directories work.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { EDS_SHORT } from "@/lib/core";
import Disclosure from "@/components/ui/Disclosure";
import { Term } from "@/components/ui/Tooltip";
import { IconAlert, IconCheck, IconX } from "@/components/ui/icons";

export default function NewUserForm({ onDone }: { onDone: () => void }) {
  const infra = useInfraStore((s) => s.infra);
  const create = useInfraStore((s) => s.edsCreateUser);

  const dc = Object.values(infra.nodes).find((n) => n.os === "windows" && !!n.activeDirectory);
  const ad = dc?.os === "windows" ? dc.activeDirectory : undefined;

  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [department, setDept] = useState("");
  const [title, setTitle] = useState("");
  const [manager, setManager] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const departments = ad?.ous.map((o) => o.name) ?? [];
  const allGroups = ad?.groups?.map((g) => g.name).filter((n) => n !== "Domain Users") ?? [];

  /** Mirrors the store's own derivation so the preview cannot drift from it. */
  const previewSam = useMemo(() => {
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f || !l) return null;
    const stem = `${f[0]}.${l}`.toLowerCase().replace(/[^a-z.]/g, "");
    const taken = new Set(ad?.users.map((u) => u.samAccountName) ?? []);
    let sam = stem;
    for (let n = 2; taken.has(sam); n++) sam = `${stem}${n}`;
    return sam;
  }, [firstName, lastName, ad]);

  const ready = !!firstName.trim() && !!lastName.trim() && !!department && !!title.trim();

  function submit() {
    setError(null);
    const err = create({
      firstName,
      lastName,
      department,
      title,
      manager: manager || undefined,
      groups: groups.length ? groups : undefined,
      tempPassword: tempPassword || undefined,
    });
    if (err) {
      setError(err);
      return;
    }
    setCreated(previewSam);
  }

  if (created) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent-strong">
            <IconCheck size={20} />
          </span>
          <h3 className="text-[14px] font-semibold text-gray-100">Account created</h3>
          <p className="max-w-[38ch] text-[12px] leading-relaxed text-gray-400">
            <span className="font-mono text-gray-200">{created}</span> can sign in now. It is in{" "}
            <span className="text-gray-200">{department}</span> and inherits every policy linked
            there.
          </p>
        </div>
        <div className="form-footer">
          <button className="btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-gray-500">
          Creates an account in {EDS_SHORT}. The four fields below are all that is required —
          everything else has a working default.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="field-label">First name</span>
            <input className="field" value={firstName} onChange={(e) => setFirst(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="field-label">Last name</span>
            <input className="field" value={lastName} onChange={(e) => setLast(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="field-label">
            Department <span className="text-gray-600">— decides which <Term k="ou" /> it lands in</span>
          </span>
          <select className="field" value={department} onChange={(e) => setDept(e.target.value)}>
            <option value="">Select a department…</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Job title</span>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Support Analyst" />
        </label>

        {/* The identifier the operator did not type, shown before they commit. */}
        <div className="rounded-md border border-edge bg-surface-2 px-2.5 py-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-600">
            <Term k="samaccountname">Login name</Term>
          </span>
          <div className="font-mono text-[12px] text-gray-100">
            {previewSam ?? <span className="text-gray-600">enter a name…</span>}
          </div>
          {previewSam && ad && previewSam !== `${firstName.trim()[0]}.${lastName.trim()}`.toLowerCase() && (
            <p className="mt-1 text-[10px] leading-snug text-warn-strong">
              That name is already taken, so a number was appended.
            </p>
          )}
        </div>

        <Disclosure summary="Manager, groups, temporary password — all optional">
          <label className="block">
            <span className="field-label">Manager</span>
            <select className="field" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="">No manager set</option>
              {(ad?.users ?? []).map((u) => (
                <option key={u.samAccountName} value={u.samAccountName}>
                  {u.displayName} · {u.title}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Used by approval workflows. Onboarding tickets usually name one.
            </span>
          </label>

          <div>
            <span className="field-label">
              Additional <Term k="securitygroup">security groups</Term>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {allGroups.length === 0 && (
                <span className="text-[11px] text-gray-600">No optional groups in this directory.</span>
              )}
              {allGroups.map((g) => {
                const on = groups.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setGroups((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]))
                    }
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                      on
                        ? "border-brand-fill bg-brand-soft/20 text-brand-text"
                        : "border-edge text-gray-400 hover:border-edge-strong hover:text-gray-200"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            <span className="field-hint">Every account joins Domain Users automatically.</span>
          </div>

          <label className="block">
            <span className="field-label">Temporary password</span>
            <input
              className="field font-mono"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Generated if left blank"
            />
            <span className="field-hint">The account must change it at first sign-in either way.</span>
          </label>
        </Disclosure>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] text-danger-strong">
            <IconAlert size={12} className="mt-px shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss"><IconX size={10} /></button>
          </div>
        )}
      </div>

      {/* Bottom-right, cancel before confirm — the standard for every form. */}
      <div className="form-footer">
        {!ready && <span className="footer-note">Fill the four fields above to continue.</span>}
        <button className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit} disabled={!ready}>
          Create account
        </button>
      </div>
    </div>
  );
}
