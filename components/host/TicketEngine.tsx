"use client";

/**
 * TicketEngine — headless ambient ticket supply (polish pass)
 * ===========================================================
 * Ticks every few seconds, asks `ambientDecision` whether the company should
 * be raising another ticket, and dispatches one when the answer is yes.
 *
 * ── WHY IT LOOKS SO THIN ────────────────────────────────────────────────────
 *
 * Because all of the thinking is in `lib/tickets/ambient.ts`, which is pure.
 * This file owns exactly two things a pure function cannot: the timer and the
 * stores. That split is what allows the spec to simulate a thousand minutes of
 * play in a few milliseconds and assert the queue never runs dry — a property
 * that cannot be tested at all if the pacing logic reads `Date.now()` and the
 * store itself.
 *
 * Reads via `getState()` rather than subscribing, matching the other headless
 * engines: this runs on a timer, and subscribing would re-render the whole
 * desktop every time a metric moved.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useHostStore } from "@/lib/host/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useNotificationStore } from "@/lib/host/notifications-store";
import { ticketLibrary } from "@/lib/tickets/factory";
import { ambientDecision } from "@/lib/tickets/ambient";
import { mulberry32 } from "@/lib/org/rng";

/**
 * How often the question is ASKED — not how often a ticket arrives, which is
 * governed by the interval inside the decision. Five seconds keeps the
 * "urgent refill on an empty board" path feeling immediate without spinning.
 */
const TICK_MS = 5_000;

export default function TicketEngine() {
  useEffect(() => {
    /*
     * Seeded at mount rather than per call: `Math.random()` would make the
     * engine's choices unreproducible, and a bug report of the form "it keeps
     * giving me the same ticket" needs a seed to chase.
     */
    let seq = 0;
    const seed = (useInfraStore.getState().infra.org.seed ^ 0x5eed) >>> 0;

    // Start the clock at mount so a freshly-loaded save does not immediately
    // dump a ticket into a queue the player has not looked at yet.
    let lastSpawnAt = Date.now();

    function tick() {
      const infra = useInfraStore.getState().infra;
      const tickets = useTicketStore.getState().tickets;
      const level = useHostStore.getState().host.user.level;

      const live = tickets.filter(
        (t) => !t.mailOnly && t.status !== "resolved" && t.status !== "closed",
      );

      const decision = ambientDecision({
        infra,
        level,
        openCount: live.length,
        openTemplateIds: live.map((t) => t.templateId),
        library: ticketLibrary(infra),
        lastSpawnAt,
        now: Date.now(),
        rng: mulberry32((seed + seq++) >>> 0),
      });

      if (!decision.spawn || !decision.template) return;

      const ticket = useTicketStore
        .getState()
        .spawnTemplate(decision.template.id, infra, { injectFault: true });

      // Only advance the clock on a REAL arrival. A template that failed to
      // bind (no valid host for it in this world) must not consume the slot,
      // or a single unhostable family could throttle the whole engine.
      if (!ticket) return;
      lastSpawnAt = Date.now();

      useDialogueStore.getState().syncConversations();
      useNotificationStore.getState().push({
        kind: "info",
        title: `${ticket.code} raised`,
        body: ticket.title,
        badge: ticket.severity === "critical" || ticket.severity === "high" ? "Priority" : undefined,
      });
    }

    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
