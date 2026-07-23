"use client";

/**
 * TicketReconciler — headless bridge (Phase 5)
 * --------------------------------------------
 * Watches InfrastructureState; when a ticket's scenario win-condition is met
 * (from CLI or GUI), it: resolves the ticket, refreshes node health, fires the
 * persona's relieved dialogue, scores the outcome (SLA × CSAT → XP), and awards
 * XP to the operator. Interface-agnostic — it doesn't care how the fix happened.
 */

import { useEffect } from "react";
import { useInfraStore } from "@/lib/infra/store";
import { useTicketStore } from "@/lib/host/tickets-store";
import { useHostStore } from "@/lib/host/store";
import { useDialogueStore } from "@/lib/dialogue/store";
import { useSlaStore } from "@/lib/sla/store";
import { TICKET_TEMPLATES } from "@/lib/tickets/matrix";
import { computeScore } from "@/lib/scenario/scoring";

export default function TicketReconciler() {
  useEffect(() => {
    function check() {
      const infra = useInfraStore.getState().infra;
      const { tickets, resolve } = useTicketStore.getState();

      for (const ticket of tickets) {
        if (ticket.status === "resolved" || ticket.status === "closed") continue;
        // Mail-only tickets can't resolve until promoted to the board.
        if (ticket.mailOnly) continue;
        const template = TICKET_TEMPLATES[ticket.templateId];
        if (!template || !template.win(infra, ticket.dynamicContext)) continue;

        // 1) Resolve the ticket + refresh node health.
        resolve(ticket.id);
        const healthyNode = template.healthyNode?.(infra, ticket.dynamicContext);
        if (healthyNode) {
          useInfraStore.getState().updateNode(healthyNode, (n) => {
            n.health.status = "healthy";
          });
        }

        // 2) Persona reacts (relieved), then score the outcome.
        const dialogue = useDialogueStore.getState();
        dialogue.event(ticket.id, "resolved");

        const conv = useDialogueStore.getState().conversations[ticket.id];
        const breached = useSlaStore.getState().breached[ticket.id] === true;
        const score = computeScore(ticket, conv?.csat ?? 70, breached);

        useHostStore.getState().awardXp(score.xp);
        dialogue.note(
          ticket.id,
          `Resolved ${breached ? "(SLA breached)" : "within SLA"} · CSAT ${score.csat}% · +${score.xp} XP`,
        );
      }
    }

    check();
    return useInfraStore.subscribe(check);
  }, []);

  return null;
}
