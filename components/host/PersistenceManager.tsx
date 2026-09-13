"use client";

/**
 * PersistenceManager — headless save/restore
 * ------------------------------------------
 * On mount: hydrates all stores from LocalStorage (if a compatible save
 * exists), says so when one exists but cannot be read, then autosaves on any
 * change to the persistent stores.
 *
 * Mounted FIRST among the host desktop's headless engines so hydration lands
 * before the reconciler/SLA/network engines evaluate anything.
 *
 * THROTTLE (not debounce): the NetworkEngine mutates the infra store's link
 * metrics every couple of seconds, and the org's 100+ user directory makes a
 * full serialize non-trivial — so we cap writes to once per SAVE_INTERVAL_MS
 * (leading + trailing). Meaningful mutations (service fixes, AD unlocks, XP,
 * dialogue) still persist within that window; transient metric jitter doesn't
 * hammer storage. The SLA store (1 Hz `now`) is intentionally not subscribed.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useMailStore } from "@/lib/mail/store";
import { useHostStore } from "@/lib/host/store";
import { applySave, readSlot, saveNow } from "@/lib/persistence/save";
import { useNotificationStore } from "@/lib/host/notifications-store";

const SAVE_INTERVAL_MS = 4000;

export default function PersistenceManager() {
  useEffect(() => {
    const slot = readSlot();
    if (slot.kind === "ok") applySave(slot.state);

    /*
     * A SAVE THIS BUILD CANNOT READ IS NOT A SILENT EVENT.
     *
     * The autosave below starts within four seconds of this line and writes
     * over whatever is in the slot. Until now that is exactly what happened to
     * an estate from an older build: it was read as `null`, nothing was
     * applied, nothing was said, and it was gone before the operator had
     * finished reading the dashboard.
     *
     * `readSlot` has already copied it aside. This says so — including when
     * it could NOT, which is the one version of this message that must never
     * be optimistic.
     */
    if (slot.kind === "kept") {
      const from = slot.version === null ? "an older build" : `build v${slot.version}`;
      useNotificationStore.getState().push({
        kind: "warning",
        title: "Your previous estate could not be loaded",
        body: slot.keptAs
          ? `It was saved by ${from} and this build reads a different shape. The old data has been kept aside rather than overwritten, and this session has started fresh.`
          : `It was saved by ${from} and this build reads a different shape. There was not enough room to keep a copy, so starting a new session will replace it.`,
        badge: slot.keptAs ? "Kept" : "Not kept",
      });
    }

    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const elapsed = Date.now() - last;
      if (elapsed >= SAVE_INTERVAL_MS) {
        last = Date.now();
        saveNow();
      } else if (!trailing) {
        trailing = setTimeout(() => {
          trailing = undefined;
          last = Date.now();
          saveNow();
        }, SAVE_INTERVAL_MS - elapsed);
      }
    };

    const unsubs = [
      useInfraStore.subscribe(schedule),
      useTicketStore.subscribe(schedule),
      useDialogueStore.subscribe(schedule),
      useMailStore.subscribe(schedule),
      useHostStore.subscribe(schedule),
    ];

    return () => {
      if (trailing) clearTimeout(trailing);
      unsubs.forEach((u) => u());
    };
  }, []);

  return null;
}
