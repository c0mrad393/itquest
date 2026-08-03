/**
 * TriageOS — Session persistence (Phase 6)
 * ========================================
 * Serializes the live simulation to LocalStorage and hydrates it on boot.
 * Everything persisted is plain JSON — a guarantee designed in since Phase 1
 * (no class instances, epoch-millis timestamps), so capture/apply is a straight
 * snapshot of the stores:
 *
 *   infra          — every node's full state (services, AD, filesystem, …)
 *   tickets        — queue incl. SLA clocks (absolute timestamps ⇒ countdowns
 *                    survive a reload correctly)
 *   conversations  — dialogue history, emotion meters, CSAT
 *   sla flags      — which tickets already warned/breached
 *   operator       — XP / level progression
 */

"use client";

import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useSlaStore } from "@/lib/sla/store";
import { useMailStore, type MailMessage } from "@/lib/mail/store";
import { useHostStore } from "@/lib/host/store";
import type { HostUser, InfrastructureState, Ticket } from "@/lib/core";
import type { Conversation } from "@/lib/dialogue/types";
import type { EmailBeat } from "@/lib/tickets/matrix";

const BASE_KEY = "triageos-save";
const VERSION = 13;

/**
 * Save-slot scope (per-account saves). Set by the auth layer BEFORE the
 * desktop mounts, so hydration reads the signed-in user's slot ("guest" for
 * guest sessions).
 */
let scope = "guest";

export function setSaveScope(next: string): void {
  scope = next;
}

function storageKey(): string {
  return `${BASE_KEY}::${scope}`;
}

export interface PersistedState {
  version: number;
  savedAt: number;
  infra: InfrastructureState;
  tickets: Ticket[];
  conversations: Record<string, Conversation>;
  dialogueSeq: number;
  slaWarned: Record<string, boolean>;
  slaBreached: Record<string, boolean>;
  mail: MailMessage[];
  mailThreads: Record<string, EmailBeat[]>;
  user: HostUser;
  /** Personalization — desktop wallpaper id (see lib/host/wallpapers.ts). */
  wallpaper: string;
}

/** Snapshot every persistent store. */
export function capture(): PersistedState {
  return {
    version: VERSION,
    savedAt: Date.now(),
    infra: useInfraStore.getState().infra,
    tickets: useTicketStore.getState().tickets,
    conversations: useDialogueStore.getState().conversations,
    dialogueSeq: useDialogueStore.getState().seq,
    slaWarned: useSlaStore.getState().warned,
    slaBreached: useSlaStore.getState().breached,
    mail: useMailStore.getState().messages,
    mailThreads: useTicketStore.getState().mailThreads,
    user: useHostStore.getState().host.user,
    wallpaper: useHostStore.getState().host.wallpaper,
  };
}

export function saveNow(): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(capture()));
  } catch {
    // Storage full/unavailable — the sim keeps running unpersisted.
  }
}

export function loadSave(): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    // Schema gate: discard incompatible saves rather than half-hydrate.
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Push a saved snapshot into the live stores. */
export function applySave(s: PersistedState): void {
  useInfraStore.setState({ infra: s.infra });
  useTicketStore.setState({ tickets: s.tickets, mailThreads: s.mailThreads ?? {} });
  useDialogueStore.setState({ conversations: s.conversations, seq: s.dialogueSeq });
  useSlaStore.setState({ warned: s.slaWarned, breached: s.slaBreached });
  if (s.mail) useMailStore.setState({ messages: s.mail });
  useHostStore.setState((st) => ({
    host: { ...st.host, user: s.user, wallpaper: s.wallpaper ?? st.host.wallpaper },
  }));
}

export function savedAt(): number | null {
  return loadSave()?.savedAt ?? null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* noop */
  }
}

/** Wipe the save and reboot the workstation into a fresh scenario pack. */
export function resetSimulation(): void {
  clearSave();
  window.location.reload();
}
