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
import { burnRate, HOST_APP_REGISTRY, phaseForLevel, phaseSpec, rackPower, rackThermal } from "@/lib/core";
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
    // Per-rack, because a floor with three racks has three independent
    // breakers; one shared flag would swallow the second rack to trip.
    const breakerWasTripped = new Map<string, boolean>();
    const thermalWasCritical = new Map<string, boolean>();
    let outagesSeen: number | null = null;
    let primed = false;

    function checkRackPhysics() {
      const infra = useInfraStore.getState().infra;
      const nodes = infra.nodes;

      for (const rack of infra.datacenter.racks) {
        const tripped = rack.breakerTripped;
        const critical = rackThermal(rack, nodes).state === "critical";

        // The first pass only primes the edge detector — a save restored
        // mid-outage must not re-raise an incident the player already has.
        if (primed) {
          if (tripped && !breakerWasTripped.get(rack.id)) {
            const t = useTicketStore.getState().spawnIncident("gen-pdu-trip", infra);
            if (t) useDialogueStore.getState().syncConversations();
            useNotificationStore.getState().push({
              kind: "warning",
              title: `${rack.name} — PDU breaker tripped`,
              body: `Cabled load exceeded ${rackPower(rack, nodes).pdu.maxWatts.toLocaleString()}W. Everything in the rack is down.`,
              badge: t ? t.code : rack.name,
            });
          }
          if (critical && !thermalWasCritical.get(rack.id)) {
            const t = useTicketStore.getState().spawnIncident("gen-rack-cooling", infra);
            if (t) useDialogueStore.getState().syncConversations();
            useNotificationStore.getState().push({
              kind: "warning",
              title: `${rack.name} — thermal shutdown`,
              body: `${rackThermal(rack, nodes).tempC}C. Devices are offline and hardware is failing.`,
              badge: t ? t.code : rack.name,
            });
          }
        }
        breakerWasTripped.set(rack.id, tripped);
        thermalWasCritical.set(rack.id, critical);
      }

      // An unplanned outage — a live host yanked without draining it — is the
      // v0.4.0 lesson delivered as a bill. The store records it; turning that
      // into an incident is the reconciler's job, same as everything else.
      const outages = infra.security.unplannedOutages;
      if (outagesSeen !== null && outages.length > outagesSeen) {
        for (const o of outages.slice(outagesSeen)) {
          const t = useTicketStore.getState().spawnIncident("gen-unplanned-outage", infra);
          if (t) useDialogueStore.getState().syncConversations();
          useNotificationStore.getState().push({
            kind: "warning",
            title: "Unplanned outage",
            body: `${o.hostname} was powered down carrying ${o.workloadCount} live workload${
              o.workloadCount === 1 ? "" : "s"
            }. They did not migrate — they stopped.`,
            badge: t ? t.code : "Change control",
          });
        }
      }
      outagesSeen = outages.length;
      primed = true;
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

            // ── THE COMPANY GROWS (v0.6.0) ──────────────────────────────
            // Crossing a milestone level hires staff onto the world that
            // already exists. It provisions NOTHING: the new headcount eats
            // addresses, disk and power, and the project ticket that follows
            // asks the operator to deal with it. Auto-scaling the estate
            // would remove the entire point of the milestone.
            const want = phaseForLevel(lvl);
            if (want > useInfraStore.getState().infra.growth.phase) {
              const grew = useInfraStore.getState().growCompany(want);
              if (grew) {
                const spec = phaseSpec(want);
                useNotificationStore.getState().push({
                  kind: "info",
                  title: `${useInfraStore.getState().infra.org.name} is now ${spec.label.toLowerCase()}`,
                  body: `${grew.hired} people hired — headcount ${grew.from} to ${grew.to}. ${spec.blurb}`,
                  badge: `Phase ${want}`,
                });
                const project = useTicketStore
                  .getState()
                  .spawnIncident("gen-scaling-project", useInfraStore.getState().infra);
                if (project) useDialogueStore.getState().syncConversations();
              }
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
