"use client";

/**
 * SlaEngine — headless SLA clock (Phase 5)
 * ----------------------------------------
 * Ticks a shared `now` every second so all countdowns re-render live, and
 * fires warning/breach events once per ticket: a warning at 75% of the
 * resolution window, a breach at 100%. Breaches flip the ticket to "breached"
 * and make the persona react.
 */

import { useEffect } from "react";
import { useSlaStore } from "@/lib/sla/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useDialogueStore } from "@/lib/dialogue/store";

export default function SlaEngine() {
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      useSlaStore.getState().tick(now);

      const sla = useSlaStore.getState();
      const { tickets, setStatus } = useTicketStore.getState();
      const dialogue = useDialogueStore.getState();

      for (const t of tickets) {
        // Only clocks that have started and aren't finished.
        if (!t.clock.startedAt) continue;
        if (t.status === "resolved" || t.status === "closed") continue;

        const deadline = t.clock.startedAt + t.sla.resolutionSeconds * 1000;
        const warnAt = t.clock.startedAt + t.sla.resolutionSeconds * 1000 * 0.75;

        if (now >= deadline && !sla.breached[t.id]) {
          sla.markBreached(t.id);
          setStatus(t.id, "breached");
          dialogue.event(t.id, "sla-breach");
        } else if (now >= warnAt && !sla.warned[t.id] && !sla.breached[t.id]) {
          sla.markWarned(t.id);
          dialogue.event(t.id, "sla-warning");
        }
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  return null;
}
