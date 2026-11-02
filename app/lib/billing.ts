// Pricing rules for the two plans, kept pure so they can be unit tested.
//
// Pay as you go: the first 500 page views in each 30-day billing period are
// free, then every full 100 page views costs $0.20, and a period never costs
// more than $4. Premium: $3.99 every 30 days with a
// 7-day free trial and no page-view charges.

export const PAY_AS_YOU_GO_PLAN = "Pay as you go";
export const PREMIUM_PLAN = "Premium";
export const PLAN_NAMES = [PAY_AS_YOU_GO_PLAN, PREMIUM_PLAN] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export const FREE_VIEWS = 500;
export const VIEWS_PER_CHARGE = 100;
export const PRICE_PER_CHARGE = 0.2;
export const USAGE_CAP = 4;
export const PREMIUM_PRICE = 3.99;
export const PREMIUM_TRIAL_DAYS = 7;
export const PERIOD_DAYS = 30;

export const USAGE_TERMS = `First ${FREE_VIEWS} page views free every ${PERIOD_DAYS} days, then $${PRICE_PER_CHARGE.toFixed(
  2,
)} per ${VIEWS_PER_CHARGE} page views, up to $${USAGE_CAP} per ${PERIOD_DAYS} days.`;

const cents = (value: number) => Math.round(value * 100) / 100;

// What the period's page views cost so far, before subtracting earlier charges.
export function usageCost(views: number): number {
  const blocks = Math.max(0, Math.floor((views - FREE_VIEWS) / VIEWS_PER_CHARGE));
  return Math.min(USAGE_CAP, cents(blocks * PRICE_PER_CHARGE));
}

// The amount still to charge, given what the period was already charged.
export function amountDue(views: number, alreadyCharged: number): number {
  return Math.max(0, cents(usageCost(views) - alreadyCharged));
}

// A charge is worth checking only when a page view completes a block of 100
// beyond the free allowance.
export function crossesChargeStep(views: number): boolean {
  return views > FREE_VIEWS && (views - FREE_VIEWS) % VIEWS_PER_CHARGE === 0;
}

export function planFromName(name: string | null | undefined): "PAY_AS_YOU_GO" | "PREMIUM" | null {
  if (name === PAY_AS_YOU_GO_PLAN) return "PAY_AS_YOU_GO";
  if (name === PREMIUM_PLAN) return "PREMIUM";
  return null;
}

export function planLabel(plan: "PAY_AS_YOU_GO" | "PREMIUM"): PlanName {
  return plan === "PREMIUM" ? PREMIUM_PLAN : PAY_AS_YOU_GO_PLAN;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The billing period containing `now`, starting from the stored period.
// Shopify's own period end is used when known; otherwise periods run every
// 30 days from `start`. `rolled` says the stored period has ended.
export function currentPeriod(
  now: Date,
  start: Date,
  end: Date | null,
): { start: Date; end: Date; rolled: boolean } {
  let periodStart = start;
  let periodEnd = end ?? new Date(start.getTime() + PERIOD_DAYS * DAY_MS);
  let rolled = false;
  while (now >= periodEnd) {
    periodStart = periodEnd;
    periodEnd = new Date(periodEnd.getTime() + PERIOD_DAYS * DAY_MS);
    rolled = true;
  }
  return { start: periodStart, end: periodEnd, rolled };
}
