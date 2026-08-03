/**
 * TriageOS — Software licence catalogue
 * =====================================
 * Licences are permanent, operator-owned unlocks bought with IT Budget. Each
 * one has to change something the player can SEE, or it is just a paywall:
 *
 *   diagnostics-pro      Monitor gains the anomaly triage list and the
 *                        focused multi-metric panel. Without it the dashboard
 *                        shows cards only, and you diagnose the slow way.
 *   finops-analytics     AetherCloud gains the per-resource cost breakdown.
 *   spare-parts-contract A standing supply agreement — every hardware
 *                        purchase in Procurement is discounted.
 *
 * Held on HostWorkstationState (persisted with the save), not on `infra`:
 * they belong to the operator, not to the client environment, and must
 * survive a world reset.
 */

import type { HostAppIconId } from "@/lib/core";

export type LicenseId = "diagnostics-pro" | "finops-analytics" | "spare-parts-contract";

export interface LicenseSpec {
  id: LicenseId;
  name: string;
  vendor: string;
  iconId: HostAppIconId;
  price: number;
  /** One line the player reads before buying — what actually changes. */
  effect: string;
  detail: string;
}

/** Discount applied to hardware purchases while the supply contract is held. */
export const SPARE_PARTS_DISCOUNT = 0.15;

export const LICENSES: LicenseSpec[] = [
  {
    id: "diagnostics-pro",
    name: "Advanced Diagnostics",
    vendor: "Northwind Telemetry",
    iconId: "activity",
    price: 4500,
    effect: "Unlocks anomaly triage and per-host drill-down in Monitor.",
    detail:
      "Correlates host state into a ranked list of active anomalies with a named cause, and lets you open any host for simultaneous CPU, memory and network traces.",
  },
  {
    id: "finops-analytics",
    name: "FinOps Analytics",
    vendor: "Ledgerline Systems",
    iconId: "credit",
    price: 3200,
    effect: "Unlocks the per-resource cost breakdown in AetherCloud.",
    detail:
      "Itemises the hourly burn rate by vNode and DataBucket so overspend can be attributed before it costs you at resolution.",
  },
  {
    id: "spare-parts-contract",
    name: "Spare Parts Contract",
    vendor: "Meridian Supply Co.",
    iconId: "truck",
    price: 6000,
    effect: `Permanent ${Math.round(SPARE_PARTS_DISCOUNT * 100)}% discount on all hardware procurement.`,
    detail:
      "A standing supply agreement. Pays for itself once you have replaced enough failed hardware — the more the estate breaks, the better it looks.",
  },
];

export function licenseSpec(id: LicenseId): LicenseSpec {
  return LICENSES.find((l) => l.id === id) ?? LICENSES[0];
}

export function hasLicense(licenses: string[], id: LicenseId): boolean {
  return licenses.includes(id);
}

/** Price of a hardware line after any standing supply agreement. */
export function hardwarePrice(base: number, licenses: string[]): number {
  return hasLicense(licenses, "spare-parts-contract")
    ? Math.round(base * (1 - SPARE_PARTS_DISCOUNT))
    : base;
}
