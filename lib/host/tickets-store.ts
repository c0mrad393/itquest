/**
 * TriageOS — Ticket store (Level 0 ITSM)
 * ======================================
 * Holds the operator's ticket queue, selection, and (procedural content engine)
 * the matrix-generated starter queue for the current world. Tier 2/3 tickets
 * are minted mail-only and surface to the dashboard once promoted from CoreMail.
 */

"use client";

import { create } from "zustand";
import type { Ticket, TicketStatus, TicketTrack, TicketSeverity, TicketCategory } from "@/lib/core";
import { useInfraStore } from "@/lib/infra/store";
import { generateTicketQueue, applyQueueFaults } from "@/lib/tickets/factory";
import type { EmailBeat } from "@/lib/tickets/matrix";

export interface TicketFilters {
  track: TicketTrack | "all";
  severity: TicketSeverity | "all";
  category: TicketCategory | "all";
  query: string;
  /** Hide resolved/closed tickets by default. */
  showClosed: boolean;
}

interface TicketStore {
  tickets: Ticket[];
  /** Escalating CoreMail threads for mail-origin tickets, keyed by ticket id. */
  mailThreads: Record<string, EmailBeat[]>;
  selectedId: string | null;
  filters: TicketFilters;

  select: (id: string | null) => void;
  setFilter: <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => void;
  setStatus: (id: string, status: TicketStatus) => void;
  accept: (id: string, assignee: string) => void;
  escalate: (id: string) => void;
  resolve: (id: string) => void;
  /** Promote a mail-only ticket onto the ITSM dashboard (from CoreMail). */
  surfaceTicket: (id: string) => void;

  /**
   * Spend one hint step on a ticket. Irreversible — the count feeds the XP
   * penalty at resolution, so revealing is a real cost, not a UI toggle.
   */
  revealHint: (id: string) => void;
  /** Commit to (or leave) Hard Mode. Blocked once a hint has been spent. */
  setHardMode: (id: string, on: boolean) => void;
}

/** Build the initial queue for the current world + inject its faults. */
function initQueue() {
  const infra = useInfraStore.getState().infra;
  const { tickets, emailThreads, faults } = generateTicketQueue(infra);
  if (faults.length) {
    useInfraStore.getState().setInfra(applyQueueFaults(infra, faults));
  }
  // Dashboard tickets get a default selection; mail-only ones stay hidden.
  const firstDashboard = tickets.find((t) => !t.mailOnly);
  return { tickets, mailThreads: emailThreads, selectedId: firstDashboard?.id ?? null };
}

const seed = initQueue();

export const useTicketStore = create<TicketStore>((set) => ({
  tickets: seed.tickets,
  mailThreads: seed.mailThreads,
  selectedId: seed.selectedId,
  filters: { track: "all", severity: "all", category: "all", query: "", showClosed: false },

  select: (id) => set({ selectedId: id }),

  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),

  setStatus: (id, status) =>
    set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status } : t)) })),

  accept: (id, assignee) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? { ...t, status: "accepted", assignee, clock: { ...t.clock, startedAt: t.clock.startedAt ?? Date.now() } }
          : t,
      ),
    })),

  escalate: (id) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id ? { ...t, status: "escalated", escalationCount: t.escalationCount + 1 } : t,
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

  revealHint: (id) =>
    set((s) => ({
      tickets: s.tickets.map((t) => {
        if (t.id !== id) return t;
        const total = t.hints?.length ?? 0;
        if (t.hardMode || t.hintsRevealed >= total) return t;
        return { ...t, hintsRevealed: t.hintsRevealed + 1 };
      }),
    })),

  setHardMode: (id, on) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        // Committing after spending hints would erase a penalty already earned.
        t.id === id && !(on && t.hintsRevealed > 0) ? { ...t, hardMode: on } : t,
      ),
    })),

  surfaceTicket: (id) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? { ...t, mailOnly: false, status: "accepted", assignee: "O. Kharebashvili", clock: { ...t.clock, startedAt: t.clock.startedAt ?? Date.now() } }
          : t,
      ),
      selectedId: id,
    })),
}));

/**
 * Pure selector: apply active filters + hide mail-only (un-promoted) tickets
 * from the dashboard. CoreMail reads mail-only tickets directly.
 */
export function applyFilters(tickets: Ticket[], f: TicketFilters): Ticket[] {
  const q = f.query.trim().toLowerCase();
  return tickets.filter((t) => {
    if (t.mailOnly) return false; // not yet promoted to the board
    if (f.track !== "all" && t.track !== f.track) return false;
    if (f.severity !== "all" && t.severity !== f.severity) return false;
    if (f.category !== "all" && t.category !== f.category) return false;
    if (!f.showClosed && (t.status === "resolved" || t.status === "closed")) return false;
    if (q && !`${t.code} ${t.title} ${t.requester.name}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
