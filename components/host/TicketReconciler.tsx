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
import { useNotificationStore } from "@/lib/host/notifications-store";
import { ticketLibrary } from "@/lib/tickets/factory";
import { budgetReward, computeScore } from "@/lib/scenario/scoring";
import { burnRate, HOST_APP_REGISTRY, rackPower, rackThermal } from "@/lib/core";
import { skillOf, jobTitle } from "@/lib/progression/tracks";
import { appsUnlockedAt, tiersUnlockedAt } from "@/lib/progression/unlocks";

const tierNumber = (t: string) => t.replace(/^Tier_(\d).*$/, "$1");

/** Title after the award has landed — read fresh so it reflects the new level. */
function jobTitleNow(): string {
  const u = useHostStore.getState().host.user;
  return jobTitle(u.level, u.skills);
}

export default function TicketReconciler() {
  useEffect(() => {
    // Datacentre incidents are REACTIVE: nothing put them in the queue, the
    // operator's own rack did. Tracked here (not in the infra store) so the
    // physics layer stays pure and free of ticket/notification coupling.
    let breakerWasTripped: boolean | null = null;
    let thermalWasCritical: boolean | null = null;

    function checkRackPhysics() {
      const infra = useInfraStore.getState().infra;
      const tripped = infra.rack.breakerTripped;
      const critical = rackThermal(infra.rack).state === "critical";

      // First pass only primes the edge detector — a save restored mid-outage
      // must not re-raise an incident the player already has.
      if (breakerWasTripped === null) {
        breakerWasTripped = tripped;
        thermalWasCritical = critical;
        return;
      }

      if (tripped && !breakerWasTripped) {
        const t = useTicketStore.getState().spawnIncident("gen-pdu-trip", infra);
        if (t) {
          useDialogueStore.getState().syncConversations();
          const p = rackPower(infra.rack);
          useNotificationStore.getState().push({
            kind: "warning",
            title: "Rack PDU breaker tripped",
            body: `Cabled load exceeded ${p.pdu.maxWatts.toLocaleString()}W. Everything in the rack is down.`,
            badge: t.code,
          });
        }
      }
      if (critical && !thermalWasCritical) {
        const t = useTicketStore.getState().spawnIncident("gen-rack-cooling", infra);
        if (t) useDialogueStore.getState().syncConversations();
        useNotificationStore.getState().push({
          kind: "warning",
          title: "Rack thermal shutdown",
          body: `${rackThermal(infra.rack).tempC}C — devices are offline and hardware is failing.`,
          badge: t ? t.code : "Rack Lab",
        });
      }

      breakerWasTripped = tripped;
      thermalWasCritical = critical;
    }

    function check() {
      checkRackPhysics();
      const infra = useInfraStore.getState().infra;
      const { tickets, resolve } = useTicketStore.getState();

      for (const ticket of tickets) {
        if (ticket.status === "resolved" || ticket.status === "closed") continue;
        // Mail-only tickets can't resolve until promoted to the board.
        if (ticket.mailOnly) continue;
        const template = ticketLibrary(infra)[ticket.templateId];
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
        const burn = burnRate(infra.cloud);
        const score = computeScore(ticket, conv?.csat ?? 70, breached, burn);

        const budget = budgetReward(ticket, breached);
        const promo = useHostStore.getState().awardXp(score.xp);
        useHostStore.getState().awardBudget(budget);
        // Credit the discipline this ticket actually exercised — that is what
        // moves the operator's job title over time.
        useHostStore.getState().awardSkillXp(skillOf(ticket), score.xp);
        useNotificationStore.getState().push({
          kind: "success",
          title: `${ticket.code} resolved`,
          body: ticket.title,
          badge: `+${score.xp} XP · +${budget.toLocaleString()} Cr`,
        });

        // Spell out where the reward went, so the hint price is visible after
        // the fact and not just at the moment of spending it.
        const parts = [
          `Resolved ${breached ? "(SLA breached)" : "within SLA"}`,
          `CSAT ${score.csat}%`,
        ];
        if (ticket.hardMode) parts.push("Hard Mode");
        if (score.budgetFactor < 1) {
          parts.push(
            `Budget inefficiency −${Math.round((1 - score.budgetFactor) * 100)}% (${burn} cr/h)`,
          );
        }
        if (ticket.hintsRevealed > 0) {
          parts.push(
            `${ticket.hintsRevealed} hint${ticket.hintsRevealed === 1 ? "" : "s"} −${Math.round(
              (1 - score.hintFactor) * 100,
            )}%`,
          );
        }
        dialogue.note(
          ticket.id,
          `${parts.join(" · ")} · +${score.xp} XP · +${budget.toLocaleString()} Cr`,
        );

        // Promotion: announce it, then open the tiers it unlocked so harder
        // work actually starts arriving.
        if (promo.to > promo.from) {
          for (let lvl = promo.from + 1; lvl <= promo.to; lvl++) {
            const apps = appsUnlockedAt(lvl).map((id) => HOST_APP_REGISTRY[id].title);
            const tiers = tiersUnlockedAt(lvl);
            const bits: string[] = [];
            if (apps.length) bits.push(apps.join(", "));
            if (tiers.length) bits.push(`${tiers.length === 1 ? "Tier" : "Tiers"} ${tiers.map(tierNumber).join(" & ")} incidents`);
            useNotificationStore.getState().push({
              kind: "success",
              title: `Promoted to level ${lvl}`,
              body: bits.length ? `Unlocked: ${bits.join(" · ")}` : jobTitleNow(),
              badge: jobTitleNow(),
            });
            if (tiers.length) {
              useTicketStore.getState().spawnForTiers(tiers, infra, lvl);
              useDialogueStore.getState().syncConversations();
            }
          }
        }

        // Standard freight is paced by work done, not by the clock: closing an
        // incident moves every open order one step closer.
        const arrived = useInfraStore.getState().advanceDeliveries();
        if (arrived.length > 0) {
          useNotificationStore.getState().push({
            kind: "info",
            title: "Delivery received",
            body: arrived.join(", "),
            badge: "Store room",
          });
        }
      }
    }

    check();
    return useInfraStore.subscribe(check);
  }, []);

  return null;
}
