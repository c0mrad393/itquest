"use client";

/**
 * PersistenceManager — headless save/restore (Phase 6)
 * ----------------------------------------------------
 * On mount: hydrates all stores from LocalStorage (if a compatible save
 * exists). Then: debounce-autosaves on any change to the persistent stores.
 *
 * Mounted FIRST among the host desktop's headless engines so hydration lands
 * before the reconciler/SLA engine evaluate anything.
 *
 * Note: the SLA store is deliberately NOT subscribed for autosave — it ticks
 * `now` every second and would thrash storage. Its warned/breached flags only
 * change alongside dialogue/ticket updates, which already trigger a save.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useHostStore } from "@/lib/host/store";
import { applySave, loadSave, saveNow } from "@/lib/persistence/save";

const AUTOSAVE_DEBOUNCE_MS = 800;

export default function PersistenceManager() {
  useEffect(() => {
    const saved = loadSave();
    if (saved) applySave(saved);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(saveNow, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubs = [
      useInfraStore.subscribe(schedule),
      useTicketStore.subscribe(schedule),
      useDialogueStore.subscribe(schedule),
      useHostStore.subscribe(schedule),
    ];

    return () => {
      clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);

  return null;
}
