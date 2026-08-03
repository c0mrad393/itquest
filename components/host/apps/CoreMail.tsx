"use client";

/**
 * CoreMail — corporate mailbox (Outlook-style, Level-0 host app)
 * -------------------------------------------------------------
 * Two message sources merged into one inbox:
 *   • Ambient mail (useMailStore) — internal staff requests from the org's
 *     100+ directory, plus external ISP / vendor advisories.
 *   • Incident threads (useTicketStore) — Tier 2/3 tickets arrive here FIRST
 *     as an escalating email string and only reach the ITSM dashboard when the
 *     operator escalates them ("mail-only until promoted").
 *
 * Tier-1 phishing is also actioned from here: flagging the malicious sender
 * domain satisfies that ticket's win-condition.
 */

import { useMemo, useState } from "react";
import { useMailStore, type MailFolder, type MailMessage } from "@/lib/mail/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useInfraStore } from "@/lib/infra/store";
import { relativeTime } from "@/lib/host/ticket-ui";
import type { Ticket } from "@/lib/core";
import type { EmailBeat } from "@/lib/tickets/matrix";
import { AppIcon } from "@/components/ui/app-icons";
import { AppHeader, CountPill } from "./AppChrome";
import type { HostAppIconId } from "@/lib/core";

const FOLDERS: { id: MailFolder; label: string; iconId: HostAppIconId }[] = [
  { id: "inbox", label: "Inbox", iconId: "inbox" as const },
  { id: "external", label: "External", iconId: "globe" as const },
  { id: "sent", label: "Sent", iconId: "send" as const },
];

/** A unified row: either ambient mail or a ticket incident thread. */
type Row =
  | { kind: "ambient"; id: string; ts: number; msg: MailMessage }
  | { kind: "incident"; id: string; ts: number; ticket: Ticket; beats: EmailBeat[] };

