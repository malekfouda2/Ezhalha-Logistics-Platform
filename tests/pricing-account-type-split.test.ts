import { beforeAll, describe, expect, it } from "vitest";
import { storage } from "../server/storage";
import {
  normalizePricingAccountType,
  PricingAccountType,
  resolveProfileDefaultDdpMargin,
  resolveProfileDefaultMargin,
} from "../shared/pricing-account-types";

// A pricing profile charges company and individual accounts separately. These tests pin the two
// properties that matter for money: the two sets never bleed into each other, and a profile that
// has not been split yet still prices exactly as it did before.

async function createProfile(overrides: Record<string, unknown> = {}) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return storage.createPricingRule({
    profile: `split_test_${unique}`,
    displayName: `Split Test ${unique}`,
    marginPercentage: "20.00",
    ddpMarginPercentage: "30.00",
    ...overrides,
  } as any);
}

describe("account type normalisation", () => {
  it("treats anything that is not 'individual' as a company account", () => {
    expect(normalizePricingAccountType("individual")).toBe(PricingAccountType.INDIVIDUAL);
    expect(normalizePricingAccountType("INDIVIDUAL")).toBe(PricingAccountType.INDIVIDUAL);
    expect(normalizePricingAccountType("company")).toBe(PricingAccountType.COMPANY);
    // An account with a missing or unrecognised type has always been billed as a company.
    // Re-rating it silently is exactly what this must not do.
    expect(normalizePricingAccountType(null)).toBe(PricingAccountType.COMPANY);
    expect(normalizePricingAccountType("")).toBe(PricingAccountType.COMPANY);
    expect(normalizePricingAccountType("something else")).toBe(PricingAccountType.COMPANY);
  });
});

