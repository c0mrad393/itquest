"use client";

/**
 * Global Settings — platform defaults, retention and integrations.
 *
 * ── EDITS STAGE, THEY DO NOT SAVE ───────────────────────────────────────────
 *
 * Every control here is live and every change is held locally, with the number
 * of unsaved edits stated plainly and Save reporting that the call was not
 * sent. A settings screen is the easiest place in an admin panel to make
 * someone believe a change took effect, and the most damaging place to be
 * wrong about it — an operator who thinks retention is 30 days when it is 90
 * has made a compliance decision on a lie.
 *
 * ── NO SECRET REACHES THIS SCREEN ───────────────────────────────────────────
 *
 * The API credential is shown MASKED and there is no field that accepts one.
 * A panel that renders a live key is a panel that leaks one over a shoulder,
 * and a panel that takes one by paste is a panel that logs one.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo, useState } from "react";
import {
  ActionLog,
  AdminPage,
  Card,
  MockBanner,
  Pill,
  useActionLog,
} from "@/components/admin/AdminShell";
import { PLATFORM_SETTINGS, SCENARIO_PACKS, inDays, type PlatformSettings } from "@/lib/admin/mock-data";

const FLOORS: PlatformSettings["difficultyFloor"][] = ["Tier_1_Easy", "Tier_2_Medium", "Tier_3_Hard"];
const RETENTIONS = [30, 90, 180, 365];

/** A labelled row. One shape for every control on the page. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge/60 py-3 last:border-0">
      <div className="min-w-0 max-w-sm">
        <div className="text-[12.5px] text-gray-200">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`h-5 w-9 rounded-full p-0.5 transition-colors ${on ? "bg-accent" : "bg-gray-500/40"}`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-surface transition-transform ${on ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

const selectClass =
  "h-7 rounded border border-edge bg-surface px-2 text-[12px] text-gray-200 outline-none focus:border-info/50";

export default function GlobalSettings() {
  const [draft, setDraft] = useState<PlatformSettings>(PLATFORM_SETTINGS);
  const [armedRotate, setArmedRotate] = useState(false);
  const { lines, record, recordCall } = useActionLog();

  const set = <K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  /** Which fields differ from what the platform currently holds. */
  const dirty = useMemo(
    () =>
      (Object.keys(draft) as (keyof PlatformSettings)[]).filter((k) => draft[k] !== PLATFORM_SETTINGS[k]),
    [draft],
  );

  function save() {
    if (dirty.length === 0) return;
    recordCall(`Save settings — ${dirty.length} field${dirty.length === 1 ? "" : "s"} changed: ${dirty.join(", ")}`);
  }

  function revert() {
    setDraft(PLATFORM_SETTINGS);
    record("Reverted the form to the platform's current values");
  }

  function rotateKey() {
    if (!armedRotate) {
      setArmedRotate(true);
      record("API key rotation requested — click again to confirm (every integration using it stops)");
      window.setTimeout(() => setArmedRotate(false), 4000);
      return;
    }
    setArmedRotate(false);
    recordCall("Rotate API credential");
  }

  return (
    <AdminPage
      title="Global Settings"
      blurb="Platform defaults, retention and integrations."
      actions={
        <div className="flex items-center gap-2">
          {dirty.length > 0 && (
            <Pill tone="warn">
              {dirty.length} unsaved change{dirty.length === 1 ? "" : "s"}
            </Pill>
          )}
          <button
            onClick={revert}
            disabled={dirty.length === 0}
            className="rounded border border-edge px-2 py-1 text-[11.5px] text-gray-400 transition hover:bg-panelalt disabled:cursor-not-allowed disabled:opacity-40"
          >
            Revert
          </button>
          <button
            onClick={save}
            disabled={dirty.length === 0}
            className="rounded bg-brand-fill px-2.5 py-1 text-[11.5px] font-semibold text-brand-on transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-gray-500"
          >
            Save changes
          </button>
        </div>
      }
    >
      <MockBanner />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card title="Scenario defaults" subtitle="What a new cohort starts with" bodyClassName="px-4 py-1">
            <Row label="Default scenario pack" hint="Assigned to a cohort that has not chosen one.">
              <select
                value={draft.defaultPack}
                onChange={(e) => set("defaultPack", e.target.value)}
                aria-label="Default scenario pack"
                className={selectClass}
              >
                {SCENARIO_PACKS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Row>
            <Row
              label="Difficulty floor"
              hint="Nothing below this tier is offered to a new starter, whatever their level."
            >
              <select
                value={draft.difficultyFloor}
                onChange={(e) => set("difficultyFloor", e.target.value as PlatformSettings["difficultyFloor"])}
                aria-label="Difficulty floor"
                className={selectClass}
              >
                {FLOORS.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Open self-signup" hint="Anyone with an email on a verified domain can create an account.">
              <Toggle on={draft.allowSelfSignup} onChange={(v) => set("allowSelfSignup", v)} label="Open self-signup" />
            </Row>
          </Card>

          <Card title="Data" subtitle="Retention and export" bodyClassName="px-4 py-1">
            <Row
              label="Run history retention"
              hint="How long completed runs are kept before they are purged. Shorter is cheaper and less useful to an instructor."
            >
              <select
                value={draft.retentionDays}
                onChange={(e) => set("retentionDays", Number(e.target.value))}
                aria-label="Run history retention"
                className={selectClass}
              >
                {RETENTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Export format" hint="What a cohort export downloads as.">
              <select
                value={draft.exportFormat}
                onChange={(e) => set("exportFormat", e.target.value as PlatformSettings["exportFormat"])}
                aria-label="Export format"
                className={selectClass}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </Row>
          </Card>

          <Card title="Integrations" subtitle="Identity, hooks and credentials" bodyClassName="px-4 py-1">
            <Row label="Single sign-on" hint="Institutions generally require this before a pilot becomes a contract.">
              <select
                value={draft.ssoProvider}
                onChange={(e) => set("ssoProvider", e.target.value as PlatformSettings["ssoProvider"])}
                aria-label="Single sign-on provider"
                className={selectClass}
              >
                <option value="none">Off</option>
                <option value="saml">SAML 2.0</option>
                <option value="oidc">OIDC</option>
              </select>
            </Row>
            {draft.ssoProvider !== "none" && (
              <Row label="SSO domain" hint="Accounts on this domain are routed to the identity provider.">
                <input
                  value={draft.ssoDomain}
                  onChange={(e) => set("ssoDomain", e.target.value)}
                  aria-label="SSO domain"
                  className={`${selectClass} w-56 font-mono`}
                />
              </Row>
            )}
            <Row label="Webhook endpoint" hint="Run completions and ticket events are posted here.">
              <input
                value={draft.webhookUrl}
                onChange={(e) => set("webhookUrl", e.target.value)}
                aria-label="Webhook endpoint"
                className={`${selectClass} w-72 font-mono`}
              />
            </Row>
            {/*
              Masked, and read-only. There is deliberately no input that takes a
              credential: a field that accepts one is a field that ends up in a
              log, and a value that renders is a value that gets photographed.
            */}
            <Row
              label="API credential"
              hint={`Shown masked and never sent to the browser in full. Last rotated ${inDays(draft.apiKeyRotatedAt)}.`}
            >
              <div className="flex items-center gap-2">
                <code className="rounded border border-edge bg-surface-2 px-2 py-1 font-mono text-[11px] text-gray-400">
                  {draft.apiKeyMasked}
                </code>
                <button
                  onClick={rotateKey}
                  className={`rounded border px-2 py-1 text-[11.5px] transition ${
                    armedRotate
                      ? "border-danger/60 bg-danger/15 text-danger-strong"
                      : "border-edge text-gray-300 hover:bg-panelalt"
                  }`}
                >
                  {armedRotate ? "Confirm rotate" : "Rotate"}
                </button>
              </div>
            </Row>
          </Card>
        </div>

        <ActionLog lines={lines} />
      </div>
    </AdminPage>
  );
}
