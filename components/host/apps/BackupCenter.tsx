"use client";

/**
 * Backup & Recovery (DR build)
 * ============================
 * The panel whose whole job is to be boring on every day except one.
 *
 * ── WHY THE INCIDENT BANNER IS AT THE TOP ───────────────────────────────────
 *
 * When there is no incident this app is a configuration screen and the banner
 * is absent. When there IS one, the operator arriving here has minutes, not
 * hours, and the thing they need is not the capacity bar — it is the single
 * next correct action in a three-step sequence they may only have read about.
 * So the recovery status takes the top of the panel and names the step, and
 * the configuration everyone spends their quiet days on moves below it.
 *
 * ── WHY THE RESTORE BUTTON WARNS BEFORE IT REFUSES ──────────────────────────
 *
 * `restoreAvailability` distinguishes a restore that CANNOT run from one that
 * would destroy the data by running. That distinction is the reason this
 * screen exists, so it is surfaced before the click rather than reported after
 * it: a destructive attempt gets a confirmation naming the consequence in
 * plain words, and a merely-impossible one gets a disabled button and a reason.
 *
 * Semantic tokens throughout, both themes, AA. SVG icons only — no emoji.
 */

import { useMemo, useState } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import {
  SAFETY_META,
  SCHEDULE_META,
  STAGE_META,
  STORAGE_TIERS,
  capacityOf,
  isIsolated,
  isolationMethod,
  recoveryStatus,
  restoreAvailability,
  safetyOf,
  tierById,
  type BackupSchedule,
  type NodeId,
  type StorageTierId,
} from "@/lib/core";
import { AppHeader, CountPill } from "./AppChrome";
import EmptyState from "@/components/ui/EmptyState";
import { Term } from "@/components/ui/Tooltip";
import Disclosure from "@/components/ui/Disclosure";
import {
  IconAlert,
  IconCheck,
  IconDisk,
  IconLock,
  IconRecycle,
  IconShield,
} from "@/components/ui/icons";

const SCHEDULES: BackupSchedule[] = ["off", "daily", "weekly"];