describe("profile default margins", () => {
  it("prefers the account type's own rate over the profile fallback", () => {
    const profile = {
      marginPercentage: "20",
      ddpMarginPercentage: "30",
      companyMarginPercentage: "12",
      companyDdpMarginPercentage: "18",
      individualMarginPercentage: "25",
      individualDdpMarginPercentage: "35",
    };
    expect(resolveProfileDefaultMargin(profile, PricingAccountType.COMPANY)).toBe(12);
    expect(resolveProfileDefaultMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(25);
    expect(resolveProfileDefaultDdpMargin(profile, PricingAccountType.COMPANY)).toBe(18);
    expect(resolveProfileDefaultDdpMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(35);
  });

  it("falls back to the profile-wide rate when an account type is unset", () => {
    // This is the pre-split shape: a profile created before the split, or one an admin cleared.
    const profile = { marginPercentage: "20", ddpMarginPercentage: "30" };
    expect(resolveProfileDefaultMargin(profile, PricingAccountType.COMPANY)).toBe(20);
    expect(resolveProfileDefaultMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(20);
    expect(resolveProfileDefaultDdpMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(30);
  });

  it("treats an explicit zero as a real rate, not as 'unset'", () => {
    const profile = {
      marginPercentage: "20",
      ddpMarginPercentage: "30",
      individualMarginPercentage: "0",
      individualDdpMarginPercentage: "0",
    };
    expect(resolveProfileDefaultMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(0);
    expect(resolveProfileDefaultDdpMargin(profile, PricingAccountType.INDIVIDUAL)).toBe(0);
  });
});

describe("express margin resolution", () => {
  let profileId: string;

  beforeAll(async () => {
    const profile = await createProfile({
      companyMarginPercentage: "10.00",
      individualMarginPercentage: "40.00",
    });
    profileId = profile.id;

    await storage.createPricingTier({
      profileId,
      accountType: PricingAccountType.COMPANY,
      minAmount: "1000",
      marginPercentage: "8.00",
    });
    await storage.createPricingTier({
      profileId,
      accountType: PricingAccountType.INDIVIDUAL,
      minAmount: "1000",
      marginPercentage: "35.00",
    });
  }, 30000);

  it("charges each account type its own tier at the same shipment value", async () => {
    expect(await storage.getMarginForAmount(profileId, 5000, PricingAccountType.COMPANY)).toBe(8);
    expect(await storage.getMarginForAmount(profileId, 5000, PricingAccountType.INDIVIDUAL)).toBe(35);
  });

  it("falls back to that account type's default when no tier covers the amount", async () => {
    // 500 is below the 1000 threshold, so neither tier applies.
    expect(await storage.getMarginForAmount(profileId, 500, PricingAccountType.COMPANY)).toBe(10);
    expect(await storage.getMarginForAmount(profileId, 500, PricingAccountType.INDIVIDUAL)).toBe(40);
  });

  it("does not let one account type's tier price the other", async () => {
    const profile = await createProfile({
      companyMarginPercentage: "10.00",
      individualMarginPercentage: "40.00",
    });
    // Only the company side has a tier.
    await storage.createPricingTier({
      profileId: profile.id,
      accountType: PricingAccountType.COMPANY,
      minAmount: "0",
      marginPercentage: "5.00",
    });

    expect(await storage.getMarginForAmount(profile.id, 5000, PricingAccountType.COMPANY)).toBe(5);
    // The individual account must NOT pick up the company tier — it takes its own default.
    expect(await storage.getMarginForAmount(profile.id, 5000, PricingAccountType.INDIVIDUAL)).toBe(40);
  });

  it("prices an un-split profile identically for both account types", async () => {
    // The shape of every profile before the migration ran: no per-account-type values, and
    // tiers that predate the split (which the column default puts on the company side).
    const profile = await createProfile();
    await storage.createPricingTier({
      profileId: profile.id,
      accountType: PricingAccountType.COMPANY,
      minAmount: "0",
      marginPercentage: "17.00",
    });
    await storage.createPricingTier({
      profileId: profile.id,
      accountType: PricingAccountType.INDIVIDUAL,
      minAmount: "0",
      marginPercentage: "17.00",
    });

    expect(await storage.getMarginForAmount(profile.id, 900, PricingAccountType.COMPANY)).toBe(17);
    expect(await storage.getMarginForAmount(profile.id, 900, PricingAccountType.INDIVIDUAL)).toBe(17);
  });
});

describe("DDP markup resolution", () => {
  it("keeps the two account types apart per billing unit", async () => {
    const profile = await createProfile({
      companyDdpMarginPercentage: "12.00",
      individualDdpMarginPercentage: "22.00",
    });

    await storage.createDdpPricingTier({
      profileId: profile.id,
      accountType: PricingAccountType.COMPANY,
      billingUnit: "KG",
      minAmount: "100",
      marginPercentage: "9.00",
    });
    await storage.createDdpPricingTier({
      profileId: profile.id,
      accountType: PricingAccountType.INDIVIDUAL,
      billingUnit: "KG",
      minAmount: "100",
      marginPercentage: "19.00",
    });

    expect(await storage.getDdpMarginForQuantity(profile.id, "KG", 250, PricingAccountType.COMPANY)).toBe(9);
    expect(await storage.getDdpMarginForQuantity(profile.id, "KG", 250, PricingAccountType.INDIVIDUAL)).toBe(19);

    // Below the tier threshold, and on a unit with no tiers at all, each side takes its own default.
    expect(await storage.getDdpMarginForQuantity(profile.id, "KG", 10, PricingAccountType.COMPANY)).toBe(12);
    expect(await storage.getDdpMarginForQuantity(profile.id, "CBM", 250, PricingAccountType.INDIVIDUAL)).toBe(22);
  });
});

describe("tier listing", () => {
  it("returns one account type's tiers when asked, and both when not", async () => {
    const profile = await createProfile();
    await storage.createPricingTier({ profileId: profile.id, accountType: PricingAccountType.COMPANY, minAmount: "0", marginPercentage: "5.00" });
    await storage.createPricingTier({ profileId: profile.id, accountType: PricingAccountType.INDIVIDUAL, minAmount: "0", marginPercentage: "9.00" });

    const companyOnly = await storage.getPricingTiersByProfileId(profile.id, PricingAccountType.COMPANY);
    expect(companyOnly).toHaveLength(1);
    expect(Number(companyOnly[0].marginPercentage)).toBe(5);

    // The admin screen loads both so it can switch between them without a refetch.
    expect(await storage.getPricingTiersByProfileId(profile.id)).toHaveLength(2);
  });

  it("defaults a tier saved without an account type to company", async () => {
    // Matches the column default, which is what turns every pre-split row into the company set.
    const profile = await createProfile();
    const tier = await storage.createPricingTier({ profileId: profile.id, minAmount: "0", marginPercentage: "5.00" } as any);
    expect(tier.accountType).toBe(PricingAccountType.COMPANY);
  });
});
