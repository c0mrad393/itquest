"use client";

/**
 * Ticket Center (Level-0 host app)
 * ================================
 * Split pane: the queue on the left, the selected request on the right.
 *
 * ── THE CLUTTER PROBLEM, AND WHAT ACTUALLY FIXED IT ─────────────────────────
 *
 * Every row used to carry a severity dot, a code, a difficulty tier, an
 * emotion badge, a status pill, a category chip, a requester and two
 * timestamps — nine pieces of information before the title. The detail pane
 * opened with five badges in a row, then SLA, requester, description,
 * affected nodes, tags, actions and a scoring footer. All of it is real and
 * all of it matters eventually; none of it matters on your first ticket.
 *
 * The fix is DENSITY, not deletion. `essentials` answers the three questions a
 * beginner actually has — who is asking, what broke, how long have I got —
 * and `advanced` restores everything. Nothing is removed from the product;
 * one control decides how much of it is on screen.
 *
 * The split follows the rule already written down in Disclosure.tsx: something
 * may be hidden only if leaving it alone yields a CORRECT result. Reading a
 * ticket without its routing tags still gets the ticket fixed, so tags hide.
 * The SLA clock changes what you should do next, so it never hides. The
 * actions never hide. Filters hide, because unfiltered is a correct view of
 * the queue — and a beginner with five tickets does not need a filter rail,
 * while an operator with forty does.
 *
 * ── WHY THE TOGGLE IS NOT A "BEGINNER MODE" ─────────────────────────────────
 *
 * It is labelled by what it shows, not by who it is for. A mode that tells the
 * operator they are the beginner version gets switched off immediately and for
 * the wrong reason — out of pride rather than need — which lands them in the
 * dense view precisely when they can least read it.
 *
 * ── MOTION ──────────────────────────────────────────────────────────────────
 *
 * CSS transitions and keyframes, matching the rest of this codebase.
 * framer-motion is not a dependency here (package.json: next, react, zustand,
 * supabase) and the work it would do on this screen — a fade-and-rise on pane
 * change, a height reveal, hover lifts — is three rules of CSS that cost no
 * bundle and cannot desynchronise from the theme.
 *
 * SVG icons and typographic glyphs only — no emoji.
 */

import { useMemo } from "react";
import type { Ticket, TicketCategory, TicketSeverity } from "@/lib/core";
import { applyFilters, useTicketStore, type TicketDensity } from "@/lib/host/tickets-store";
import { useHostStore } from "@/lib/host/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { EMOTION_META } from "@/lib/dialogue/types";
import { useNow } from "@/lib/sla/store";
import {
  SEVERITY_META,
  STATUS_META,
  TRACK_META,
  relativeTime,
  slaSnapshot,
} from "@/lib/host/ticket-ui";
import TicketBrief from "./TicketBrief";
import { AppIcon } from "@/components/ui/app-icons";
import { AppHeader, Chip, CountPill, FilterBar, SearchField, Segmented } from "./AppChrome";
import EmptyState from "@/components/ui/EmptyState";
import { IconInboxZero, IconSearch, IconTicket } from "@/components/ui/icons";
import { Term } from "@/components/ui/Tooltip";
import { isHardwareTicket, jobForTicket } from "@/lib/hardware/types";

const SEVERITIES: (TicketSeverity | "all")[] = ["all", "low", "medium", "high", "critical"];
const CATEGORIES: (TicketCategory | "all")[] = [
  "all",
  "Identity & Access",
  "Network & Routing",
  "System & Web Services",
  "Security & Incident",
];
/*
 * Tier badges, on SEMANTIC inks rather than raw palette shades.
 *
 * `text-emerald-300` on `bg-emerald-500/15` measured 3.79:1 in light mode,
 * with nine of these on screen at once in Advanced. The raw shades resolve
 * through the family's mid tone, which is tuned to sit on a page background
 * rather than on a tint of itself; `-strong` is the token for that job.
 *
 * Swapping the ink exposed a second problem underneath the first — the green
 * `--accent-text` had no headroom at ANY tint — which is fixed at the token in
 * theme.css rather than by thinning the tint here. Comment there explains why
 * green in particular needed it.
 */
const DIFFICULTY_BADGE: Record<string, { label: string; color: string }> = {
  Tier_1_Easy: { label: "T1", color: "bg-accent/15 text-accent-strong" },
  Tier_2_Medium: { label: "T2", color: "bg-warn/15 text-warn-strong" },
  Tier_3_Hard: { label: "T3", color: "bg-danger/15 text-danger-strong" },
  Tier_4_Expert: { label: "T4", color: "bg-violet/20 text-violet-strong" },
};