export default function CoreMail() {
  const { messages, folder, setFolder, markRead } = useMailStore();
  const tickets = useTicketStore((s) => s.tickets);
  const mailThreads = useTicketStore((s) => s.mailThreads);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Incident rows: mail-origin escalations, plus any reported phishing mail
  // (Tier-1 phishing arrives in the mailbox so its sender can be flagged here).
  const incidents = useMemo(
    () =>
      tickets
        .filter((t) => (t.origin === "mail" && mailThreads[t.id]?.length) || t.dynamicContext.senderDomain)
        .map<Row>((t) => {
          const beats: EmailBeat[] = mailThreads[t.id]?.length
            ? mailThreads[t.id]
            : [
                {
                  from: "IT Service Desk (spoofed)",
                  fromEmail: `no-reply@${t.dynamicContext.senderDomain}`,
                  subject: "ACTION REQUIRED: Your password expires today",
                  body:
                    `Dear ${t.dynamicContext.targetUserName ?? "colleague"},\n\n` +
                    `Our records show your network password expires in 2 hours. To avoid losing access, ` +
                    `re-confirm your credentials immediately using the secure portal below.\n\n` +
                    `  https://${t.dynamicContext.senderDomain}/verify?u=${t.dynamicContext.targetUserId}\n\n` +
                    `Failure to act will result in account suspension.\n\nIT Service Desk`,
                  ageMin: 18,
                },
              ];
          const newest = beats[beats.length - 1];
          return { kind: "incident", id: `inc-${t.id}`, ts: Date.now() - newest.ageMin * 60_000, ticket: t, beats };
        }),
    [tickets, mailThreads],
  );

  const ambient = useMemo<Row[]>(
    () => messages.map((m) => ({ kind: "ambient", id: m.id, ts: m.ts, msg: m })),
    [messages],
  );

  const rows = useMemo(() => {
    let all = [...incidents, ...ambient];
    if (folder === "external") {
      all = all.filter((r) => r.kind === "ambient" && r.msg.kind === "external");
    } else if (folder === "sent") {
      all = all.filter(
        (r) =>
          (r.kind === "ambient" && r.msg.thread.some((t) => t.from === "you")) ||
          (r.kind === "incident" && !r.ticket.mailOnly),
      );
    }
    return all.sort((a, b) => b.ts - a.ts);
  }, [incidents, ambient, folder]);

  const unread =
    messages.filter((m) => !m.read).length + incidents.filter((r) => r.kind === "incident" && r.ticket.mailOnly).length;

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function open(r: Row) {
    setSelectedId(r.id);
    if (r.kind === "ambient") markRead(r.msg.id);
  }

  return (
    <div className="flex h-full flex-col bg-panel text-sm text-gray-200">
      <AppHeader iconId="mail" title="CoreMail" subtitle="Corporate mailbox">
        {unread > 0 && <CountPill value={unread} label="unread" tone="warn" />}
      </AppHeader>

      <div className="flex min-h-0 flex-1">
      {/* Folder rail */}
      <div className="w-40 shrink-0 border-r border-edge bg-panelalt pt-2">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
              folder === f.id ? "bg-info/15 text-info" : "text-gray-300 hover:bg-panel"
            }`}
          >
            <AppIcon id={f.iconId} size={14} />
            <span>{f.label}</span>
            {f.id === "inbox" && unread > 0 && (
              <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Message list */}
      <div className="w-80 shrink-0 overflow-y-auto term-scroll border-r border-edge">
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-600">No mail in this folder.</div>
        )}
        {rows.map((r) =>
          r.kind === "incident" ? (
            <IncidentRow key={r.id} row={r} active={selectedId === r.id} onClick={() => open(r)} />
          ) : (
            <AmbientRow key={r.id} msg={r.msg} active={selectedId === r.id} onClick={() => open(r)} />
          ),
        )}
      </div>

      {/* Reading pane */}
      <div className="min-w-0 flex-1 overflow-y-auto term-scroll">
        {selected ? (
          selected.kind === "incident" ? (
            <IncidentReader row={selected} />
          ) : (
            <AmbientReader msg={selected.msg} />
          )
        ) : (
          <Empty />
        )}
      </div>
      </div>
    </div>
  );
}

// ── List rows ───────────────────────────────────────────────────────────────

function IncidentRow({
  row,
  active,
  onClick,
}: {
  row: Extract<Row, { kind: "incident" }>;
  active: boolean;
  onClick: () => void;
}) {
  const pending = row.ticket.mailOnly;
  const newest = row.beats[row.beats.length - 1];
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-1 border-b border-edge/60 px-3 py-2.5 text-left ${
        active ? "bg-info/10" : pending ? "bg-panelalt/60 hover:bg-panelalt" : "hover:bg-panelalt"
      }`}
    >
      <div className="flex items-center gap-2">
        {pending && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
        <span className={`truncate text-[13px] ${pending ? "font-semibold text-gray-100" : "text-gray-300"}`}>
          {newest.from}
        </span>
        <span className="rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold text-rose-300">
          {row.ticket.difficulty === "Tier_4_Expert" ? "T4" : row.ticket.difficulty === "Tier_3_Hard" ? "T3" : row.ticket.difficulty === "Tier_2_Medium" ? "T2" : "T1"}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-gray-500">{relativeTime(row.ts)}</span>
      </div>
      <div className={`truncate text-xs ${pending ? "text-gray-200" : "text-gray-500"}`}>
        {newest.subject}
      </div>
      <span
        className={`w-fit rounded px-1.5 py-0.5 text-[9px] font-semibold ${
          pending ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-400"
        }`}
      >
        <span className="inline-flex items-center gap-1.5"><AppIcon id={pending ? "alert" : "check"} size={11} />{pending ? `${row.beats.length}-mail escalation — action required` : `On ITSM board · ${row.ticket.code}`}</span>
      </span>
    </button>
  );
}

