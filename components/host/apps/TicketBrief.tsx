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
 * SVG icons only — no emoji.
 */

import type { Ticket } from "@/lib/core";
import { IconChevronRight } from "@/components/ui/icons";

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

/** Numbered resolution checklist from the template's guidance. */
export function TicketSteps({ hints }: { hints?: string[] }) {
  if (!hints || hints.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-edge bg-panelalt/50 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Steps to resolve
      </div>
      <ol className="space-y-1.5">
        {hints.map((h, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-gray-300">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-info/15 text-[9px] font-bold text-info">
              {i + 1}
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Full brief: description + steps. */
export default function TicketBrief({ ticket }: { ticket: Ticket }) {
  return (
    <div className="text-xs">
      <TicketDescription text={ticket.description} />
      <TicketSteps hints={ticket.hints} />
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-600">
        <IconChevronRight size={11} />
        Resolution is graded automatically from live system state — fix it any way you like.
      </div>
    </div>
  );
}