export default function BackupCenter() {
  const infra = useInfraStore((s) => s.infra);
  const budget = useHostStore((s) => s.host.user.budget);
  const spend = useHostStore((s) => s.spendBudget);
  const setTier = useInfraStore((s) => s.backupSetTier);
  const setSchedule = useInfraStore((s) => s.backupSetSchedule);
  const runNow = useInfraStore((s) => s.backupRunNow);
  const restore = useInfraStore((s) => s.backupRestore);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const cap = useMemo(() => capacityOf(infra), [infra]);
  const safety = useMemo(() => safetyOf(infra), [infra]);
  const recovery = useMemo(() => recoveryStatus(infra), [infra]);

  const protectedCount = safety.filter((s) => s.status === "protected").length;

  function buy(tierId: StorageTierId) {
    const tier = tierById(tierId);
    const current = tierById(infra.backup.tier);
    if (tierId === infra.backup.tier) return;

    // Only the DIFFERENCE is charged when upgrading — a player who already
    // paid for 8TB should not pay for it twice to reach 24TB, and charging
    // full price for an upgrade would push everyone toward buying once and
    // never revisiting the decision.
    const owed = Math.max(0, tier.priceCr - current.priceCr);
    if (owed > 0 && !spend(owed)) {
      setNotice({ ok: false, text: `Not enough budget — ${tier.label} needs ${owed} Cr and you have ${budget} Cr.` });
      return;
    }
    setTier(tierId);
    setNotice({
      ok: true,
      text: owed > 0 ? `${tier.label} purchased for ${owed} Cr.` : `Switched to ${tier.label}.`,
    });
  }

  return (
    <div className="flex h-full flex-col bg-panel text-gray-200">
      <AppHeader iconId="shield" title="Backup & Recovery" subtitle="Data protection and disaster recovery">
        <CountPill label="protected" value={protectedCount} />
        <span className="font-mono text-[11px] text-gray-400">{budget.toLocaleString()} Cr</span>
      </AppHeader>

      {notice && (
        <div
          className={`flex shrink-0 items-start gap-2 border-b px-4 py-1.5 text-[11px] ${
            notice.ok
              ? "border-accent/30 bg-accent/[0.07] text-accent-strong"
              : "border-danger/40 bg-danger/[0.07] text-danger-strong"
          }`}
        >
          {notice.ok ? <IconCheck size={12} className="mt-0.5 shrink-0" /> : <IconAlert size={12} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-gray-500 hover:text-gray-200">
            dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {recovery.stage !== "clean" && <IncidentBanner recovery={recovery} />}

        <StorageSection cap={cap} onBuy={buy} budget={budget} currentTier={infra.backup.tier} />

        {/* ── Protected hosts ─────────────────────────────────────────────── */}
        <section className="mb-3 rounded-lg border border-edge bg-surface">
          <div className="card-header">
            <IconShield size={13} className="text-brand-text" />
            <h3 className="text-[12px] font-semibold text-gray-100">Protected hosts</h3>
            <button
              onClick={() => {
                const r = runNow();
                setNotice(
                  r.failed > 0
                    ? { ok: false, text: `${r.failed} job${r.failed === 1 ? "" : "s"} failed — check storage capacity.` }
                    : { ok: true, text: `${r.ok} backup job${r.ok === 1 ? "" : "s"} completed.` },
                );
              }}
              className="btn-secondary btn-sm ml-auto"
            >
              Run all jobs now
            </button>
          </div>

          {safety.length === 0 ? (
            <EmptyState
              compact
              icon={<IconShield size={16} />}
              title="Nothing here needs protecting yet"
              body="Domain controllers, databases and file servers appear here as the estate grows."
            />
          ) : (
            <div>
              {safety.map((row) => (
                <HostRow
                  key={row.nodeId}
                  row={row}
                  onSchedule={(sched) => setSchedule(row.nodeId, sched)}
                  onRestore={() => {
                    const err = restore(row.nodeId);
                    setNotice(err ? { ok: false, text: err } : { ok: true, text: `${row.hostname} restored from backup.` });
                    if (!err) {
                      useNotificationStore.getState().push({
                        kind: "success",
                        title: "Restore complete",
                        body: `${row.hostname} is back from its last good copy.`,
                      });
                    }
                  }}
                  infra={infra}
                />
              ))}
            </div>
          )}
        </section>

        {infra.backup.log.length > 0 && (
          <Disclosure label="Restore history" summary={`${infra.backup.log.length} attempts`}>
            <div className="-mx-1">
              {infra.backup.log.slice(0, 12).map((e) => (
                <div key={e.id} className="flex items-start gap-2 border-b border-edge/40 px-1 py-1 last:border-0">
                  <span className={`mt-0.5 shrink-0 ${e.ok ? "text-accent-strong" : "text-danger-strong"}`}>
                    {e.ok ? <IconCheck size={10} /> : <IconAlert size={10} />}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-gray-300">
                    <span className="font-mono text-gray-200">{e.nodeId}</span> — {e.detail}
                  </span>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </div>
    </div>
  );
}

// ── Incident ────────────────────────────────────────────────────────────────

function IncidentBanner({ recovery }: { recovery: ReturnType<typeof recoveryStatus> }) {
  const meta = STAGE_META[recovery.stage];
  const tone =
    meta.tone === "bad"
      ? "border-danger/50 bg-danger/[0.09]"
      : meta.tone === "warn"
        ? "border-warn/50 bg-warn/[0.09]"
        : "border-accent/40 bg-accent/[0.07]";

  return (
    <section className={`mb-3 rounded-lg border p-3 ${tone}`}>
      <div className="mb-1 flex items-center gap-2">
        <IconLock size={13} className={meta.tone === "bad" ? "text-danger-strong" : "text-warn-strong"} />
        <h3 className="text-[12px] font-semibold text-gray-100">Ransomware incident</h3>
        <span
          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            meta.tone === "bad"
              ? "bg-danger/20 text-danger-strong"
              : meta.tone === "warn"
                ? "bg-warn/20 text-warn-strong"
                : "bg-accent/20 text-accent-strong"
          }`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mb-1.5 font-mono text-[10px] text-gray-400">
        patient zero: {recovery.patientZero ?? "unknown"} · {recovery.compromisedCount} host
        {recovery.compromisedCount === 1 ? "" : "s"} compromised ·{" "}
        {recovery.encryptedShareIds.length} share{recovery.encryptedShareIds.length === 1 ? "" : "s"} encrypted
      </div>

      {/* THE ONE NEXT ACTION. Not a checklist of three — a checklist invites
          the operator to pick one, and picking the wrong one here is what
          destroys the data. */}
      {recovery.nextAction ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-gray-200">
          <IconAlert size={12} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Next: </span>
            {recovery.nextAction}
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-accent-strong">
          <IconCheck size={12} className="mt-0.5 shrink-0" />
          Every compromised host has been wiped and restored. The incident is closed.
        </p>
      )}
    </section>
  );
}

// ── Storage ─────────────────────────────────────────────────────────────────

function StorageSection({
  cap,
  onBuy,
  budget,
  currentTier,
}: {
  cap: ReturnType<typeof capacityOf>;
  onBuy: (t: StorageTierId) => void;
  budget: number;
  currentTier: StorageTierId;
}) {
  const tone = cap.overCapacity ? "bg-danger" : cap.usedPct > 85 ? "bg-warn" : "bg-accent";
  return (
    <section className="mb-3 rounded-lg border border-edge bg-surface p-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <IconDisk size={12} className="text-brand-text" />
        <span className="text-[11px] font-semibold text-gray-100">Backup storage</span>
        <span className="ml-auto font-mono text-[11px] text-gray-200">
          {cap.usedGb} GB
          <span className="text-gray-500"> / {cap.capacityGb || "—"} GB</span>
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-500/20">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.min(100, cap.usedPct)}%` }}
        />
      </div>

      {cap.overCapacity ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger-strong">
          <IconAlert size={11} className="mt-px shrink-0" />
          <span>
            {cap.usedGb} GB is scheduled against {cap.capacityGb} GB of storage. Jobs are failing —
            buy a larger tier or take a host out of the schedule.
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-500">
          {cap.protectedCount} host{cap.protectedCount === 1 ? "" : "s"} scheduled ·{" "}
          {cap.freeGb} GB free.
        </p>
      )}

      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {STORAGE_TIERS.filter((t) => t.id !== "none").map((t) => {
          const owned = currentTier === t.id;
          const owed = Math.max(0, t.priceCr - tierById(currentTier).priceCr);
          const affordable = owed <= budget;
          return (
            <button
              key={t.id}
              onClick={() => onBuy(t.id)}
              disabled={owned || !affordable}
              className={`rounded-md border p-2 text-left transition ${
                owned
                  ? "border-brand-fill bg-brand-soft/15"
                  : affordable
                    ? "border-edge hover:border-edge-strong hover:bg-gray-500/10"
                    : "border-edge opacity-45"
              }`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium text-gray-100">{t.label}</span>
                {t.offsite && (
                  <span className="rounded bg-accent/20 px-1 py-px text-[9px] font-semibold text-accent-strong">
                    offsite
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-400">
                  {owned ? "owned" : owed === 0 ? "free" : `${owed} Cr`}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-gray-500">{t.blurb}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Host row ────────────────────────────────────────────────────────────────

function HostRow({
  row,
  onSchedule,
  onRestore,
  infra,
}: {
  row: ReturnType<typeof safetyOf>[number];
  onSchedule: (s: BackupSchedule) => void;
  onRestore: () => void;
  infra: ReturnType<typeof useInfraStore.getState>["infra"];
}) {
  const meta = SAFETY_META[row.status];
  const avail = restoreAvailability(infra, row.nodeId);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-b border-edge/50 px-3 py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-gray-100">{row.hostname}</span>
        <span
          className={
            meta.tone === "ok" ? "chip-ok" : meta.tone === "warn" ? "chip-warn" : "chip-bad"
          }
        >
          {meta.label}
        </span>
        {row.policy && row.policy.schedule !== "off" && (
          <span className="font-mono text-[10px] text-gray-500">{row.policy.sizeGb} GB</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {SCHEDULES.map((sched) => (
            <button
              key={sched}
              onClick={() => onSchedule(sched)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                (row.policy?.schedule ?? "off") === sched
                  ? "border-brand-fill bg-brand-soft/20 text-brand-text"
                  : "border-edge text-gray-400 hover:border-edge-strong hover:text-gray-200"
              }`}
            >
              {sched === "off" ? "Off" : SCHEDULE_META[sched].label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-[11px] leading-snug text-gray-500">{row.detail}</p>

      {/* Restore is only offered when this host is actually part of an
          incident — a restore button on a healthy server is an invitation to
          overwrite live data with an older copy. */}
      {infra.incident.compromised.some((c) => c.nodeId === row.nodeId) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[11px] font-medium text-danger-strong">
                {avail.reason} Restoring anyway loses this host&apos;s data permanently.
              </span>
              <button className="btn-secondary btn-sm ml-auto" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={() => { setConfirming(false); onRestore(); }}
              >
                Lose the data
              </button>
            </>
          ) : (
            <>
              {!avail.possible && (
                <span className="min-w-0 flex-1 text-[11px] text-warn-strong">{avail.reason}</span>
              )}
              <button
                className={avail.possible ? "btn-primary btn-sm ml-auto" : "btn-secondary btn-sm ml-auto"}
                onClick={() => (avail.destructive ? setConfirming(true) : onRestore())}
                disabled={!avail.possible && !avail.destructive}
              >
                <IconRecycle size={11} /> Restore
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
