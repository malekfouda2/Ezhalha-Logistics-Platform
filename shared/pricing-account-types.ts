/**
 * A pricing profile prices two kinds of client account separately. These are the same two values
 * `client_accounts.account_type` uses — the split exists precisely so a profile can charge a
 * company and an individual different rates.
 */
export const PricingAccountType = {
  COMPANY: "company",
  INDIVIDUAL: "individual",
} as const;

export type PricingAccountTypeValue = (typeof PricingAccountType)[keyof typeof PricingAccountType];

export const PRICING_ACCOUNT_TYPES: PricingAccountTypeValue[] = [
  PricingAccountType.COMPANY,
  PricingAccountType.INDIVIDUAL,
];

export const PRICING_ACCOUNT_TYPE_LABELS: Record<PricingAccountTypeValue, string> = {
  [PricingAccountType.COMPANY]: "Company account",
  [PricingAccountType.INDIVIDUAL]: "Individual account",
};

/**
 * Coerce anything that claims to be an account type into one of the two real values.
 *
 * Defaults to "company", matching the `client_accounts.account_type` column default: an account
 * whose type is missing or unrecognised has always been billed as a company, and a pricing change
 * is not the place to start silently re-rating it.
 */
export function normalizePricingAccountType(value?: string | null): PricingAccountTypeValue {
  return String(value || "").trim().toLowerCase() === PricingAccountType.INDIVIDUAL
    ? PricingAccountType.INDIVIDUAL
    : PricingAccountType.COMPANY;
}

/** The margin columns a pricing profile exposes, as read from the DB (decimals arrive as strings). */
export interface ProfileMarginSource {
  marginPercentage: string | number;
  ddpMarginPercentage: string | number;
  companyMarginPercentage?: string | number | null;
  companyDdpMarginPercentage?: string | number | null;
  individualMarginPercentage?: string | number | null;
  individualDdpMarginPercentage?: string | number | null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The profile's default express margin for one account type.
 *
 * Falls back to the profile-wide `marginPercentage` when the account type has no value of its
 * own. That fallback is a safety net, not an inheritance feature: the migration populates both
 * account types, so reaching it means a profile was created without them and would otherwise
 * price at zero.
 */
export function resolveProfileDefaultMargin(
  profile: ProfileMarginSource,
  accountType: PricingAccountTypeValue,
): number {
  const specific = accountType === PricingAccountType.INDIVIDUAL
    ? toNumber(profile.individualMarginPercentage)
    : toNumber(profile.companyMarginPercentage);
  return specific ?? toNumber(profile.marginPercentage) ?? 0;
}

/** The profile's default DDP markup for one account type. See `resolveProfileDefaultMargin`. */
export function resolveProfileDefaultDdpMargin(
  profile: ProfileMarginSource,
  accountType: PricingAccountTypeValue,
): number {
  const specific = accountType === PricingAccountType.INDIVIDUAL
    ? toNumber(profile.individualDdpMarginPercentage)
    : toNumber(profile.companyDdpMarginPercentage);
  return specific ?? toNumber(profile.ddpMarginPercentage) ?? 0;
}