const DENSITY_OPTIONS: { value: TicketDensity; label: string }[] = [
  { value: "essentials", label: "Essentials" },
  { value: "advanced", label: "Advanced" },
];

export default function TicketCenter() {
  const { tickets, selectedId, filters, density, select, setFilter, setDensity } = useTicketStore();
  const visible = useMemo(() => applyFilters(tickets, filters), [tickets, filters]);
  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const pro = density === "advanced";

  // Mail-only escalations aren't on the board yet, so they don't count here.
  const openCount = tickets.filter(
    (t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed",
  ).length;

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="ticket" title="Ticket Center" subtitle="Incident queue">
        <CountPill value={openCount} label="open" />
        <SearchField
          value={filters.query}
          onChange={(v) => setFilter("query", v)}
          placeholder="Search code, title, requester…"
        />
        {/* The density control lives in the header rather than in a menu: it
            changes what the whole screen looks like, so hiding it would make
            the change feel like the app deciding rather than the operator. */}
        <div data-tutorial-target="ticket-density">
          <Segmented
            value={density}
            onChange={(v) => setDensity(v as TicketDensity)}
            options={DENSITY_OPTIONS}
          />
        </div>
      </AppHeader>

      {/*
        The filter rail is advanced-only. Unfiltered is a correct and complete
        view of the queue, so a beginner loses nothing by not having it — and
        gains a screen with one less row of controls to interpret.
      */}
      {pro && (
        <FilterBar>
          <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={filters.category === c} onClick={() => setFilter("category", c)}>
                {c === "all" ? "All" : c}
              </Chip>
            ))}
          </div>
          <Segmented
            value={filters.severity}
            onChange={(v) => setFilter("severity", v)}
            options={SEVERITIES.map((s) => ({
              value: s,
              label: s === "all" ? "Any" : SEVERITY_META[s].label,
            }))}
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-gray-400">
            <input
              type="checkbox"
              checked={filters.showClosed}
              onChange={(e) => setFilter("showClosed", e.target.checked)}
              className="accent-info"
            />
            Resolved
          </label>
        </FilterBar>
      )}

      {/* Split: list + detail */}
      <div className="flex min-h-0 flex-1">
        {/* The tutorial spotlights the whole queue rather than a single row:
            which ticket is first depends on the generated world, and pointing
            at "the one at the top" would highlight a different incident every
            new game. */}
        <div
          data-tutorial-target="ticket-queue"
          className="w-[42%] min-w-[16rem] max-w-[26rem] overflow-y-auto term-scroll border-r border-edge"
        >
          {/*
            Two very different empties wearing the same words before v0.9.0.
            "Nothing matches your filters" is a thing the operator did and can
            undo; "inbox zero" is a state of the WORLD and is good news. A
            beginner who hides their whole queue behind a stray filter needs to
            be told which of the two they are looking at.
          */}
          {visible.length === 0 && tickets.length > 0 && (
            <EmptyState
              compact
              icon={<IconSearch size={16} />}
              title="No tickets match these filters"
              body="There are tickets in the queue — the current filters are hiding them. Clear a filter to bring them back."
            />
          )}
          {visible.length === 0 && tickets.length === 0 && (
            <EmptyState
              compact
              icon={<IconInboxZero size={18} />}
              title="Inbox zero"
              body="Waiting for new requests. Fresh tickets arrive on their own as the day goes on."
            />
          )}
          {visible.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              active={t.id === selectedId}
              pro={pro}
              onClick={() => select(t.id)}
            />
          ))}
        </div>

        <div data-tutorial-target="ticket-detail" className="min-w-0 flex-1 overflow-y-auto term-scroll">
          {selected ? (
            // Keyed on the ticket id so switching requests replays the entrance
            // rather than swapping text in place — the pane visibly becomes a
            // different document, which is the whole job of the transition.
            <TicketDetail key={selected.id} ticket={selected} pro={pro} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  active,
  pro,
  onClick,
}: {
  ticket: Ticket;
  active: boolean;
  pro: boolean;
  onClick: () => void;
}) {
  const track = TRACK_META[ticket.track];
  const sev = SEVERITY_META[ticket.severity];
  const status = STATUS_META[ticket.status];
  const now = useNow();
  const sla = slaSnapshot(ticket, now);
  const emotion = useDialogueStore((s) => s.conversations[ticket.id]?.emotion);
  const live = ticket.status !== "resolved" && ticket.status !== "closed";

  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`group relative flex w-full flex-col gap-1 border-b border-edge/60 py-2.5 pl-4 pr-3 text-left transition-colors duration-150 ${
        active ? "bg-brand-soft/[0.10]" : "hover:bg-panelalt"
      }`}
    >
      {/*
        Selection is a rail on the leading edge, not a background wash. A wash
        has to stay pale enough to read text through, which makes it easy to
        miss; a solid 2px bar is unmissable at any density and costs no
        contrast against the row's own content.
      */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[2px] transition-all duration-200 ${
          active ? "bg-brand-fill" : "bg-transparent group-hover:bg-edge-strong"
        }`}
      />

      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sev.dot}`} title={sev.label} />
        <span className="font-mono text-[10px] text-gray-500">{ticket.code}</span>
        {pro && (
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-bold ${DIFFICULTY_BADGE[ticket.difficulty].color}`}
            title={ticket.difficulty}
          >
            {DIFFICULTY_BADGE[ticket.difficulty].label}
          </span>
        )}
        {pro && emotion && (
          <span
            className={`rounded px-1 py-0.5 text-[10px] ${EMOTION_META[emotion].color}`}
            title={EMOTION_META[emotion].label}
          >
            <AppIcon id={EMOTION_META[emotion].iconId} size={11} />
          </span>
        )}
        {/*
          The clock is the one thing that decides what to do next, so in
          Essentials it takes the slot the status pill used to hold. Status is
          mostly derivable from the row you are looking at; time remaining is
          not, and it is the only value here that is running out.
        */}
        {live ? (
          <span
            className={`ml-auto font-mono text-[10px] tabular-nums ${
              sla.breached ? "font-semibold text-danger" : sla.usedPct > 75 ? "text-warn" : "text-gray-400"
            }`}
          >
            {sla.label}
          </span>
        ) : (
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
            {status.label}
          </span>
        )}
      </div>

      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-100">
        {ticket.title}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        {pro && (
          <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${track.color}`}>
            <AppIcon id={track.iconId} size={11} /> {ticket.category}
          </span>
        )}
        <span className="truncate">{ticket.requester.name}</span>
        <span className="ml-auto shrink-0">{relativeTime(ticket.createdAt)}</span>
        {pro && live && <span className="shrink-0 text-gray-600">· {status.label}</span>}
      </div>
    </button>
  );
}

