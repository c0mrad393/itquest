"use client";

/**
 * ITQuest — Operations Dashboard (home)
 * ======================================
 * The screen the operator lands on. Three jobs, in this order:
 *
 *   1. Say whether the estate is FINE, in under a second and from across the
 *      room. That is the health ring and the two KPI cards beside it.
 *   2. Say what needs doing NEXT, specifically enough to act on.
 *   3. Get out of the way, into whichever app the answer lives in.
 *
 * ── EVERY NUMBER HERE IS DERIVED ────────────────────────────────────────────
 *
 * Nothing on this page is stored. Health, congestion, incident stage, the SLA
 * countdowns and the alert list are all computed from the same functions the
 * specialist panels read, so the dashboard cannot disagree with the app you
 * open from it. A "dashboardStats" slice caching these would be the fastest
 * way to make the home page lie.
 *
 * ── THE GLASS IS STRUCTURAL, NOT DECORATIVE ─────────────────────────────────
 *
 * `backdrop-blur` over the operator's own wallpaper is what makes this read as
 * the desktop's home surface rather than another opaque app window. The blur
 * sits on a translucent SURFACE token, never on a raw white or black, so the
 * contrast of everything on top of it is the same in both themes — measured,
 * not assumed. Text never sits directly on the blur: it sits on a token, and
 * the blur is behind that.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useHostStore } from "@/lib/host/store";
import { useEntitlements } from "@/lib/platform/entitlements";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { useTrafficOverrides } from "@/lib/host/devtools";
import { useNow } from "@/lib/sla/store";
import {
  HOST_APP_GROUPS,
  HOST_APP_REGISTRY,
  SATURATION_META,
  activeCascades,
  cascadeStatus,
  computeTraffic,
  estateHealth,
  recoveryStatus,
  visibleApps,
  type HostAppId,
} from "@/lib/core";
import { appUnlockLevel, isAppUnlocked } from "@/lib/progression/unlocks";
import { slaSnapshot } from "@/lib/host/ticket-ui";
import { AppIcon } from "@/components/ui/app-icons";
import {
  IconActivity,
  IconAlert,
  IconBolt,
  IconCheck,
  IconClock,
  IconLock,
  IconTicket,
} from "@/components/ui/icons";

export default function Dashboard() {
  const infra = useInfraStore((s) => s.infra);
  const overrides = useTrafficOverrides();
  const user = useHostStore((s) => s.host.user);
  const { atLevelCap } = useEntitlements();
  const openApp = useHostStore((s) => s.openApp);
  const tickets = useTicketStore((s) => s.tickets);
  const select = useTicketStore((s) => s.select);
  const notifications = useNotificationStore((s) => s.items);
  // Ticks once a second so the SLA countdowns move without this component
  // owning a timer of its own.
  const now = useNow();

  const traffic = useMemo(() => computeTraffic(infra, overrides), [infra, overrides]);
  const health = useMemo(() => estateHealth(infra, traffic), [infra, traffic]);
  const recovery = useMemo(() => recoveryStatus(infra), [infra]);
  const cascades = useMemo(() => activeCascades(infra), [infra]);

  const live = tickets.filter(
    (t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed",
  );
  const breaching = live.filter((t) => slaSnapshot(t, now).breached).length;

  const apps = useMemo(() => visibleApps(99), []);

  /*
   * THE NEXT ACTION, chosen by consequence rather than by recency.
   *
   * A ransomware incident outranks a cascade, which outranks a saturated link,
   * which outranks a breaching ticket. An operator who reads only the top line
   * of this page should still be working on the most expensive problem they
   * have — which is the entire argument for a dashboard over a ticket list.
   */
  const focus = useMemo(() => {
    if (recovery.stage !== "clean" && recovery.stage !== "restored" && recovery.nextAction) {
      return { tone: "bad" as const, label: "Ransomware incident", text: recovery.nextAction, app: recovery.nextApp ?? "backup" };
    }
    const c = cascades[0];
    if (c) {
      const st = cascadeStatus(infra, c);
      if (st.stage !== "resolved") {
        return { tone: "bad" as const, label: "Cascade failure", text: st.nextAction, app: st.nextApp };
      }
    }
    if (traffic.level === "saturated" || traffic.level === "congested") {
      const seg = [traffic.backbone, ...traffic.uplinks].sort((a, b) => b.loadPct - a.loadPct)[0];
      return {
        tone: "warn" as const,
        label: `Network ${SATURATION_META[traffic.level].label.toLowerCase()}`,
        text: `${seg.label} is carrying ${seg.offeredMbps} Mbps into ${seg.capacityMbps} Mbps of capacity. Everything sharing that link is slowed by it.`,
        app: "switches" as HostAppId,
      };
    }
    if (breaching > 0) {
      return {
        tone: "warn" as const,
        label: "SLA at risk",
        text: `${breaching} ticket${breaching === 1 ? " has" : "s have"} breached their resolution window. Work the oldest first.`,
        app: "itsm" as HostAppId,
      };
    }
    if (live.length > 0) {
      return {
        tone: "ok" as const,
        label: "Queue is moving",
        text: `${live.length} open request${live.length === 1 ? "" : "s"} and nothing on fire. Take them in order of severity.`,
        app: "itsm" as HostAppId,
      };
    }
    return {
      tone: "ok" as const,
      label: "All clear",
      text: "Nothing open and nothing degraded. New requests arrive on their own as the day goes on.",
      app: "itsm" as HostAppId,
    };
  }, [recovery, cascades, infra, traffic, breaching, live.length]);

  return (
    <div className="h-full overflow-y-auto bg-sunken/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl space-y-4 p-5">
        {/*
          ── The end of the chapter ──────────────────────────────────────

          Shown only at the plan's ceiling, and written as the next part of
          the story rather than as a limit. The company genuinely is about to
          grow — four new departments and a file server that has to carry them
          — so the honest sentence is an invitation, not a refusal. A wall that
          says "upgrade to continue" tells a player they were stopped; this
          tells them where they got to.
        */}
        {atLevelCap(user.level) && (
          <section className="rounded-lg border border-info/30 bg-info/[0.06] p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[13px] font-semibold text-gray-100">
                  You have taken {infra.clientOrg} as far as the first rack goes.
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-400">
                  Level {user.level} is where a service desk stops being the whole job. The business
                  is opening four new departments and needs a file server that can carry them —
                  organisational units, group-based shares, storage that does not run out. That is
                  the next chapter, and it runs past where this plan ends.
                </p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  Your experience keeps counting in the meantime. Nothing you do now is lost when
                  you carry on.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-info/40 px-2 py-1 text-[11px] font-semibold text-info">
                Pro
              </span>
            </div>
          </section>
        )}

        {/* ── Greeting ────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-gray-100">
              {greeting()}, {user.displayName.split(" ")[0]}
            </h1>
            <p className="mt-0.5 text-[12px] text-gray-500">
              {infra.clientOrg} · {user.role} · level {user.level}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-edge bg-surface/70 px-3 py-1.5 backdrop-blur">
            <IconBolt size={12} className="text-warn-strong" />
            <span className="font-mono text-[12px] text-gray-200">
              {user.budget.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-500">Cr</span>
          </div>
        </header>

        {/* ── KPI hero row ────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <HealthCard score={health.score} notes={health.notes} />
          <KpiCard
            icon={<IconTicket size={14} />}
            label="Active incidents"
            value={String(live.length)}
            sub={
              breaching > 0
                ? `${breaching} past its SLA`
                : live.length === 0
                  ? "Inbox zero"
                  : "All within SLA"
            }
            tone={breaching > 0 ? "bad" : live.length === 0 ? "ok" : "neutral"}
            onClick={() => openApp("itsm")}
          />
          <KpiCard
            icon={<IconActivity size={14} />}
            label="Network"
            value={SATURATION_META[traffic.level].label}
            sub={`${traffic.totalMbps} Mbps offered · ${traffic.backbone.capacityMbps} Mbps backbone`}
            tone={
              traffic.level === "saturated"
                ? "bad"
                : traffic.level === "congested"
                  ? "warn"
                  : "ok"
            }
            meterPct={Math.min(100, traffic.backbone.loadPct)}
            onClick={() => openApp("switches")}
          />
        </section>

        {/* ── The one next thing ──────────────────────────────────────── */}
        <FocusBanner focus={focus} onOpen={() => openApp(focus.app as HostAppId)} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          {/* ── Quick access ─────────────────────────────────────────── */}
          <section className="space-y-3">
            {HOST_APP_GROUPS.map((group) => {
              const inGroup = apps.filter((a) => a.group === group.id);
              if (!inGroup.length) return null;
              return (
                <div key={group.id}>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      {group.label}
                    </h2>
                    <span className="text-[11px] text-gray-600">{group.blurb}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {inGroup.map((a) => (
                      <AppTile
                        key={a.id}
                        id={a.id}
                        title={a.title}
                        iconId={a.iconId}
                        description={a.description}
                        level={user.level}
                        onOpen={() => openApp(a.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* ── Activity feed ────────────────────────────────────────── */}
          <aside className="space-y-3">
            <PriorityQueue
              tickets={live}
              now={now}
              onOpen={(id) => {
                select(id);
                openApp("itsm");
              }}
            />
            <ActivityFeed items={notifications} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Health ring ─────────────────────────────────────────────────────────────

/**
 * The score as a ring rather than a number.
 *
 * A number alone requires the reader to remember what "68" means. A ring that
 * is three-quarters full and amber does not — the shape carries the reading
 * and the number confirms it. The colour is a SECOND channel rather than the
 * only one, so it survives being printed, dimmed, or read by somebody who
 * cannot distinguish red from green.
 */
function HealthCard({ score, notes }: { score: number; notes: string[] }) {
  const tone = score >= 85 ? "ok" : score >= 60 ? "warn" : "bad";
  const stroke =
    tone === "ok" ? "rgb(var(--accent-base))" : tone === "warn" ? "rgb(var(--warn-base))" : "rgb(var(--danger-base))";
  const R = 30;
  const C = 2 * Math.PI * R;

  return (
    <div
      data-tutorial-target="dash-health"
      className="group relative overflow-hidden rounded-2xl border border-edge bg-surface/70 p-4 shadow-panel backdrop-blur-xl transition hover:border-edge-strong"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
            <circle cx="38" cy="38" r={R} fill="none" stroke="rgb(var(--g-500) / 0.2)" strokeWidth="7" />
            <circle
              cx="38" cy="38" r={R} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (C * Math.max(0, Math.min(100, score))) / 100}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[20px] font-semibold leading-none text-gray-100">{score}</span>
            <span className="text-[9px] uppercase tracking-wider text-gray-500">score</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            System health
          </div>
          {notes.length === 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-accent-strong">
              <IconCheck size={12} /> Everything is behaving.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {notes.slice(0, 3).map((n, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-400">
                  <IconAlert size={10} className="mt-0.5 shrink-0 text-warn-strong" />
                  <span className="min-w-0 flex-1">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, tone, meterPct, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  meterPct?: number;
  onClick: () => void;
}) {
  const accent =
    tone === "bad" ? "text-danger-strong" : tone === "warn" ? "text-warn-strong" : tone === "ok" ? "text-accent-strong" : "text-gray-100";
  const bar =
    tone === "bad" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent";

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-edge bg-surface/70 p-4 text-left shadow-panel backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-brand-fill/60 hover:shadow-lg focus-visible:border-brand-fill"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-gray-400 transition group-hover:bg-brand-soft/20 group-hover:text-brand-text">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
      </div>

      <div className={`mt-2 text-[26px] font-semibold leading-none tracking-tight ${accent}`}>
        {value}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500">{sub}</p>

      {meterPct != null && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-gray-500/20">
          <div
            className={`h-full rounded-full transition-all duration-700 ${bar}`}
            style={{ width: `${meterPct}%` }}
          />
        </div>
      )}
    </button>
  );
}

// ── Focus banner ────────────────────────────────────────────────────────────

function FocusBanner({
  focus, onOpen,
}: {
  focus: { tone: "ok" | "warn" | "bad"; label: string; text: string };
  onOpen: () => void;
}) {
  const ring =
    focus.tone === "bad"
      ? "border-danger/50 bg-danger/[0.07]"
      : focus.tone === "warn"
        ? "border-warn/50 bg-warn/[0.07]"
        : "border-edge bg-surface/70";

  return (
    <section className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-panel backdrop-blur-xl ${ring}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          focus.tone === "bad"
            ? "bg-danger/20 text-danger-strong"
            : focus.tone === "warn"
              ? "bg-warn/20 text-warn-strong"
              : "bg-accent/15 text-accent-strong"
        }`}
      >
        {focus.tone === "ok" ? <IconCheck size={16} /> : <IconAlert size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {focus.label}
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-gray-100">{focus.text}</p>
      </div>

      <button onClick={onOpen} className="btn-primary shrink-0">
        Take it on
      </button>
    </section>
  );
}

// ── App tiles ───────────────────────────────────────────────────────────────

/**
 * A tile that is honest about being locked.
 *
 * The locked state is DIMMER, not hidden, and names the level it needs. A
 * launcher that hides what you have not earned gives the operator no sense of
 * what the job becomes; one that shows a live-looking button and then refuses
 * is worse still. This is visibly unavailable and visually part of the set.
 */
function AppTile({
  id, title, iconId, description, level, onOpen,
}: {
  id: HostAppId;
  title: string;
  iconId: Parameters<typeof AppIcon>[0]["id"];
  description: string;
  level: number;
  onOpen: () => void;
}) {
  const unlocked = isAppUnlocked(id, level);
  const need = appUnlockLevel(id);

  if (!unlocked) {
    return (
      <div
        title={`${title} unlocks at level ${need}`}
        aria-label={`${title}, locked until level ${need}`}
        className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-dashed border-edge bg-surface/30 px-3 py-2.5 backdrop-blur"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3/60 text-gray-600">
          <IconLock size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-gray-500">{title}</span>
          <span className="block text-[10px] text-gray-600">Unlocks at level {need}</span>
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={onOpen}
      title={description}
      // One attribute here gives the tutorial a handle on EVERY app tile
      // (`app-tile-itsm`, `app-tile-hardwarelab`, …) rather than needing a
      // hand-placed marker per app that someone has to remember to add when
      // the next app ships.
      data-tutorial-target={`app-tile-${id}`}
      className="group flex items-center gap-2.5 rounded-xl border border-edge bg-surface/70 px-3 py-2.5 text-left shadow-panel backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-brand-fill/60 hover:bg-surface/90 hover:shadow-lg focus-visible:border-brand-fill active:translate-y-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gray-300 transition duration-200 group-hover:scale-105 group-hover:bg-brand-soft/20 group-hover:text-brand-text">
        <AppIcon id={iconId} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-gray-100">{title}</span>
        <span className="line-clamp-1 block text-[10px] text-gray-500">{description}</span>
      </span>
    </button>
  );
}

// ── Priority queue ──────────────────────────────────────────────────────────

/** The three tickets closest to breaching, so the page answers "which first?". */
function PriorityQueue({
  tickets, now, onOpen,
}: {
  tickets: ReturnType<typeof useTicketStore.getState>["tickets"];
  now: number;
  onOpen: (id: string) => void;
}) {
  const ranked = [...tickets]
    .map((t) => ({ t, sla: slaSnapshot(t, now) }))
    .sort((a, b) => Number(b.sla.breached) - Number(a.sla.breached) || a.sla.remainingSec - b.sla.remainingSec)
    .slice(0, 4);

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface/70 shadow-panel backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <IconClock size={12} className="text-brand-text" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Closest to breach
        </h2>
      </div>

      {ranked.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-gray-500">
          Nothing in the queue. New requests arrive on their own.
        </p>
      ) : (
        ranked.map(({ t, sla }) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            className="flex w-full items-center gap-2 border-b border-edge/50 px-3 py-2 text-left transition last:border-0 hover:bg-brand-soft/10"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                sla.breached ? "bg-danger" : sla.remainingSec < 300 ? "bg-warn" : "bg-accent"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-gray-200">{t.title}</span>
              <span className="block font-mono text-[9px] text-gray-600">{t.code}</span>
            </span>
            <span
              className={`shrink-0 font-mono text-[10px] ${
                sla.breached ? "text-danger-strong" : "text-gray-500"
              }`}
            >
              {sla.breached ? "breached" : sla.label}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// ── Activity feed ───────────────────────────────────────────────────────────

function ActivityFeed({
  items,
}: {
  items: ReturnType<typeof useNotificationStore.getState>["items"];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface/70 shadow-panel backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <IconActivity size={12} className="text-brand-text" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Activity
        </h2>
        <span className="ml-auto font-mono text-[10px] text-gray-600">{items.length}</span>
      </div>

      <div className="max-h-[22rem] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-gray-500">
            Nothing has happened yet. Events land here as the estate reacts to your work.
          </p>
        ) : (
          items.slice(0, 20).map((n) => (
            <div key={n.id} className="flex gap-2 border-b border-edge/50 px-3 py-2 last:border-0">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  n.kind === "warning" ? "bg-warn" : n.kind === "success" ? "bg-accent" : "bg-info"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0 truncate text-[11px] font-medium text-gray-200">
                    {n.title}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[9px] text-gray-600">
                    {ago(n.at)}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-gray-500">
                  {n.body}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ago(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