function AmbientRow({ msg, active, onClick }: { msg: MailMessage; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-1 border-b border-edge/60 px-3 py-2.5 text-left ${
        active ? "bg-info/10" : msg.read ? "hover:bg-panelalt" : "bg-panelalt/60 hover:bg-panelalt"
      }`}
    >
      <div className="flex items-center gap-2">
        {!msg.read && <span className="h-2 w-2 shrink-0 rounded-full bg-info" />}
        <span className={`truncate text-[13px] ${msg.read ? "text-gray-300" : "font-semibold text-gray-100"}`}>
          {msg.from}
        </span>
        {msg.kind === "external" && (
          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-300">EXT</span>
        )}
        {msg.starred && <span className="text-amber-300">★</span>}
        <span className="ml-auto shrink-0 text-[10px] text-gray-500">{relativeTime(msg.ts)}</span>
      </div>
      <div className={`truncate text-xs ${msg.read ? "text-gray-500" : "text-gray-200"}`}>{msg.subject}</div>
    </button>
  );
}

// ── Readers ─────────────────────────────────────────────────────────────────

function IncidentReader({ row }: { row: Extract<Row, { kind: "incident" }> }) {
  const surface = useTicketStore((s) => s.surfaceTicket);
  const flagDomain = useInfraStore((s) => s.flagSenderDomain);
  const { ticket, beats } = row;
  const pending = ticket.mailOnly;

  return (
    <div className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-50">{beats[beats.length - 1].subject}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-300">
            {ticket.category} · {ticket.difficulty.replace(/_/g, " ")}
          </span>
          <span>SLA {Math.round(ticket.slaDuration / 60)}m</span>
          {!pending && <span className="font-mono text-info">{ticket.code}</span>}
        </div>
      </div>

      {/* Escalating thread, oldest first */}
      {beats.map((b, i) => (
        <div key={i} className="rounded-lg border border-edge bg-panelalt p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px]">
            <span className="font-medium text-gray-200">{b.from}</span>
            <span className="text-info">&lt;{b.fromEmail}&gt;</span>
            <span className="ml-auto text-gray-600">{b.ageMin}m ago</span>
          </div>
          <div className="mb-1 text-xs font-semibold text-gray-300">{b.subject}</div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-400">{b.body}</p>
        </div>
      ))}

      {/* Actions */}
      <div className="space-y-1.5 border-t border-edge pt-3">
        {ticket.origin === "mail" &&
          (pending ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Action</div>
              <button
                onClick={() => surface(ticket.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-left text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px]">ESCALATE</span>
                Accept this incident and open it on the ITSM dashboard
              </button>
            </>
          ) : (
            <div className="text-center text-[11px] text-emerald-300">
              <span className="inline-flex items-center gap-1.5"><AppIcon id="check" size={12} /> Escalated to the ITSM dashboard as {ticket.code}</span>
            </div>
          ))}

        {ticket.dynamicContext.senderDomain && (
          <FlagSenderButton domain={ticket.dynamicContext.senderDomain} onFlag={flagDomain} />
        )}
      </div>
    </div>
  );
}

function FlagSenderButton({ domain, onFlag }: { domain: string; onFlag: (d: string) => void }) {
  const flagged = useInfraStore((s) => s.infra.security.flaggedDomains);
  const isFlagged = flagged.includes(domain);
  return (
    <button
      onClick={() => onFlag(domain)}
      disabled={isFlagged}
      className="flex w-full items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-left text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="rounded bg-danger/20 px-1.5 py-0.5 text-[9px]">{isFlagged ? "FLAGGED" : "FLAG"}</span>
      {isFlagged ? `${domain} blocked org-wide` : `Flag ${domain} as malicious (blocks org-wide)`}
    </button>
  );
}

function AmbientReader({ msg }: { msg: MailMessage }) {
  const reply = useMailStore((s) => s.reply);
  const flagDomain = useInfraStore((s) => s.flagSenderDomain);
  const flagged = useInfraStore((s) => s.infra.security.flaggedDomains);
  const domain = msg.fromEmail.split("@")[1] ?? "";
  const isFlagged = flagged.includes(domain);

  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-50">{msg.subject}</h2>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="font-medium text-gray-300">{msg.from}</span>
          <span className="text-info">&lt;{msg.fromEmail}&gt;</span>
          {msg.department && <span className="rounded bg-gray-500/15 px-1.5 py-0.5">{msg.department}</span>}
          <span className="ml-auto">{new Date(msg.ts).toLocaleString()}</span>
        </div>
      </div>

      <div className="whitespace-pre-wrap rounded-lg border border-edge bg-panelalt p-4 text-[13px] leading-relaxed text-gray-300">
        {msg.body}
      </div>

      {msg.thread.map((t, i) => (
        <div
          key={i}
          className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] ${
            t.from === "you" ? "ml-auto bg-info/15 text-gray-100" : "bg-panelalt text-gray-300"
          }`}
        >
          <div className="mb-0.5 text-[10px] uppercase tracking-wider text-gray-500">
            {t.from === "you" ? "You" : msg.from}
          </div>
          {t.text}
        </div>
      ))}

      {msg.replies && msg.replies.length > 0 && (
        <div className="space-y-1.5 border-t border-edge pt-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Reply</div>
          {msg.replies.map((r) => (
            <button
              key={r.id}
              onClick={() => reply(msg.id, r.id)}
              className="w-full rounded-lg border border-edge bg-panelalt px-3 py-2 text-left text-xs text-gray-200 transition hover:border-info/50 hover:bg-info/10"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Phishing triage on any external sender */}
      {msg.kind === "external" && domain && (
        <div className="border-t border-edge pt-3">
          <button
            onClick={() => flagDomain(domain)}
            disabled={isFlagged}
            className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1.5"><AppIcon id={isFlagged ? "check" : "shield"} size={12} />{isFlagged ? `${domain} flagged` : `Flag ${domain} as malicious`}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-600">
      <span className="text-gray-600"><AppIcon id="mail" size={40} /></span>
      <span className="text-xs">Select a message to read.</span>
    </div>
  );
}
