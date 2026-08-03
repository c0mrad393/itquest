"use client";

/**
 * TicketBrief — scannable ticket documentation.
 * ============================================
 * Renders a ticket's description with light markup so the player can grasp the
 * job at a glance, plus a numbered "Steps to resolve" checklist built from the
 * template's guidance.
 *
 * Supported markup in descriptions:
 *   **bold**              → emphasised key objective / value
 *   lines starting "• "   → bullet list
 *   "Label:" on its own   → section heading (e.g. "User request:")
 *   blank line            → paragraph break
 *
 * Guidance is a GAMEPLAY resource, not documentation: see `TicketHints`.
 * SVG icons only — no emoji.
 */

import type { Ticket } from "@/lib/core";
import { IconChevronRight } from "@/components/ui/icons";
import { AppIcon } from "@/components/ui/app-icons";
import { useTicketStore } from "@/lib/host/tickets-store";
import { HINT_PENALTY_PER_STEP, hintFactor, projectedXp } from "@/lib/scenario/scoring";

/** Split **bold** runs into styled spans. */
function inline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-gray-100">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{chunk}</span>
    ),
  );
}

export function TicketDescription({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="my-1.5 space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-info" />
            <span>{inline(b, `b-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^[•\-•]\s+/.test(line.trim())) {
      bullets.push(line.trim().replace(/^[•\-•]\s+/, ""));
      return;
    }
    flush(String(i));
    if (!line.trim()) return;
    // A short "Label:" line acts as a section heading.
    if (/^[A-Z][A-Za-z /]{2,28}:$/.test(line.trim())) {
      blocks.push(
        <div key={`h-${i}`} className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {line.trim().replace(/:$/, "")}
        </div>,
      );
      return;
    }
    blocks.push(
      <p key={`p-${i}`} className="my-1 leading-relaxed">
        {inline(line, `p-${i}`)}
      </p>,
    );
  });
  flush("end");

  return <div className="text-gray-300">{blocks}</div>;
}

/**
 * Guidance panel — hints are a spendable resource, not documentation.
 *
 * Nothing is shown up front. Each reveal costs a fixed share of the ticket's
 * reward (see HINT_PENALTY_PER_STEP) and is recorded on the ticket, so the
 * price survives a reload and is charged at resolution. Hard Mode forgoes the
 * panel entirely to lock in the full reward — it can only be committed to
 * before the first hint is spent, since a spent hint has already been paid for.
 */
export function TicketHints({ ticket }: { ticket: Ticket }) {
  const revealHint = useTicketStore((s) => s.revealHint);
  const setHardMode = useTicketStore((s) => s.setHardMode);

  const hints = ticket.hints ?? [];
  if (hints.length === 0) return null;

  const revealed = ticket.hintsRevealed;
  const remaining = hints.length - revealed;
  const closed = ticket.status === "resolved" || ticket.status === "closed";
  const factor = hintFactor(revealed);
  const projected = projectedXp(ticket);
  const full = projectedXp({ ...ticket, hintsRevealed: 0 });

  if (ticket.hardMode) {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3">
        <span className="text-amber-300">
          <AppIcon id="shield" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-amber-200">Hard Mode</div>
          <div className="text-[10px] text-amber-200/60">
            Guidance hidden · full {full.toLocaleString()} XP on the line
          </div>
        </div>
        {!closed && (
          <button
            onClick={() => setHardMode(ticket.id, false)}
            className="shrink-0 rounded-md border border-amber-500/40 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/15"
          >
            Show guidance
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-edge bg-panelalt/50">
      <div className="flex items-center gap-2 border-b border-edge/70 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Guidance
        </span>
        <span className="text-[10px] text-gray-600">
          {revealed}/{hints.length} revealed
        </span>
        <span
          className={`ml-auto font-mono text-[11px] font-semibold ${
            revealed > 0 ? "text-amber-300" : "text-emerald-300"
          }`}
          title={
            revealed > 0
              ? `Base ${full.toLocaleString()} XP, reduced ${Math.round((1 - factor) * 100)}% by hints`
              : "No hints spent — full reward"
          }
        >
          {projected.toLocaleString()} XP
          {revealed > 0 && (
            <span className="ml-1 text-[10px] font-normal text-gray-600 line-through">
              {full.toLocaleString()}
            </span>
          )}
        </span>
      </div>

      {revealed > 0 && (
        <ol className="space-y-1.5 px-3 py-2.5">
          {hints.slice(0, revealed).map((h, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-gray-300">
              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-info/15 text-[9px] font-bold text-info">
                {i + 1}
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ol>
      )}

      {!closed && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 pt-0.5">
          {remaining > 0 ? (
            <button
              onClick={() => revealHint(ticket.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-info/40 bg-info/10 px-2.5 py-1.5 text-[11px] font-semibold text-info transition hover:bg-info/20"
            >
              <AppIcon id="eye" size={12} />
              Reveal next hint
              <span className="font-mono text-[10px] font-normal text-info/70">
                −{Math.round(HINT_PENALTY_PER_STEP * 100)}%
              </span>
            </button>
          ) : (
            <span className="text-[10px] text-gray-600">All guidance revealed.</span>
          )}
          {revealed === 0 && (
            <button
              onClick={() => setHardMode(ticket.id, true)}
              title="Hide guidance for this ticket and keep the full reward"
              className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-[11px] text-gray-400 transition hover:border-amber-500/40 hover:text-amber-200"
            >
              <AppIcon id="shield" size={12} />
              Hard Mode
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Full brief: description + guidance. */
export default function TicketBrief({ ticket }: { ticket: Ticket }) {
  return (
    <div className="text-xs">
      <TicketDescription text={ticket.description} />
      <TicketHints ticket={ticket} />
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-600">
        <IconChevronRight size={11} />
        Resolution is graded automatically from live system state — fix it any way you like.
      </div>
    </div>
  );
}
