"use client";

/**
 * CoreMail — corporate mailbox (Outlook-style, Level-0 host app)
 * -------------------------------------------------------------
 * Folder rail + message list + reading pane. Carries internal staff mail
 * (from the org's 100+ directory) and external ISP/vendor mail. Actionable
 * threads drive scenario tickets entirely through the email loop.
 */

import { useMemo } from "react";
import { useMailStore, type MailFolder, type MailMessage } from "@/lib/mail/store";
import { relativeTime } from "@/lib/host/ticket-ui";

const FOLDERS: { id: MailFolder; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "📥" },
  { id: "external", label: "External", icon: "🌐" },
  { id: "sent", label: "Sent", icon: "📤" },
];

export default function CoreMail() {
  const { messages, selectedId, folder, select, setFolder, markRead } = useMailStore();

  const filtered = useMemo(() => {
    if (folder === "external") return messages.filter((m) => m.kind === "external");
    if (folder === "sent") return messages.filter((m) => m.thread.some((t) => t.from === "you"));
    return messages.filter((m) => m.kind !== "sent");
  }, [messages, folder]);

  const unread = messages.filter((m) => !m.read).length;
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  function open(m: MailMessage) {
    select(m.id);
    markRead(m.id);
  }

  return (
    <div className="flex h-full bg-panel text-sm text-gray-200">
      {/* Folder rail */}
      <div className="w-40 shrink-0 border-r border-edge bg-panelalt">
        <div className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          CoreMail
        </div>
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
              folder === f.id ? "bg-info/15 text-info" : "text-gray-300 hover:bg-panel"
            }`}
          >
            <span>{f.icon}</span>
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
        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-600">No mail in this folder.</div>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => open(m)}
            className={`flex w-full flex-col gap-1 border-b border-edge/60 px-3 py-2.5 text-left ${
              selectedId === m.id ? "bg-info/10" : m.read ? "hover:bg-panelalt" : "bg-panelalt/60 hover:bg-panelalt"
            }`}
          >
            <div className="flex items-center gap-2">
              {!m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-info" />}
              <span className={`truncate text-[13px] ${m.read ? "text-gray-300" : "font-semibold text-gray-100"}`}>
                {m.from}
              </span>
              {m.kind === "external" && (
                <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-300">EXT</span>
              )}
              {m.starred && <span className="text-amber-300">★</span>}
              <span className="ml-auto shrink-0 text-[10px] text-gray-500">{relativeTime(m.ts)}</span>
            </div>
            <div className={`truncate text-xs ${m.read ? "text-gray-500" : "text-gray-200"}`}>{m.subject}</div>
            {m.scenarioId && m.replies && (
              <span className="w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                ⚡ Action required
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reading pane */}
      <div className="min-w-0 flex-1 overflow-y-auto term-scroll">
        {selected ? <Reader msg={selected} /> : <Empty />}
      </div>
    </div>
  );
}

function Reader({ msg }: { msg: MailMessage }) {
  const reply = useMailStore((s) => s.reply);
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

      {/* Thread follow-ups */}
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

      {/* Reply actions (actionable mail only) */}
      {msg.replies && msg.replies.length > 0 && (
        <div className="space-y-1.5 border-t border-edge pt-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Reply</div>
          {msg.replies.map((r) => (
            <button
              key={r.id}
              onClick={() => reply(msg.id, r.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-edge bg-panelalt px-3 py-2 text-left text-xs text-gray-200 transition hover:border-info/50 hover:bg-info/10"
            >
              {r.effect === "accept-linked-ticket" && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                  OPEN TICKET
                </span>
              )}
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      )}
      {msg.replies === undefined && msg.thread.length > 0 && (
        <div className="border-t border-edge pt-3 text-center text-[11px] text-gray-600">
          Thread closed — handled via CoreMail.
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-600">
      <span className="text-4xl">📧</span>
      <span className="text-xs">Select a message to read.</span>
    </div>
  );
}
