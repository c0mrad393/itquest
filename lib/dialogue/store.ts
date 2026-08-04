/**
 * TriageOS — Dialogue store
 * =========================
 * One Conversation per ticket. Operator replies advance the tree and move the
 * emotion meter + CSAT; system events (accepted / resolved / SLA warning /
 * breach) inject scripted lines and shift emotion. The persona's live emotion
 * is what the Ticket Center and Mail client display.
 */

"use client";

import { create } from "zustand";
import { useTicketStore } from "@/lib/host/tickets-store";
import { getPersona } from "./personas";
import { DIALOGUE_TREES } from "./trees";
import {
  EMOTION_BASE,
  meterToEmotion,
  type Conversation,
  type Message,
} from "./types";

type SystemEvent = "accepted" | "resolved" | "sla-warning" | "sla-breach";

interface DialogueStore {
  conversations: Record<string, Conversation>; // keyed by ticketId
  seq: number;

  choose: (ticketId: string, optionId: string) => void;
  markRead: (ticketId: string) => void;
  event: (ticketId: string, kind: SystemEvent) => void;
  /** Append a system note (e.g. a scoring summary) to a thread. */
  note: (ticketId: string, text: string) => void;
  /**
   * Open threads for tickets that do not have one yet (tiers unlocked on
   * promotion). Additive on purpose — rebuilding would discard the emotion and
   * CSAT history of every conversation already in flight.
   */
  syncConversations: () => void;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

/** Higher difficulty → more agitated starting mood. */
const DIFFICULTY_METER_SHIFT: Record<string, number> = {
  Tier_1_Easy: 4,
  Tier_2_Medium: -6,
  Tier_3_Hard: -18,
  Tier_4_Expert: -26,
};

function buildConversations(only?: Set<string>): Record<string, Conversation> {
  const out: Record<string, Conversation> = {};
  for (const ticket of useTicketStore.getState().tickets) {
    if (only && !only.has(ticket.id)) continue;
    const persona = getPersona(ticket.personaId);
    if (!persona) continue;
    // Authored branching tree if one exists for this scenario; otherwise the
    // conversation opens with the ticket's own description (no branches).
    const tree = DIALOGUE_TREES[ticket.scenarioId];
    const opening = tree ? tree.nodes[tree.start].text : ticket.description;
    const meter = Math.max(
      6,
      Math.min(100, EMOTION_BASE[persona.baseline] + (DIFFICULTY_METER_SHIFT[ticket.difficulty] ?? 0)),
    );
    out[ticket.id] = {
      ticketId: ticket.id,
      personaId: ticket.personaId,
      scenarioId: ticket.scenarioId,
      messages: [{ id: 0, from: "customer", text: opening, ts: ticket.createdAt }],
      currentNodeId: tree ? tree.start : null,
      meter,
      csat: 70,
      emotion: meterToEmotion(meter),
      unread: 1,
      closed: ticket.status === "resolved" || ticket.status === "closed",
    };
  }
  return out;
}

const SYSTEM_LINES: Record<SystemEvent, (name: string) => { from: Message["from"]; text: string; meter: number; csat: number }> = {
  accepted: (name) => ({
    from: "system",
    text: `${name} was notified that an engineer has picked up the ticket.`,
    meter: 4,
    csat: 3,
  }),
  resolved: (name) => ({
    from: "customer",
    text: `It's working again — thank you so much! You just saved me. Really appreciate how fast that was.`,
    meter: 40,
    csat: 22,
  }),
  "sla-warning": () => ({
    from: "system",
    text: `SLA warning: resolution target approaching.`,
    meter: -8,
    csat: -6,
  }),
  "sla-breach": (name) => ({
    from: "customer",
    text: `This has gone past the promised time and I still can't work. This is really not good enough.`,
    meter: -24,
    csat: -25,
  }),
};

export const useDialogueStore = create<DialogueStore>((set, get) => ({
  conversations: buildConversations(),
  seq: 1000,

  choose: (ticketId, optionId) => {
    const conv = get().conversations[ticketId];
    if (!conv || !conv.currentNodeId) return;
    const tree = DIALOGUE_TREES[conv.scenarioId];
    const node = tree?.nodes[conv.currentNodeId];
    const option = node?.options?.find((o) => o.id === optionId);
    if (!option) return;

    set((s) => {
      let seq = s.seq;
      const msgs: Message[] = [{ id: seq++, from: "you", text: option.label, ts: Date.now() }];

      const nextNode = option.next ? tree.nodes[option.next] : null;
      if (nextNode) {
        msgs.push({ id: seq++, from: "customer", text: nextNode.text, ts: Date.now() + 1 });
      }

      const meter = clamp(conv.meter + (option.meter ?? 0));
      const csat = clamp(conv.csat + (option.csat ?? 0));

      return {
        seq,
        conversations: {
          ...s.conversations,
          [ticketId]: {
            ...conv,
            messages: [...conv.messages, ...msgs],
            currentNodeId: nextNode ? nextNode.id : null,
            meter,
            csat,
            emotion: meterToEmotion(meter),
          },
        },
      };
    });
  },

  markRead: (ticketId) =>
    set((s) => {
      const conv = s.conversations[ticketId];
      if (!conv || conv.unread === 0) return s;
      return { conversations: { ...s.conversations, [ticketId]: { ...conv, unread: 0 } } };
    }),

  note: (ticketId, text) =>
    set((s) => {
      const conv = s.conversations[ticketId];
      if (!conv) return s;
      return {
        seq: s.seq + 1,
        conversations: {
          ...s.conversations,
          [ticketId]: {
            ...conv,
            messages: [...conv.messages, { id: s.seq, from: "system", text, ts: Date.now() }],
          },
        },
      };
    }),

  event: (ticketId, kind) => {
    const conv = get().conversations[ticketId];
    if (!conv) return;
    // Don't re-fire resolution chatter on an already-closed thread.
    if (kind === "resolved" && conv.closed) return;

    const persona = getPersona(conv.personaId);
    const line = SYSTEM_LINES[kind](persona?.name ?? "The customer");

    set((s) => {
      const meter = clamp(conv.meter + line.meter);
      const csat = clamp(conv.csat + line.csat);
      return {
        seq: s.seq + 1,
        conversations: {
          ...s.conversations,
          [ticketId]: {
            ...conv,
            messages: [...conv.messages, { id: s.seq, from: line.from, text: line.text, ts: Date.now() }],
            meter,
            csat,
            emotion: meterToEmotion(meter),
            unread: conv.unread + 1,
            currentNodeId: kind === "resolved" ? null : conv.currentNodeId,
            closed: kind === "resolved" ? true : conv.closed,
          },
        },
      };
    });
  },

  syncConversations: () =>
    set((st) => {
      const missing = new Set(
        useTicketStore
          .getState()
          .tickets.filter((t) => !st.conversations[t.id])
          .map((t) => t.id),
      );
      if (missing.size === 0) return st;
      return { conversations: { ...st.conversations, ...buildConversations(missing) } };
    }),
}));