function TicketDetail({ ticket, pro }: { ticket: Ticket; pro: boolean }) {
  const { accept, escalate, setStatus } = useTicketStore();
  const openApp = useHostStore((s) => s.openApp);
  const openAppFocused = useHostStore((s) => s.openAppFocused);
  // Null for anything with no bench work, which is what picks the CTA below.
  const hwJob = isHardwareTicket(ticket.templateId, ticket.tags) ? jobForTicket(ticket) : null;
  const operator = useHostStore((s) => s.host.user.displayName);
  const dialogueEvent = useDialogueStore((s) => s.event);

  const track = TRACK_META[ticket.track];
  const sev = SEVERITY_META[ticket.severity];
  const status = STATUS_META[ticket.status];
  const now = useNow();
  const sla = slaSnapshot(ticket, now);
  const closed = ticket.status === "resolved" || ticket.status === "closed";

  function onAccept() {
    accept(ticket.id, operator);
    dialogueEvent(ticket.id, "accepted");
  }

  return (
    <div className="detail-in flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{ticket.code}</span>
          {/* Severity stays in both densities — it is the ranking signal.
              Track and priority are routing metadata and go with Advanced. */}
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${sev.color}`}>{sev.label}</span>
          {pro && (
            <>
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${track.color}`}
              >
                <AppIcon id={track.iconId} size={11} /> {track.label}
              </span>
              <span className="rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] text-gray-300">
                {ticket.priority}
              </span>
            </>
          )}
          <span className={`ml-auto rounded px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
            {status.label}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-tight text-gray-50">{ticket.title}</h2>
      </div>

      {/* SLA meter. Never hidden: it changes what you should do next. */}
      {!closed && (
        <div className="rounded-lg border border-edge bg-panelalt p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider text-gray-500">
              Resolution <Term k="sla">SLA</Term>
            </span>
            <span
              className={sla.breached ? "font-semibold text-danger" : "font-semibold text-gray-200"}
            >
              {sla.label}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                sla.breached ? "bg-danger" : sla.usedPct > 75 ? "bg-warn" : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, sla.usedPct)}%` }}
            />
          </div>
        </div>
      )}

      <Field label="Requester">
        <div className="text-gray-200">{ticket.requester.name}</div>
        <div className="text-[11px] text-gray-500">
          {ticket.requester.role} · {ticket.clientOrg}
        </div>
        <div className="text-[11px] text-info">{ticket.requester.email}</div>
      </Field>

      <Field label="Description">
        <TicketBrief ticket={ticket} />
      </Field>

      {/*
        Everything below is diagnosis metadata. It is genuinely useful — the
        affected node list is often the fastest route to the fault — but it is
        useful to someone who already knows what a node id is. `Reveal` keeps
        the DOM stable and animates the height, so switching density does not
        make the pane jump.
      */}
      <Reveal open={pro}>
        <div className="flex flex-col gap-4">
          <Field label="Affected nodes">
            <div className="flex flex-wrap gap-1.5">
              {ticket.targetNodeIds.map((n) => (
                <span
                  key={n}
                  className="rounded border border-edge bg-panel px-2 py-0.5 font-mono text-[11px] text-gray-300"
                >
                  {n}
                </span>
              ))}
            </div>
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {ticket.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </Field>
        </div>
      </Reveal>

      {/* Actions. Never hidden, never reordered — muscle memory lives here. */}
      <div
        data-tutorial-target="ticket-actions"
        className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge pt-3"
      >
        {ticket.status === "new" && (
          <button
            onClick={onAccept}
            className="rounded-md bg-brand-fill px-3 py-1.5 text-xs font-semibold text-brand-on transition hover:bg-brand-hover active:scale-[0.98]"
          >
            Accept ticket
          </button>
        )}
        {(ticket.status === "accepted" || ticket.status === "in_progress") && (
          <button
            onClick={() => setStatus(ticket.id, "in_progress")}
            className="rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info transition hover:bg-info/20 active:scale-[0.98]"
          >
            Mark in progress
          </button>
        )}
        {/*
          THE DEEP LINK (QA2). A hardware ticket sends the operator to the
          bench with the right device already selected, rather than to a
          gateway that cannot do the job — and rather than to a list they then
          have to search for the hostname the ticket just told them.
        */}
        {hwJob ? (
          <button
            onClick={() => openAppFocused("hardwarelab", hwJob.targetNodeId)}
            className="rounded-md border border-brand-fill bg-brand-soft/15 px-3 py-1.5 text-xs font-semibold text-brand-text transition hover:bg-brand-soft/25 active:scale-[0.98]"
          >
            Open {hwJob.targetHostname} in Hardware Lab &rarr;
          </button>
        ) : (
          <button
            onClick={() => openApp("gateway")}
            className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-200 transition hover:bg-panelalt active:scale-[0.98]"
          >
            Open Remote Gateway &rarr;
          </button>
        )}
        {!closed && (
          <button
            onClick={() => escalate(ticket.id)}
            className="ml-auto rounded-md border border-fuchsia-500/40 px-3 py-1.5 text-xs text-fuchsia-300 transition hover:bg-fuchsia-500/10 active:scale-[0.98]"
          >
            Escalate{ticket.escalationCount > 0 ? ` (${ticket.escalationCount})` : ""}
          </button>
        )}
      </div>

      <Reveal open={pro}>
        <div className="text-[10px] text-gray-600">
          XP reward: {ticket.xpReward} · Scenario: <span className="font-mono">{ticket.scenarioId}</span>
        </div>
      </Reveal>
    </div>
  );
}

/**
 * A height reveal with no JavaScript measurement.
 *
 * `grid-template-rows: 0fr → 1fr` animates to the content's natural height,
 * which `height: auto` cannot do and a measured max-height does badly — pick a
 * max-height too small and long content is clipped, too large and short
 * content eases for most of the transition with nothing moving.
 *
 * The child must be `min-h-0 overflow-hidden` or it refuses to shrink below
 * its content and the collapse does nothing at all.
 */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function EmptyDetail() {
  return (
    <EmptyState
      icon={<IconTicket size={22} />}
      title="No ticket selected"
      body="Pick a request from the queue on the left to read it, talk to the person who raised it, and work the fix."
    />
  );
}
