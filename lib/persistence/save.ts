/**
 * ITQuest — Session persistence (Phase 6)
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
import { setAudioEnabled } from "@/lib/audio/engine";
import type { HostUser, InfrastructureState, Ticket } from "@/lib/core";
import type { Conversation } from "@/lib/dialogue/types";
import type { EmailBeat } from "@/lib/tickets/matrix";
import { decodeSlot, type Migrations } from "./slot";

const BASE_KEY = "triageos-save";
const VERSION = 28;

/**
 * Save-slot scope (per-account saves).
 *
 * ── THE DEFAULT IS THE REAL ONE, AND THAT IS NOT A DETAIL ───────────────────
 *
 * This was `"guest"`, a placeholder left behind when the auth layer was
 * removed, on the understanding that something would call `setSaveScope`
 * before anything read. Something does — `useSessionStore.hydrate()`, from an
 * effect in HostDesktop. But PersistenceManager is a CHILD of HostDesktop,
 * and React runs child effects before parent effects, so the read happened
 * first, against `triageos-save::guest`, which never held anything.
 *
 * The result: every visit to /desktop found an empty slot, generated a brand
 * new estate, and four seconds later wrote it over the real save at
 * `::local`. The estate did not survive a single reload — and the comment
 * above PersistenceManager, "hydrate before evaluating", describes exactly
 * the ordering that caused it. Arriving via the landing page masked it,
 * because that page calls `hasSavedGame()` on mount and sets the scope as a
 * side effect.
 *
 * So the default is now the scope the application actually uses. Nothing has
 * to run in the right order for a read and a write to agree on a key, which
 * is the only version of this that can be relied on. `setSaveScope` stays for
 * when accounts arrive and there is more than one slot to choose between —
 * and it must then be called before the desktop MOUNTS, not from inside it.
 */
let scope = "local";

export function setSaveScope(next: string): void {
  scope = next;
}

function storageKey(): string {
  return `${BASE_KEY}::${scope}`;
}

/**
 * The slot everything else should hang off.
 *
 * The save is per-account; the plan and the shift counter were not, which is
 * a bug that cannot show itself until there is a second account and is then
 * very hard to see. See `lib/platform/entitlements.ts`.
 */
export function saveScope(): string {
  return scope;
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
  /** Personalization — UI sound cues on/off. */
  soundEnabled: boolean;
  /** Purchased software licences (operator-owned, survives a world reset). */
  licenses: string[];
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
    soundEnabled: useHostStore.getState().host.soundEnabled,
    licenses: useHostStore.getState().host.licenses,
  };
}

export function saveNow(): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(capture()));
  } catch {
    // Storage full/unavailable — the sim keeps running unpersisted.
  }
}

/**
 * WHAT READING THE SLOT ACTUALLY FOUND.
 *
 * `loadSave` used to answer this question with `null` for all four cases —
 * nothing saved, unreadable, too old, and fine — which is how a version bump
 * came to mean silent, total destruction of somebody's estate. The read
 * returned null, PersistenceManager applied nothing, and its autosave
 * overwrote the old blob about four seconds later. No message, no backup, no
 * way back. It has happened twenty-eight times; with no players that cost
 * nothing, and with one player it is unforgivable.
 *
 * It also shaped the code around it. At least four modules carry comments
 * explaining that they deliberately did NOT bump the version because of what
 * a bump destroys — a schema decision being driven by the absence of a
 * migration path.
 */
export type SlotRead =
  | { kind: "empty" }
  | { kind: "ok"; state: PersistedState }
  | {
      kind: "kept";
      reason: "outdated" | "unreadable";
      /** The version it was written by, where that could be read. */
      version: number | null;
      savedAt: number | null;
      /**
       * Where the old blob now lives — or null when it could not be kept,
       * which is said plainly rather than assumed. Storage can be full, and
       * claiming a backup that does not exist is worse than admitting one
       * was not made.
       */
      keptAs: string | null;
    };

/**
 * Forward migrations, keyed by the version they UPGRADE FROM.
 *
 * Empty today, because the twenty-eight bumps behind us left no record of
 * what the old shapes were and inventing one now would be fiction. It exists
 * so the next bump has somewhere to go: add `28: (s) => ({ ...s, version: 29,
 * … })` and a save written by 28 walks forward instead of being archived.
 *
 * The walk itself, and the decision around it, live in `slot.ts` — pure, and
 * therefore actually tested.
 */
const MIGRATIONS: Migrations<PersistedState> = {};

/** Move a blob we cannot use out of the way of the autosave that would eat it. */
function keepAside(raw: string, version: number | null): string | null {
  const key = `${storageKey()}::kept-v${version ?? "unknown"}`;
  try {
    localStorage.setItem(key, raw);
    return key;
  } catch {
    // Storage refused — most likely full, quite possibly BECAUSE of the blob
    // we are trying to copy. Nothing was kept, and the caller is told so.
    return null;
  }
}

/** The full answer. `loadSave` is the shorthand over it. */
export function readSlot(): SlotRead {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey());
  } catch {
    return { kind: "empty" };
  }

  const decoded = decodeSlot<PersistedState>(raw, VERSION, MIGRATIONS);
  if (decoded.kind === "empty") return { kind: "empty" };

  if (decoded.kind === "ok") {
    // Write an upgraded shape back, so the walk happens once rather than on
    // every read for the rest of this save's life.
    if (decoded.migrated) {
      try {
        localStorage.setItem(storageKey(), JSON.stringify(decoded.state));
      } catch {
        /* The migration still stands for this session. */
      }
    }
    return { kind: "ok", state: decoded.state };
  }

  return {
    kind: "kept",
    reason: decoded.reason,
    version: decoded.version,
    savedAt: decoded.savedAt,
    keptAs: keepAside(raw ?? "", decoded.version),
  };
}

export function loadSave(): PersistedState | null {
  const r = readSlot();
  return r.kind === "ok" ? r.state : null;
}

/** Push a saved snapshot into the live stores. */
export function applySave(s: PersistedState): void {
  useInfraStore.setState({ infra: s.infra });
  useTicketStore.setState({ tickets: s.tickets, mailThreads: s.mailThreads ?? {} });
  useDialogueStore.setState({ conversations: s.conversations, seq: s.dialogueSeq });
  useSlaStore.setState({ warned: s.slaWarned, breached: s.slaBreached });
  if (s.mail) useMailStore.setState({ messages: s.mail });
  useHostStore.setState((st) => ({
    host: {
      ...st.host,
      user: s.user,
      wallpaper: s.wallpaper ?? st.host.wallpaper,
      soundEnabled: s.soundEnabled ?? st.host.soundEnabled,
      licenses: s.licenses ?? st.host.licenses,
    },
  }));
  // The audio engine caches the flag so playCue() stays a plain call — push the
  // hydrated preference into it or a muted session comes back unmuted.
  setAudioEnabled(useHostStore.getState().host.soundEnabled);
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
