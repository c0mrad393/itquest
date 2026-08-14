"use client";

/**
 * Mail — customer conversation client (Phase 5)
 * ---------------------------------------------
 * Threads per ticket with the AI persona. Shows the persona's live emotional
 * state + CSAT, a message history, an SLA countdown, and branching reply
 * options that shift the customer's mood. This is the human side of the sim:
 * technical fixes resolve tickets, but how you talk to people drives CSAT → XP.
 */

import { useState } from "react";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { getPersona } from "@/lib/dialogue/personas";
import { DIALOGUE_TREES } from "@/lib/dialogue/trees";
import { EMOTION_META, type Conversation } from "@/lib/dialogue/types";
import { useNow } from "@/lib/sla/store";
import { slaSnapshot } from "@/lib/host/ticket-ui";
import { AppIcon } from "@/components/ui/app-icons";
import { useHostStore } from "@/lib/host/store";
import Avatar from "../Avatar";

export default function Mail() {
  const conversations = useDialogueStore((s) => s.conversations);
  const markRead = useDialogueStore((s) => s.markRead);
  const tickets = useTicketStore((s) => s.tickets);

  const list = Object.values(conversations).sort((a, b) => {
    const ta = tickets.find((t) => t.id === a.ticketId)?.createdAt ?? 0;
    const tb = tickets.find((t) => t.id === b.ticketId)?.createdAt ?? 0;
    return tb - ta;
  });

  const [selectedId, setSelectedId] = useState<string | null>(list[0]?.ticketId ?? null);
  const selected = selectedId ? conversations[selectedId] : null;

  function open(id: string) {
    setSelectedId(id);
    markRead(id);
  }

  return (
    <div className="flex h-full bg-panel text-sm text-gray-200">
      {/* Thread list */}
      <div className="w-72 shrink-0 overflow-y-auto term-scroll border-r border-edge">
        <div className="border-b border-edge bg-panelalt px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Inbox
        </div>
        {list.map((conv) => {
          const persona = getPersona(conv.personaId);
          const ticket = tickets.find((t) => t.id === conv.ticketId);
          const emo = EMOTION_META[conv.emotion];
          return (
            <button
              key={conv.ticketId}
              onClick={() => open(conv.ticketId)}
              className={`flex w-full items-start gap-2.5 border-b border-edge/60 px-3 py-2.5 text-left ${
                selectedId === conv.ticketId ? "bg-info/10" : "hover:bg-panelalt"
              }`}
            >
              <div className="relative">
                <Avatar value={persona?.avatar ?? "slate"} name={persona?.name ?? "Requester"} className="h-8 w-8" />
                {conv.unread > 0 && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate font-semibold text-gray-100">{persona?.name}</span>
                  <span className={`ml-auto rounded px-1 py-0.5 text-[9px] ${emo.color}`}>
                    <AppIcon id={emo.iconId} size={12} />
                  </span>
                </div>
                <div className="truncate text-[11px] text-gray-500">
                  {ticket?.code} · {ticket?.title}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <Thread conv={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-600">
            Select a conversation.
          </div>
        )}
      </div>
    </div>
  );
}

function Thread({ conv }: { conv: Conversation }) {
  const operator = useHostStore((s) => s.host.user);
  const choose = useDialogueStore((s) => s.choose);
  const tickets = useTicketStore((s) => s.tickets);
  const now = useNow();

  const persona = getPersona(conv.personaId);
  const ticket = tickets.find((t) => t.id === conv.ticketId);
  const emo = EMOTION_META[conv.emotion];
  const tree = DIALOGUE_TREES[conv.scenarioId];
  const node = conv.currentNodeId ? tree?.nodes[conv.currentNodeId] : null;
  const sla = ticket ? slaSnapshot(ticket, now) : null;

  const gate = (req?: "accepted" | "resolved") => {
    if (!req || !ticket) return true;
    if (req === "resolved") return ticket.status === "resolved";
    return ticket.status !== "new";
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-edge bg-panelalt px-4 py-2.5">
        <span className="text-2xl">{persona?.avatar}</span>
        <div>
          <div className="font-semibold text-gray-100">{persona?.name}</div>
          <div className="text-[11px] text-gray-500">
            {persona?.role} · {persona?.org}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {ticket && sla && ticket.status !== "resolved" && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${sla.breached ? "text-danger" : "text-gray-400"}`}>
              <AppIcon id="clock" size={11} /> {sla.label}
            </span>
          )}
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${emo.color}`}>
            <AppIcon id={emo.iconId} size={12} /> {emo.label}
          </span>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-gray-500">CSAT</div>
            <div className={`text-sm font-bold ${csatColor(conv.csat)}`}>{Math.round(conv.csat)}%</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="term-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {conv.messages.map((m) => (
          <MessageBubble
            key={m.id}
            from={m.from}
            text={m.text}
            avatar={persona?.avatar ?? "slate"}
            name={persona?.name ?? "Requester"}
            operator={operator}
          />
        ))}
      </div>

      {/* Reply options */}
      <div className="border-t border-edge p-3">
        {node?.options && node.options.length > 0 ? (
          <div className="space-y-1.5">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Your reply</div>
            {node.options
              .filter((o) => gate(o.requires))
              .map((o) => (
                <button
                  key={o.id}
                  onClick={() => choose(conv.ticketId, o.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-edge bg-panelalt px-3 py-2 text-left text-xs text-gray-200 transition hover:border-info/50 hover:bg-info/10"
                >
                  {o.tone && (
                    <span className="rounded bg-sunken/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gray-500">
                      {o.tone}
                    </span>
                  )}
                  <span>{o.label}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="px-1 py-2 text-center text-[11px] text-gray-600">
            {conv.closed
              ? "Conversation closed — ticket resolved."
              : "Waiting on your technical action to progress this incident…"}
          </div>
        )}
      </div>
    </>
  );
}

function MessageBubble({
  from,
  text,
  avatar,
  name,
  operator,
}: {
  from: string;
  text: string;
  avatar: string;
  name: string;
  operator: { displayName: string; avatar: string };
}) {
  if (from === "system") {
    return (
      <div className="mx-auto max-w-[85%] rounded-lg border border-info/25 bg-info/10 px-3 py-1.5 text-center text-[11px] text-info">
        {text}
      </div>
    );
  }
  const mine = from === "you";
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      <Avatar
        value={mine ? operator.avatar : avatar}
        name={mine ? operator.displayName : name}
        className="h-6 w-6"
      />
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
          mine ? "rounded-br-sm bg-info/20 text-gray-100" : "rounded-bl-sm bg-panelalt text-gray-200"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function csatColor(csat: number): string {
  if (csat >= 75) return "text-emerald-300";
  if (csat >= 50) return "text-amber-300";
  return "text-danger";
}
