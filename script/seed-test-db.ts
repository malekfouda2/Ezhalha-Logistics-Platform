/**
 * Prepares a freshly-created database for the test suite.
 *
 * Run this once, immediately after `drizzle-kit push`, and BEFORE the first test run:
 *
 *   DATABASE_URL=… npx drizzle-kit push --force
 *   DATABASE_URL=… npx tsx script/seed-test-db.ts
 *   DATABASE_URL=… npx vitest run --no-file-parallelism
 *
 * Order matters, and getting it wrong is subtle. `storage.initializeDefaults()` seeds the
 * default pricing rules only when `pricing_rules` is empty. The suite itself creates rows
 * in that table (`test_profile_*`, `dup_test_*`), so if you run the tests first, the table
 * is no longer empty and the real `regular` / `mid_level` / `vip` rules are never created.
 *
 * That matters because `validateClientProfileValue` checks a profile against the profiles
 * present in `pricing_rules`, not against the ClientProfile enum. With the defaults
 * missing, admin client-update requests fail with `400 Invalid profile` — which looks like
 * a broken endpoint rather than missing seed data.
 *
 * Idempotent: safe to re-run.
 */

import "../server/load-env";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { pricingRules } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { ClientProfile } from "@shared/domain";

const DEFAULT_PRICING_RULES = [
  { profile: ClientProfile.REGULAR, displayName: "Regular", marginPercentage: "20.00", ddpMarginPercentage: "20.00", badgeColor: "#6B7280", badgeIcon: "user" },
  { profile: ClientProfile.MID_LEVEL, displayName: "Mid-Level", marginPercentage: "15.00", ddpMarginPercentage: "15.00", badgeColor: "#3B82F6", badgeIcon: "star" },
  { profile: ClientProfile.VIP, displayName: "VIP", marginPercentage: "10.00", ddpMarginPercentage: "10.00", badgeColor: "#F59E0B", badgeIcon: "crown" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  await storage.initializeDefaults();

  // Belt and braces: guarantee the default profiles exist even if the table was already
  // dirty when initializeDefaults ran, which is exactly the case its own guard misses.
  const wanted = DEFAULT_PRICING_RULES.map((rule) => rule.profile);
  const present = await db
    .select({ profile: pricingRules.profile })
    .from(pricingRules)
    .where(inArray(pricingRules.profile, wanted));
  const missing = DEFAULT_PRICING_RULES.filter(
    (rule) => !present.some((row) => row.profile === rule.profile),
  );

  if (missing.length) {
    await db.insert(pricingRules).values(
      missing.map((rule) => ({ ...rule, badgeStyle: "solid", isActive: true })),
    );
    console.log(`Seeded ${missing.length} default pricing rule(s): ${missing.map((r) => r.profile).join(", ")}`);
  } else {
    console.log("Default pricing rules already present");
  }

  const admin = await storage.getUserByUsername("admin");
  console.log(admin ? `Admin user ready: ${admin.username}` : "WARNING: admin user missing");
  console.log("Test database ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
