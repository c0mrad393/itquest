"use client";

/**
 * PersistenceManager — headless save/restore
 * ------------------------------------------
 * On mount: hydrates all stores from LocalStorage (if a compatible save
 * exists). Then autosaves on any change to the persistent stores.
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
import { applySave, loadSave, saveNow } from "@/lib/persistence/save";

const SAVE_INTERVAL_MS = 4000;

export default function PersistenceManager() {
  useEffect(() => {
    const saved = loadSave();
    if (saved) applySave(saved);

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
