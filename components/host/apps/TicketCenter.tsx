"use client";

/**
 * Ticket Center (Level-0 host app)
 * --------------------------------
 * The ITSM frame: filterable queue on the left, rich detail on the right.
 * Live SLA countdown, persona emotion badges, and dialogue hand-off (Phase 5).
 */

import { useMemo } from "react";
import type { Ticket, TicketCategory, TicketSeverity } from "@/lib/core";
import { applyFilters, useTicketStore } from "@/lib/host/tickets-store";
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

const SEVERITIES: (TicketSeverity | "all")[] = ["all", "low", "medium", "high", "critical"];
const CATEGORIES: (TicketCategory | "all")[] = [
  "all",
  "Identity & Access",
  "Network & Routing",
  "System & Web Services",
  "Security & Incident",
];
const DIFFICULTY_BADGE: Record<string, { label: string; color: string }> = {
  Tier_1_Easy: { label: "T1", color: "bg-emerald-500/15 text-emerald-300" },
  Tier_2_Medium: { label: "T2", color: "bg-amber-500/15 text-amber-300" },
  Tier_3_Hard: { label: "T3", color: "bg-red-500/15 text-red-300" },
};

export default function TicketCenter() {
  const { tickets, selectedId, filters, select, setFilter } = useTicketStore();
  const visible = useMemo(() => applyFilters(tickets, filters), [tickets, filters]);
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

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
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={filters.showClosed}
            onChange={(e) => setFilter("showClosed", e.target.checked)}
            className="accent-info"
          />
          Resolved
        </label>
      </AppHeader>

      {/* Categories scroll; severity is a segmented control so the bar stays one row. */}
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
      </FilterBar>

      {/* Split: list + detail */}
      <div className="flex min-h-0 flex-1">
        <div className="w-[46%] overflow-y-auto term-scroll border-r border-edge">
          {visible.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-600">No tickets match these filters.</div>
          )}
          {visible.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              active={t.id === selectedId}
              onClick={() => select(t.id)}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto term-scroll">
          {selected ? <TicketDetail ticket={selected} /> : <EmptyDetail />}
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  active,
  onClick,
}: {
  ticket: Ticket;
  active: boolean;
  onClick: () => void;
}) {
  const track = TRACK_META[ticket.track];
  const sev = SEVERITY_META[ticket.severity];
  const status = STATUS_META[ticket.status];
  const now = useNow();
  const sla = slaSnapshot(ticket, now);
  const emotion = useDialogueStore((s) => s.conversations[ticket.id]?.emotion);

  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-1.5 border-b border-edge/60 px-3 py-2.5 text-left transition ${
        active ? "bg-info/10" : "hover:bg-panelalt"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
        <span className="font-mono text-[11px] text-gray-500">{ticket.code}</span>
        <span
          className={`rounded px-1 py-0.5 text-[9px] font-bold ${DIFFICULTY_BADGE[ticket.difficulty].color}`}
          title={ticket.difficulty}
        >
          {DIFFICULTY_BADGE[ticket.difficulty].label}
        </span>
        {emotion && (
          <span className={`rounded px-1 py-0.5 text-[10px] ${EMOTION_META[emotion].color}`} title={EMOTION_META[emotion].label}>
            <AppIcon id={EMOTION_META[emotion].iconId} size={11} />
          </span>
        )}
        <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
          {status.label}
        </span>
      </div>
      <div className="line-clamp-2 text-[13px] leading-snug text-gray-100">{ticket.title}</div>
      <div className="flex items-center gap-2 text-[10px]">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${track.color}`}>
          <AppIcon id={track.iconId} size={11} /> {ticket.category}
        </span>
        <span className="text-gray-500">{ticket.requester.name}</span>
        <span className="ml-auto text-gray-500">{relativeTime(ticket.createdAt)}</span>
        {ticket.status !== "resolved" && ticket.status !== "closed" && (
          <span className={sla.breached ? "text-danger" : "text-gray-400"}>· {sla.label}</span>
        )}
      </div>
    </button>
  );
}

function TicketDetail({ ticket }: { ticket: Ticket }) {
  const { accept, escalate, setStatus } = useTicketStore();
  const openApp = useHostStore((s) => s.openApp);
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
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{ticket.code}</span>
          <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${track.color}`}>
            <AppIcon id={track.iconId} size={11} /> {track.label}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${sev.color}`}>
            {sev.label}
          </span>
          <span className="rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] text-gray-300">
            {ticket.priority}
          </span>
          <span className={`ml-auto rounded px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
            {status.label}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-tight text-gray-50">{ticket.title}</h2>
      </div>

      {/* SLA meter */}
      {!closed && (
        <div className="rounded-lg border border-edge bg-panelalt p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider text-gray-500">Resolution SLA</span>
            <span className={sla.breached ? "font-semibold text-danger" : "font-semibold text-gray-200"}>
              {sla.label}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className={`h-full rounded-full ${
                sla.breached ? "bg-danger" : sla.usedPct > 75 ? "bg-warn" : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, sla.usedPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Requester */}
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

      <Field label="Affected nodes">
        <div className="flex flex-wrap gap-1.5">
          {ticket.targetNodeIds.map((n) => (
            <span key={n} className="rounded border border-edge bg-panel px-2 py-0.5 font-mono text-[11px] text-gray-300">
              {n}
            </span>
          ))}
        </div>
      </Field>

      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {ticket.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">
              #{tag}
            </span>
          ))}
        </div>
      </Field>

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        {ticket.status === "new" && (
          <button
            onClick={onAccept}
            className="rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110"
          >
            Accept ticket
          </button>
        )}
        {(ticket.status === "accepted" || ticket.status === "in_progress") && (
          <button
            onClick={() => setStatus(ticket.id, "in_progress")}
            className="rounded-md border border-info/50 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/20"
          >
            Mark in progress
          </button>
        )}
        <button
          onClick={() => openApp("gateway")}
          className="rounded-md border border-edge px-3 py-1.5 text-xs text-gray-200 hover:bg-panelalt"
        >
          Open Remote Gateway →
        </button>
        {!closed && (
          <button
            onClick={() => escalate(ticket.id)}
            className="ml-auto rounded-md border border-fuchsia-500/40 px-3 py-1.5 text-xs text-fuchsia-300 hover:bg-fuchsia-500/10"
          >
            Escalate{ticket.escalationCount > 0 ? ` (${ticket.escalationCount})` : ""}
          </button>
        )}
      </div>

      <div className="text-[10px] text-gray-600">
        XP reward: {ticket.xpReward} · Scenario: <span className="font-mono">{ticket.scenarioId}</span>
      </div>
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
    <div className="flex h-full items-center justify-center text-xs text-gray-600">
      Select a ticket to view details.
    </div>
  );
}
