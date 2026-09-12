/**
 * ITQuest — what each plan costs
 * ===============================
 * Prices live NEXT TO the tier model and nowhere else.
 *
 * A pricing page that hard-codes "$9" is a pricing page that will one day
 * disagree with the checkout, and the customer finds that out at the worst
 * possible moment. `TIERS` says what a plan does; this says what it costs; a
 * screen reads both and invents neither.
 *
 * ── THESE NUMBERS ARE A RECOMMENDATION ──────────────────────────────────────
 *
 * Positioned just under the hands-on training market (TryHackMe, KodeKloud
 * and similar sit around $14-20/mo) because ITQuest is in beta with no track
 * record yet. Launching low and raising later is recoverable; launching high
 * and discounting teaches people to wait for a sale.
 *
 * Changing them is editing this file.
 */

import { TIERS, type TierId } from "./tiers";

export type BillingPeriod = "monthly" | "yearly";

export interface Price {
  /** Minor units (cents), so no float ever touches money. */
  amount: number;
  currency: "USD";
  period: BillingPeriod;
  /** What the amount buys: one account, or one seat. */
  unit: "account" | "seat";
}

export interface PlanPricing {
  tier: TierId;
  monthly: Price | null;
  yearly: Price | null;
  /** Smallest purchase, where there is one. Enterprise is not sold by ones. */
  minimumSeats?: number;
  /** Not self-serve: a pilot is a conversation, which is how EdTech sells. */
  contactOnly?: boolean;
  /** A line under the price, where the price alone would mislead. */
  note?: string;
}

const usd = (amount: number, period: BillingPeriod, unit: Price["unit"]): Price => ({
  amount,
  currency: "USD",
  period,
  unit,
});

export const PRICING: Record<TierId, PlanPricing> = {
  free: {
    tier: "free",
    monthly: usd(0, "monthly", "account"),
    yearly: usd(0, "yearly", "account"),
    note: "No card. No trial that quietly ends.",
  },
  pro: {
    tier: "pro",
    monthly: usd(900, "monthly", "account"),
    yearly: usd(7900, "yearly", "account"),
    note: "Founding price, locked for as long as you stay subscribed.",
  },
  enterprise: {
    tier: "enterprise",
    monthly: null,
    yearly: usd(4000, "yearly", "seat"),
    minimumSeats: 25,
    contactOnly: true,
    note: "One cohort, one term, free to pilot.",
  },
};

/** Half price for verified students. */
export const STUDENT_DISCOUNT = 0.5;

export function format(p: Price): string {
  if (p.amount === 0) return "Free";
  const whole = p.amount / 100;
  const money = Number.isInteger(whole) ? `$${whole}` : `$${whole.toFixed(2)}`;
  return p.period === "monthly" ? `${money}/mo` : `${money}/yr`;
}

/**
 * What a yearly plan works out at per month.
 *
 * Shown because "$79/yr" is the number people compare against a monthly
 * competitor and get wrong in their heads.
 */
export function perMonthFromYearly(p: Price): string {
  const monthly = p.amount / 12 / 100;
  return `$${monthly.toFixed(2)}/mo`;
}

/** How much a year costs versus paying monthly, as a percentage. */
export function yearlySaving(plan: PlanPricing): number | null {
  if (!plan.monthly || !plan.yearly || plan.monthly.amount === 0) return null;
  const twelve = plan.monthly.amount * 12;
  return Math.round(((twelve - plan.yearly.amount) / twelve) * 100);
}

/** A whole cohort's annual cost, for the figure an institution actually asks. */
export function seatsTotal(seats: number): number | null {
  const y = PRICING.enterprise.yearly;
  if (!y) return null;
  const billed = Math.max(seats, PRICING.enterprise.minimumSeats ?? 1);
  return billed * y.amount;
}

export function formatTotal(minorUnits: number): string {
  return `$${(minorUnits / 100).toLocaleString("en-US")}`;
}

export { TIERS };
