/**
 * TriageOS — Ticket store (Level 0 ITSM)
 * ======================================
 * Holds the operator's ticket queue and selection. Phase 2 supports selection
 * and basic lifecycle transitions (accept / escalate) so the Ticket Center is
 * genuinely interactive; the live SLA countdown and scenario/win-condition
 * binding land in Phase 5, and persistence in Phase 6.
 */

"use client";

import { create } from "zustand";
import type { Ticket, TicketStatus, TicketTrack, TicketSeverity } from "@/lib/core";
import { createSeedTickets } from "./seed";
import { useInfraStore } from "@/lib/infra/store";

export interface TicketFilters {
  track: TicketTrack | "all";
  severity: TicketSeverity | "all";
  query: string;
  /** Hide resolved/closed tickets by default. */
  showClosed: boolean;
}

interface TicketStore {
  tickets: Ticket[];
  selectedId: string | null;
  filters: TicketFilters;

  select: (id: string | null) => void;
  setFilter: <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => void;
  setStatus: (id: string, status: TicketStatus) => void;
  accept: (id: string, assignee: string) => void;
  escalate: (id: string) => void;
  /** Mark resolved (win-condition met) — records resolvedAt on the SLA clock. */
  resolve: (id: string) => void;
  /** Create a ticket originated from a CoreMail email loop (mail-resolved). */
  addMailTicket: (scenarioId: string, subject: string, from: string) => void;
}

export const useTicketStore = create<TicketStore>((set) => ({
  tickets: createSeedTickets(useInfraStore.getState().infra),
  selectedId: "t-4821",
  filters: { track: "all", severity: "all", query: "", showClosed: false },

  select: (id) => set({ selectedId: id }),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  setStatus: (id, status) =>
    set((s) => ({
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  accept: (id, assignee) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "accepted",
              assignee,
              clock: { ...t.clock, startedAt: t.clock.startedAt ?? Date.now() },
            }
          : t,
      ),
    })),

  escalate: (id) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? { ...t, status: "escalated", escalationCount: t.escalationCount + 1 }
          : t,
      ),
    })),

  resolve: (id) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? { ...t, status: "resolved", clock: { ...t.clock, resolvedAt: t.clock.resolvedAt ?? Date.now() } }
          : t,
      ),
    })),

  addMailTicket: (scenarioId, subject, from) =>
    set((s) => {
      // Idempotent per scenario (one mail loop → one ticket).
      if (s.tickets.some((t) => t.scenarioId === scenarioId)) return s;
      const n = 4830 + s.tickets.length;
      const org = useInfraStore.getState().infra.org;
      const ticket: Ticket = {
        id: `t-mail-${scenarioId}`,
        code: `TCK-${n}`,
        title: subject,
        description: `Opened via CoreMail from ${from}. Tracked and resolved through the email thread.`,
        track: "netops",
        severity: "medium",
        priority: "P3",
        status: "in_progress",
        clientOrg: org.name,
        requester: { name: from, role: "External correspondent", email: "", department: "External" },
        targetNodeIds: [],
        scenarioId,
        personaId: "persona-marcus-calm",
        sla: { responseSeconds: 30 * 60, resolutionSeconds: 4 * 3600 },
        clock: { startedAt: Date.now(), respondedAt: Date.now(), resolvedAt: null, responseBreached: false, resolutionBreached: false },
        createdAt: Date.now(),
        assignee: "O. Kharebashvili",
        tags: ["mail-originated", "isp", "bandwidth"],
        xpReward: 220,
        escalationCount: 0,
      };
      return { tickets: [ticket, ...s.tickets] };
    }),
}));

/** Pure selector: apply active filters to a ticket list. */
export function applyFilters(tickets: Ticket[], f: TicketFilters): Ticket[] {
  const q = f.query.trim().toLowerCase();
  return tickets.filter((t) => {
    if (f.track !== "all" && t.track !== f.track) return false;
    if (f.severity !== "all" && t.severity !== f.severity) return false;
    if (!f.showClosed && (t.status === "resolved" || t.status === "closed")) return false;
    if (q && !(`${t.code} ${t.title} ${t.requester.name}`.toLowerCase().includes(q)))
      return false;
    return true;
  });
}
