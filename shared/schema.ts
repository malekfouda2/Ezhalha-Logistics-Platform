import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { UserInvitationStatus } from "./internal-users";
import { PricingAccountType } from "./pricing-account-types";

// Domain constants live in ./domain — a dependency-free module so the React Native app
// can import enum VALUES without pulling drizzle into its bundle. Re-exported here so
// every existing `@shared/schema` import keeps working unchanged.
export * from "./domain";

// `export *` re-exports without binding the names locally, and the table definitions below
// use some of them for column defaults.
import {
  AbandonedShipmentRecoveryStatus,
  OperationAssignmentStatus,
  OperationAttentionStatus,
  OperationEventAudience,
  OperationNoteVisibility,
  OperationSpecialHandlingStatus,
  OperationTaskStatus,
} from "./domain";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  // Optional login phone (E.164). Lets users sign in with phone + password.
  phone: text("phone"),
  fullName: text("full_name"),
  password: text("password").notNull(),
  userType: text("user_type").notNull().default("client"),
  clientAccountId: varchar("client_account_id"),
  isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
  isAccountManager: boolean("is_account_manager").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // Bumped on deactivation and password change. Stateless access tokens carry the value
  // they were minted with, so a bump invalidates every live token for this user at once.
  tokenVersion: integer("token_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Client Accounts table
export const clientAccounts = pgTable("client_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountNumber: text("account_number").notNull().unique(), // Human-readable ID: EZ0001, EZ0002, etc.
  accountType: text("account_type").notNull().default("company"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  companyName: text("company_name"),
  crNumber: text("cr_number"), // Commercial Registration number
  taxNumber: text("tax_number"), // Tax Number
  nationalAddressStreet: text("national_address_street"),
  nationalAddressBuilding: text("national_address_building"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressCity: text("national_address_city"),
  nationalAddressPostalCode: text("national_address_postal_code"),
  // Arabic (Secondary Language) fields - Admin only
  nameAr: text("name_ar"),
  companyNameAr: text("company_name_ar"),
  nationalAddressStreetAr: text("national_address_street_ar"),
  nationalAddressBuildingAr: text("national_address_building_ar"),
  nationalAddressDistrictAr: text("national_address_district_ar"),
  nationalAddressCityAr: text("national_address_city_ar"),
  // Default Shipping Address fields
  shippingContactName: text("shipping_contact_name"),
  shippingContactPhone: text("shipping_contact_phone"),
  shippingCountryCode: text("shipping_country_code"),
  shippingStateOrProvince: text("shipping_state_or_province"),
  shippingCity: text("shipping_city"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingShortAddress: text("shipping_short_address"), // Short address code for KSA
  // Arabic Shipping Address fields
  shippingContactNameAr: text("shipping_contact_name_ar"),
  shippingContactPhoneAr: text("shipping_contact_phone_ar"),
  shippingCountryCodeAr: text("shipping_country_code_ar"),
  shippingStateOrProvinceAr: text("shipping_state_or_province_ar"),
  shippingCityAr: text("shipping_city_ar"),
  shippingPostalCodeAr: text("shipping_postal_code_ar"),
  shippingAddressLine1Ar: text("shipping_address_line1_ar"),
  shippingAddressLine2Ar: text("shipping_address_line2_ar"),
  shippingShortAddressAr: text("shipping_short_address_ar"),
  documents: text("documents").array(), // Array of document object paths
  profile: text("profile").notNull().default("regular"),
  isActive: boolean("is_active").notNull().default(true),
  creditEnabled: boolean("credit_enabled").notNull().default(false),
  creditLimitSar: decimal("credit_limit_sar", { precision: 12, scale: 2 }).notNull().default("0"),
  // Bundled "Sales Channels" feature (Orders, Sales Channels, Assignment Rules). Off by default;
  // enabled by an admin — either directly or by approving a client's access request.
  salesFeaturesEnabled: boolean("sales_features_enabled").notNull().default(false),
  // Currency the client is billed/charged in. SAR is the accounting source of truth;
  // non-SAR (e.g. USD) is FX-converted at checkout with the rate snapshotted per shipment.
  preferredCurrency: text("preferred_currency").notNull().default("SAR"),
  tapCustomerId: text("tap_customer_id"),
  tapIntegrationAccountId: varchar("tap_integration_account_id"),
  zohoCustomerId: text("zoho_customer_id"), // Zoho Books customer ID for invoice sync
  zohoIntegrationAccountId: varchar("zoho_integration_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertClientAccountSchema = createInsertSchema(clientAccounts).omit({
  id: true,
  accountNumber: true, // Generated automatically: EZ0001, EZ0002, etc.
  createdAt: true,
});

export type InsertClientAccount = z.infer<typeof insertClientAccountSchema>;
export type ClientAccount = typeof clientAccounts.$inferSelect;

// Client Applications table
export const clientApplications = pgTable("client_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountType: text("account_type").notNull().default("company"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  companyName: text("company_name"),
  crNumber: text("cr_number"), // Commercial Registration number
  taxNumber: text("tax_number"), // Tax Number
  nationalAddressStreet: text("national_address_street"),
  nationalAddressBuilding: text("national_address_building"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressCity: text("national_address_city"),
  nationalAddressPostalCode: text("national_address_postal_code"),
  // Default Shipping Address fields
  shippingContactName: text("shipping_contact_name"),
  shippingContactPhone: text("shipping_contact_phone"),
  shippingCountryCode: text("shipping_country_code"),
  shippingStateOrProvince: text("shipping_state_or_province"),
  shippingCity: text("shipping_city"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingShortAddress: text("shipping_short_address"), // Short address code for KSA
  documents: text("documents").array(), // Array of document object paths
  status: text("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientApplicationSchema = createInsertSchema(clientApplications).omit({
  id: true,
  createdAt: true,
  reviewedBy: true,
  reviewNotes: true,
});

export type InsertClientApplication = z.infer<typeof insertClientApplicationSchema>;
export type ClientApplication = typeof clientApplications.$inferSelect;

// Pricing Rules table (margins per profile)
export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profile: text("profile").notNull().unique(),
  displayName: text("display_name").notNull(),
  /**
   * Profile-wide fallback margins, kept as the safety net beneath the per-account-type columns
   * below. Nothing should read these directly any more — go through
   * `resolveProfileDefaultMargin` so a company and an individual account never silently share
   * a rate again.
   */
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  ddpMarginPercentage: decimal("ddp_margin_percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  /**
   * Per-account-type default margins. A profile prices company and individual accounts
   * separately, so each gets its own express margin and DDP markup.
   *
   * Nullable on purpose: null means "not configured for this account type", and the resolver
   * falls back to the profile-wide column above. The migration backfills all four from the
   * profile-wide values, so the split is behaviour-neutral the day it ships — 354 live
   * individual accounts keep the exact rate they had.
   */
  companyMarginPercentage: decimal("company_margin_percentage", { precision: 5, scale: 2 }),
  companyDdpMarginPercentage: decimal("company_ddp_margin_percentage", { precision: 5, scale: 2 }),
  individualMarginPercentage: decimal("individual_margin_percentage", { precision: 5, scale: 2 }),
  individualDdpMarginPercentage: decimal("individual_ddp_margin_percentage", { precision: 5, scale: 2 }),
  badgeColor: text("badge_color"),
  badgeStyle: text("badge_style").notNull().default("solid"),
  badgeGradientFrom: text("badge_gradient_from"),
  badgeGradientTo: text("badge_gradient_to"),
  badgeGradientAngle: integer("badge_gradient_angle").notNull().default(135),
  badgeIcon: text("badge_icon").notNull().default("star"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRules.$inferSelect;

// DDP is a manually fulfilled door-to-door product with admin-managed lane pricing.
export const ddpPricingLanes = pgTable("ddp_pricing_lanes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originCountryCode: text("origin_country_code").notNull(),
  originCity: text("origin_city"),
  destinationCountryCode: text("destination_country_code").notNull(),
  destinationCity: text("destination_city"),
  currency: text("currency").notNull().default("SAR"),
  airBaseRatePerKg: decimal("air_base_rate_per_kg", { precision: 12, scale: 2 }),
  seaBaseRatePerCbm: decimal("sea_base_rate_per_cbm", { precision: 12, scale: 2 }),
  // Standalone domestic (last-mile within destination) rate: flat SAR per billable KG.
  // Reuses the KG minimum/rounding/minimum-charge knobs below.
  domesticRatePerKg: decimal("domestic_rate_per_kg", { precision: 12, scale: 2 }),
  // Supplier (procurement) cost per unit — what the DDP supplier charges Ezhalha, kept
  // separate from the client-facing sell base above. Feeds true margin = sell − cost.
  // Null = cost not configured (treated as 0 in margin visibility).
  airSupplierCostPerKg: decimal("air_supplier_cost_per_kg", { precision: 12, scale: 2 }),
  seaSupplierCostPerCbm: decimal("sea_supplier_cost_per_cbm", { precision: 12, scale: 2 }),
  domesticSupplierCostPerKg: decimal("domestic_supplier_cost_per_kg", { precision: 12, scale: 2 }),
  minimumBillableKg: decimal("minimum_billable_kg", { precision: 12, scale: 3 }).notNull().default("0"),
  kgRoundingIncrement: decimal("kg_rounding_increment", { precision: 12, scale: 3 }).notNull().default("0.5"),
  minimumBillableCbm: decimal("minimum_billable_cbm", { precision: 12, scale: 4 }).notNull().default("0"),
  cbmRoundingIncrement: decimal("cbm_rounding_increment", { precision: 12, scale: 4 }).notNull().default("0.1"),
  minimumShipmentCharge: decimal("minimum_shipment_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  airTransitDaysMin: integer("air_transit_days_min"),
  airTransitDaysMax: integer("air_transit_days_max"),
  seaTransitDaysMin: integer("sea_transit_days_min"),
  seaTransitDaysMax: integer("sea_transit_days_max"),
  volumetricDivisor: integer("volumetric_divisor").notNull().default(6000),
  // Not every lane offers air delivery. When false, air rate/cost/transit fields are
  // hidden and air quotes are rejected. Defaults true so existing lanes keep air.
  airEnabled: boolean("air_enabled").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  laneLookup: uniqueIndex("ddp_pricing_lanes_lookup_unique").on(
    table.originCountryCode,
    table.originCity,
    table.destinationCountryCode,
    table.destinationCity,
  ),
}));

export const insertDdpPricingLaneSchema = createInsertSchema(ddpPricingLanes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDdpPricingLane = z.infer<typeof insertDdpPricingLaneSchema>;
export type DdpPricingLane = typeof ddpPricingLanes.$inferSelect;

// Pricing Tiers table (tiered margins per profile based on shipment value)
export const pricingTiers = pgTable("pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  /**
   * Which kind of client account this tier prices: "company" or "individual". A tier belongs to
   * exactly one — there is no shared tier, because a tier that matched both would override the
   * per-account-type default margin and quietly undo the split.
   *
   * Defaults to "company" to match `client_accounts.account_type`; the migration duplicates every
   * pre-split tier into "individual" so both sides start identical.
   */
  accountType: text("account_type").notNull().default(PricingAccountType.COMPANY),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  lookup: index("idx_pricing_tiers_profile_account").on(table.profileId, table.accountType),
}));

export const insertPricingTierSchema = createInsertSchema(pricingTiers).omit({
  id: true,
  createdAt: true,
});

export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type PricingTier = typeof pricingTiers.$inferSelect;

// DDP Pricing Tiers table (tiered DDP markups per profile based on billable KG or CBM)
export const ddpPricingTiers = pgTable("ddp_pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  /** See `pricingTiers.accountType` — same rule, same reason. */
  accountType: text("account_type").notNull().default(PricingAccountType.COMPANY),
  billingUnit: text("billing_unit").notNull().default("KG"),
  // Keep the existing column name for a safe production migration. For DDP,
  // this threshold represents billable quantity rather than a SAR amount.
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDdpPricingTierSchema = createInsertSchema(ddpPricingTiers).omit({
  id: true,
  createdAt: true,
});

export type InsertDdpPricingTier = z.infer<typeof insertDdpPricingTierSchema>;
export type DdpPricingTier = typeof ddpPricingTiers.$inferSelect;

// Shipments table
export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingNumber: text("tracking_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderCompany: text("sender_company"),
  senderAddress: text("sender_address").notNull(),
  senderAddressLine2: text("sender_address_line2"),
  senderCity: text("sender_city").notNull(),
  senderStateOrProvince: text("sender_state_or_province"),
  senderPostalCode: text("sender_postal_code"),
  senderCountry: text("sender_country").notNull(),
  senderPhone: text("sender_phone").notNull(),
  senderEmail: text("sender_email"),
  senderShortAddress: text("sender_short_address"),
  recipientName: text("recipient_name").notNull(),
  recipientCompany: text("recipient_company"),
  recipientAddress: text("recipient_address").notNull(),
  recipientAddressLine2: text("recipient_address_line2"),
  recipientCity: text("recipient_city").notNull(),
  recipientStateOrProvince: text("recipient_state_or_province"),
  recipientPostalCode: text("recipient_postal_code"),
  recipientCountry: text("recipient_country").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  recipientEmail: text("recipient_email"),
  recipientShortAddress: text("recipient_short_address"),
  weight: decimal("weight", { precision: 10, scale: 2 }).notNull(),
  weightUnit: text("weight_unit").default("LB"),
  dimensionalWeight: decimal("dimensional_weight", { precision: 10, scale: 3 }),
  chargeableWeight: decimal("chargeable_weight", { precision: 10, scale: 3 }),
  chargeableWeightUnit: text("chargeable_weight_unit").default("KG"),
  chargeableWeightDetails: text("chargeable_weight_details"),
  length: decimal("length", { precision: 10, scale: 2 }),
  width: decimal("width", { precision: 10, scale: 2 }),
  height: decimal("height", { precision: 10, scale: 2 }),
  dimensionUnit: text("dimension_unit").default("IN"),
  dimensions: text("dimensions"),
  packageType: text("package_type").notNull(),
  numberOfPackages: integer("number_of_packages").default(1),
  packagesData: text("packages_data"),
  shipmentType: text("shipment_type").default("domestic"),
  isDdp: boolean("is_ddp").notNull().default(false),
  fulfillmentType: text("fulfillment_type").notNull().default("carrier"),
  ddpPricingLaneId: varchar("ddp_pricing_lane_id"),
  ddpTransportMethod: text("ddp_transport_method"),
  ddpSupplierName: text("ddp_supplier_name"),
  ddpSupplierPhone: text("ddp_supplier_phone"),
  ddpTotalCbm: decimal("ddp_total_cbm", { precision: 12, scale: 4 }),
  ddpBillableQuantity: decimal("ddp_billable_quantity", { precision: 12, scale: 4 }),
  ddpBillingUnit: text("ddp_billing_unit"),
  ddpRatePerUnitSar: decimal("ddp_rate_per_unit_sar", { precision: 12, scale: 2 }),
  // Real supplier (procurement) cost recorded at booking, separate from the recorded
  // baseRate (lane sell base). Drives real-margin reporting in financial statements
  // without affecting client price or VAT. Null = no supplier cost configured.
  ddpSupplierCostSar: decimal("ddp_supplier_cost_sar", { precision: 12, scale: 2 }),
  ddpSpecialInstructions: text("ddp_special_instructions"),
  ddpTermsAcceptedAt: timestamp("ddp_terms_accepted_at"),
  ddpBrokerAuthorizationAcceptedAt: timestamp("ddp_broker_authorization_accepted_at"),
  serviceType: text("service_type"),
  currency: text("currency").default("SAR"),
  // SAR → shipment.currency multiplier snapshotted at charge time. Null/1 means SAR.
  // Stored monetary columns stay in SAR; multiply by this to render the charged currency.
  fxRate: decimal("fx_rate", { precision: 12, scale: 6 }),
  status: text("status").notNull().default("draft"),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  marginAmount: decimal("margin_amount", { precision: 10, scale: 2 }),
  margin: decimal("margin", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  accountingCurrency: text("accounting_currency").default("SAR"),
  taxScenario: text("tax_scenario"),
  costAmountSar: decimal("cost_amount_sar", { precision: 10, scale: 2 }),
  costTaxAmountSar: decimal("cost_tax_amount_sar", { precision: 10, scale: 2 }),
  sellSubtotalAmountSar: decimal("sell_subtotal_amount_sar", { precision: 10, scale: 2 }),
  sellTaxAmountSar: decimal("sell_tax_amount_sar", { precision: 10, scale: 2 }),
  clientTotalAmountSar: decimal("client_total_amount_sar", { precision: 10, scale: 2 }),
  systemCostTotalAmountSar: decimal("system_cost_total_amount_sar", { precision: 10, scale: 2 }),
  taxPayableAmountSar: decimal("tax_payable_amount_sar", { precision: 10, scale: 2 }),
  revenueExcludingTaxAmountSar: decimal("revenue_excluding_tax_amount_sar", { precision: 10, scale: 2 }),
  extraFeesAmountSar: decimal("extra_fees_amount_sar", { precision: 10, scale: 2 }),
  extraFeesType: text("extra_fees_type"),
  extraFeesWeightValue: decimal("extra_fees_weight_value", { precision: 10, scale: 2 }),
  extraFeesCostAmountSar: decimal("extra_fees_cost_amount_sar", { precision: 10, scale: 2 }),
  extraFeesAddedAt: timestamp("extra_fees_added_at"),
  extraFeesEmailSentAt: timestamp("extra_fees_email_sent_at"),
  carrierCode: text("carrier_code"),
  carrierName: text("carrier_name"),
  // Virtual-carrier routing: when carrierCode is a client-facing virtual carrier (e.g. a
  // downstream courier surfaced on top of Fizzpa/Shipox), providerCarrierCode is the real
  // provider adapter to book with (FIZZPA | SHIPOX) and carrierAssignmentNote is the note
  // written onto the provider's order so their ops know which courier to assign. Null for
  // ordinary carriers, where booking resolves straight off carrierCode.
  providerCarrierCode: text("provider_carrier_code"),
  carrierAssignmentNote: text("carrier_assignment_note"),
  // Admin-created quotation: an admin builds a priced shipment for a client, who is notified
  // and can modify/pay it. isQuote marks it; quoteCreatedByUserId is the admin; the discount /
  // extra-charge / note capture the admin's manual pricing adjustments on top of the auto rate.
  isQuote: boolean("is_quote").notNull().default(false),
  quoteCreatedByUserId: varchar("quote_created_by_user_id"),
  quoteDiscountSar: decimal("quote_discount_sar", { precision: 12, scale: 2 }),
  quoteExtraChargeSar: decimal("quote_extra_charge_sar", { precision: 12, scale: 2 }),
  quoteNote: text("quote_note"),
  carrierIntegrationAccountId: varchar("carrier_integration_account_id"),
  carrierServiceType: text("carrier_service_type"),
  carrierShipmentId: text("carrier_shipment_id"),
  carrierTrackingNumber: text("carrier_tracking_number"),
  carrierPaymentStatus: text("carrier_payment_status").notNull().default("UNPAID"),
  carrierPaidAt: timestamp("carrier_paid_at"),
  carrierPaymentAmountSar: decimal("carrier_payment_amount_sar", { precision: 10, scale: 2 }),
  carrierPaymentReference: text("carrier_payment_reference"),
  carrierPaymentNote: text("carrier_payment_note"),
  carrierPayoutBatchId: varchar("carrier_payout_batch_id"),
  carrierStatus: text("carrier_status").default("pending"),
  // Number of consecutive carrier tracking refreshes that returned the exact
  // same carrier status (used to flag "duplicate status" express shipments).
  carrierStatusRepeatCount: integer("carrier_status_repeat_count").notNull().default(0),
  carrierErrorCode: text("carrier_error_code"),
  carrierErrorMessage: text("carrier_error_message"),
  carrierLastAttemptAt: timestamp("carrier_last_attempt_at"),
  // When the internal shipment status last changed (drives the 24h express
  // stale-status escalation; refreshed only on real status transitions).
  statusChangedAt: timestamp("status_changed_at"),
  carrierAttempts: integer("carrier_attempts").default(0),
  carrierLabelBase64: text("carrier_label_base64"),
  carrierLabelMimeType: text("carrier_label_mime_type").default("application/pdf"),
  carrierLabelFormat: text("carrier_label_format"),
  labelUrl: text("label_url"),
  shipDate: text("ship_date"),
  paymentIntentId: text("payment_intent_id"),
  tapIntegrationAccountId: varchar("tap_integration_account_id"),
  paymentMethod: text("payment_method").default("PAY_NOW"),
  paymentStatus: text("payment_status").default("pending"),
  itemsData: text("items_data"),
  tradeDocumentsData: text("trade_documents_data"),
  // Operations: free-form plan written in the planning stage (editable, reviewable).
  operationPlanNotes: text("operation_plan_notes"),
  // Operations: last-mile delivery carrier name + contact phone.
  lastMileCarrierName: text("last_mile_carrier_name"),
  lastMileCarrierPhone: text("last_mile_carrier_phone"),
  // Sales channels: set when this shipment was created to fulfill an imported order.
  orderId: varchar("order_id"),
  // Carrier pickup: requested during the create/quote flow, booked with the carrier right
  // after the shipment is booked (see requestPickup on the carrier adapters). pickupStatus:
  // "not_requested" | "requested" | "confirmed" | "failed".
  pickupRequested: boolean("pickup_requested").default(false),
  pickupDate: text("pickup_date"),
  pickupReadyTime: text("pickup_ready_time"),
  pickupCloseTime: text("pickup_close_time"),
  pickupLocation: text("pickup_location"),
  pickupInstructions: text("pickup_instructions"),
  pickupConfirmationNumber: text("pickup_confirmation_number"),
  // The carrier station that owns the pickup (FedEx Express returns e.g. "SXJA" from create and
  // requires it back to cancel). Without it a booked FedEx pickup can only be cancelled by phone.
  pickupLocationCode: text("pickup_location_code"),
  pickupStatus: text("pickup_status").default("not_requested"),
  pickupError: text("pickup_error"),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  trackingNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// Shipment Rate Quotes table (for rate discovery)
export const shipmentRateQuotes = pgTable("shipment_rate_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentData: text("shipment_data").notNull(),
  carrierCode: text("carrier_code").notNull(),
  carrierName: text("carrier_name").notNull(),
  carrierIntegrationAccountId: varchar("carrier_integration_account_id"),
  serviceType: text("service_type").notNull(),
  serviceName: text("service_name").notNull(),
  actualWeight: decimal("actual_weight", { precision: 10, scale: 3 }),
  dimensionalWeight: decimal("dimensional_weight", { precision: 10, scale: 3 }),
  chargeableWeight: decimal("chargeable_weight", { precision: 10, scale: 3 }),
  chargeableWeightUnit: text("chargeable_weight_unit").default("KG"),
  chargeableWeightDetails: text("chargeable_weight_details"),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }).notNull(),
  marginPercentage: decimal("margin_percentage", { precision: 5, scale: 2 }).notNull(),
  marginAmount: decimal("margin_amount", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  transitDays: integer("transit_days"),
  estimatedDelivery: timestamp("estimated_delivery"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentRateQuoteSchema = createInsertSchema(shipmentRateQuotes).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentRateQuote = z.infer<typeof insertShipmentRateQuoteSchema>;
export type ShipmentRateQuote = typeof shipmentRateQuotes.$inferSelect;

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentId: varchar("shipment_id"),
  invoiceType: text("invoice_type").notNull().default("SHIPMENT"),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  // Tax scenario + currency + embedded VAT captured at creation so Zoho mirrors the
  // exact VAT the platform computed (taxAmountSar is the VAT already inside `amount`).
  taxScenario: text("tax_scenario"),
  taxAmountSar: decimal("tax_amount_sar", { precision: 10, scale: 2 }),
  currency: text("currency").default("SAR"),
  tapIntegrationAccountId: varchar("tap_integration_account_id"),
  zohoIntegrationAccountId: varchar("zoho_integration_account_id"),
  zohoInvoiceId: text("zoho_invoice_id"), // Zoho Books invoice ID
  zohoInvoiceUrl: text("zoho_invoice_url"), // Link to Zoho invoice
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  invoiceNumber: true,
  createdAt: true,
  paidAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: text("transaction_id"),
  integrationAccountId: varchar("integration_account_id"),
  zohoPaymentId: text("zoho_payment_id"), // Zoho Books customer payment ID (dedup)
  stripePaymentIntentId: text("stripe_payment_intent_id"), // Stripe payment intent ID (legacy)
  moyasarPaymentId: text("moyasar_payment_id"), // Moyasar payment ID
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // One payment row per gateway transaction. Backstops the app-level dedup against the
  // redirect/webhook race that otherwise duplicated rows. Partial: manual/credit payments
  // may have a null transaction_id and are not constrained.
  txnUnique: uniqueIndex("ux_payments_txn")
    .on(table.transactionId)
    .where(sql`${table.transactionId} IS NOT NULL`),
}));

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const shipmentRefundRequests = pgTable("shipment_refund_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  invoiceId: varchar("invoice_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("PENDING"),
  requestedByUserId: varchar("requested_by_user_id").notNull(),
  requestedByActorType: text("requested_by_actor_type").notNull(),
  accountManagerUserId: varchar("account_manager_user_id"),
  accountManagerApprovalStatus: text("account_manager_approval_status").notNull().default("PENDING"),
  accountManagerApprovedByUserId: varchar("account_manager_approved_by_user_id"),
  accountManagerApprovedAt: timestamp("account_manager_approved_at"),
  financeApprovalStatus: text("finance_approval_status").notNull().default("PENDING"),
  financeApprovedByUserId: varchar("finance_approved_by_user_id"),
  financeApprovedAt: timestamp("finance_approved_at"),
  completedAt: timestamp("completed_at"),
  rejectionReason: text("rejection_reason"),
  // Tap refund id when the refund was auto-issued to the gateway (still-booked cancellations).
  gatewayRefundId: text("gateway_refund_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShipmentRefundRequestSchema = createInsertSchema(shipmentRefundRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipmentRefundRequest = z.infer<typeof insertShipmentRefundRequestSchema>;
export type ShipmentRefundRequest = typeof shipmentRefundRequests.$inferSelect;

export const abandonedShipmentRecoveries = pgTable("abandoned_shipment_recoveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().unique(),
  clientAccountId: varchar("client_account_id").notNull(),
  status: text("status").notNull().default(AbandonedShipmentRecoveryStatus.NOT_CONTACTED),
  lastAction: text("last_action"),
  discountType: text("discount_type"),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  discountFinalPrice: decimal("discount_final_price", { precision: 10, scale: 2 }),
  discountChannel: text("discount_channel"),
  discountExpiresAt: timestamp("discount_expires_at"),
  discountMessage: text("discount_message"),
  discountSentAt: timestamp("discount_sent_at"),
  reminderChannel: text("reminder_channel"),
  reminderCount: integer("reminder_count").notNull().default(0),
  reminderSentAt: timestamp("reminder_sent_at"),
  dismissedAt: timestamp("dismissed_at"),
  recoveredAt: timestamp("recovered_at"),
  createdByUserId: varchar("created_by_user_id"),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAbandonedShipmentRecoverySchema = createInsertSchema(abandonedShipmentRecoveries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAbandonedShipmentRecovery = z.infer<typeof insertAbandonedShipmentRecoverySchema>;
export type AbandonedShipmentRecovery = typeof abandonedShipmentRecoveries.$inferSelect;

export const tapSavedCards = pgTable("tap_saved_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  tapIntegrationAccountId: varchar("tap_integration_account_id"),
  tapCustomerId: text("tap_customer_id").notNull(),
  tapCardId: text("tap_card_id").notNull().unique(),
  paymentAgreementId: text("payment_agreement_id"),
  brand: text("brand"),
  scheme: text("scheme"),
  funding: text("funding"),
  lastFour: text("last_four"),
  firstSix: text("first_six"),
  firstEight: text("first_eight"),
  expMonth: integer("exp_month"),
  expYear: integer("exp_year"),
  cardholderName: text("cardholder_name"),
  fingerprint: text("fingerprint"),
  isDefault: boolean("is_default").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertTapSavedCardSchema = createInsertSchema(tapSavedCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertTapSavedCard = z.infer<typeof insertTapSavedCardSchema>;
export type TapSavedCard = typeof tapSavedCards.$inferSelect;

export const carrierPayoutBatches = pgTable("carrier_payout_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierCode: text("carrier_code"),
  carrierName: text("carrier_name").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  status: text("status").notNull().default("OPEN"),
  shipmentCount: integer("shipment_count").notNull().default(0),
  totalCarrierCostSar: decimal("total_carrier_cost_sar", { precision: 10, scale: 2 }).notNull().default("0"),
  totalCostTaxSar: decimal("total_cost_tax_sar", { precision: 10, scale: 2 }).notNull().default("0"),
  totalCarrierCostWithTaxSar: decimal("total_carrier_cost_with_tax_sar", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id"),
  paidByUserId: varchar("paid_by_user_id"),
  paidAt: timestamp("paid_at"),
  zohoExpenseId: text("zoho_expense_id"), // Zoho Books expense ID for the carrier payout
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCarrierPayoutBatchSchema = createInsertSchema(carrierPayoutBatches).omit({
  id: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarrierPayoutBatch = z.infer<typeof insertCarrierPayoutBatchSchema>;
export type CarrierPayoutBatch = typeof carrierPayoutBatches.$inferSelect;

// Client User Permissions table - stores permissions for each client user
export const clientUserPermissions = pgTable("client_user_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  permissions: text("permissions").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientUserPermissionSchema = createInsertSchema(clientUserPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientUserPermission = z.infer<typeof insertClientUserPermissionSchema>;
export type ClientUserPermission = typeof clientUserPermissions.$inferSelect;

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================
// RBAC TABLES (Role-Based Access Control)
// ============================================

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  iconKey: text("icon_key").notNull(),
  colorKey: text("color_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

// Roles table
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: varchar("department_id"),
  name: text("name").notNull(),
  description: text("description"),
  hierarchyLevel: text("hierarchy_level"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  departmentNameUnique: uniqueIndex("roles_department_id_name_unique").on(table.departmentId, table.name),
}));

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export const ACCOUNT_MANAGER_SYSTEM_ROLE_ID = "system:account-manager";
export const ACCOUNT_MANAGER_SYSTEM_ROLE_NAME = "Account Manager";
export const ACCOUNT_MANAGER_SYSTEM_ROLE_DESCRIPTION =
  "Fixed scoped access for assigned clients with approval-based client changes.";

export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  departmentId: varchar("department_id").notNull(),
  roleId: varchar("role_id").notNull(),
  personalMessage: text("personal_message"),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default(UserInvitationStatus.PENDING),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  invitedByUserId: varchar("invited_by_user_id"),
  acceptedUserId: varchar("accepted_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  sentAt: true,
  acceptedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type UserInvitation = typeof userInvitations.$inferSelect;

// Permissions table
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  resource: text("resource").notNull(), // e.g., "shipments", "clients", "invoices"
  action: text("action").notNull(), // e.g., "create", "read", "update", "delete"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// UserRoles junction table
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  roleId: varchar("role_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// RolePermissions junction table
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull(),
  permissionId: varchar("permission_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export const accountManagerAssignments = pgTable("account_manager_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountManagerUserId: varchar("account_manager_user_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountManagerAssignmentSchema = createInsertSchema(accountManagerAssignments).omit({
  id: true,
  createdAt: true,
});

export type InsertAccountManagerAssignment = z.infer<typeof insertAccountManagerAssignmentSchema>;
export type AccountManagerAssignment = typeof accountManagerAssignments.$inferSelect;

export const AccountManagerChangeRequestType = {
  PROFILE_UPDATE: "profile_update",
  SETTINGS_UPDATE: "settings_update",
} as const;

export type AccountManagerChangeRequestTypeValue =
  typeof AccountManagerChangeRequestType[keyof typeof AccountManagerChangeRequestType];

export const AccountManagerChangeRequestStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type AccountManagerChangeRequestStatusValue =
  typeof AccountManagerChangeRequestStatus[keyof typeof AccountManagerChangeRequestStatus];

export const accountManagerClientChangeRequests = pgTable("account_manager_client_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountManagerUserId: varchar("account_manager_user_id").notNull(),
  clientAccountId: varchar("client_account_id").notNull(),
  requestType: text("request_type").notNull(),
  requestedChanges: text("requested_changes").notNull(),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  reviewedByUserId: varchar("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAccountManagerClientChangeRequestSchema = createInsertSchema(accountManagerClientChangeRequests).omit({
  id: true,
  reviewedByUserId: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAccountManagerClientChangeRequest = z.infer<typeof insertAccountManagerClientChangeRequestSchema>;
export type AccountManagerClientChangeRequest = typeof accountManagerClientChangeRequests.$inferSelect;

// ============================================
// INTEGRATION AND WEBHOOK TABLES
// ============================================

// Integration Logs table (for FedEx, Zoho, etc.)
export const integrationLogs = pgTable("integration_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: text("service_name").notNull(), // e.g., "fedex", "zoho"
  operation: text("operation").notNull(), // e.g., "create_shipment", "sync_invoice"
  requestPayload: text("request_payload"),
  responsePayload: text("response_payload"),
  statusCode: integer("status_code"),
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertIntegrationLog = z.infer<typeof insertIntegrationLogSchema>;
export type IntegrationLog = typeof integrationLogs.$inferSelect;

export const integrationAccounts = pgTable("integration_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appKey: text("app_key").notNull(),
  appName: text("app_name").notNull(),
  category: text("category").notNull(),
  accountName: text("account_name").notNull(),
  environment: text("environment").notNull().default("sandbox"),
  countryCode: text("country_code"),
  region: text("region"),
  priority: integer("priority").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  settings: text("settings"),
  capabilities: text("capabilities"),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestSuccess: boolean("last_test_success"),
  lastTestMessage: text("last_test_message"),
  createdByUserId: varchar("created_by_user_id"),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  defaultPerScope: uniqueIndex("integration_accounts_default_scope_unique")
    .on(table.appKey, table.environment, sql`coalesce(${table.countryCode}, '')`)
    .where(sql`${table.isDefault} = true`),
}));

export const insertIntegrationAccountSchema = createInsertSchema(integrationAccounts).omit({
  id: true,
  lastTestedAt: true,
  lastTestSuccess: true,
  lastTestMessage: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationAccount = z.infer<typeof insertIntegrationAccountSchema>;
export type IntegrationAccount = typeof integrationAccounts.$inferSelect;

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;

// Webhook Events table
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // e.g., "fedex", "stripe"
  eventType: text("event_type").notNull(), // e.g., "shipment.status_update", "payment.completed"
  payload: text("payload").notNull(),
  signature: text("signature"),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// Login schema for validation
export const loginSchema = z.object({
  username: z.string().min(1, "Email, username or phone is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

// One-time email login codes (passwordless sign-in via emailed OTP).
export const emailLoginOtps = pgTable("email_login_otps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmailLoginOtp = typeof emailLoginOtps.$inferSelect;
export type InsertEmailLoginOtp = typeof emailLoginOtps.$inferInsert;

// Password set / reset tokens. purpose: "reset" (forgot password) or "onboard" (set initial
// password from a welcome email).
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull().default("reset"),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Mobile / API refresh tokens. The web app keeps using cookie sessions; native clients
// (React Native) authenticate with a short-lived access token plus one of these rotating
// refresh tokens. Only the sha256 hash is stored — the raw token is shown once, at issue.
export const mobileRefreshTokens = pgTable(
  "mobile_refresh_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    // Rotation lineage. Every refresh issues a new row sharing the family; replaying an
    // already-rotated token revokes the whole family (standard stolen-token signal).
    familyId: varchar("family_id").notNull(),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    platform: text("platform").notNull().default("unknown"),
    appVersion: text("app_version"),
    expiresAt: timestamp("expires_at").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("ux_mobile_refresh_token_hash").on(table.tokenHash),
    userIdx: index("ix_mobile_refresh_user").on(table.userId),
    familyIdx: index("ix_mobile_refresh_family").on(table.familyId),
  }),
);

export type MobileRefreshToken = typeof mobileRefreshTokens.$inferSelect;
export type InsertMobileRefreshToken = typeof mobileRefreshTokens.$inferInsert;

export const MobilePlatform = {
  IOS: "ios",
  ANDROID: "android",
  UNKNOWN: "unknown",
} as const;

export type MobilePlatformValue = typeof MobilePlatform[keyof typeof MobilePlatform];

// Body accepted by POST /api/auth/token and reused by the OTP token exchange.
export const mobileDeviceSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required").max(200),
  deviceName: z.string().max(200).optional(),
  platform: z.enum(["ios", "android", "unknown"]).default("unknown"),
  appVersion: z.string().max(50).optional(),
});

export const mobileTokenRequestSchema = mobileDeviceSchema.extend({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const mobileRefreshRequestSchema = z.object({
  refreshToken: z.string().min(20, "refreshToken is required"),
});

// Application form schema
export const applicationFormSchema = z.object({
  accountType: z.enum(["company", "individual"]),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(8, "Phone number must be at least 8 digits"),
  companyName: z.string().optional(),
  documents: z.array(z.string()).optional(),
  // Default Shipping Address
  shippingContactName: z.string().min(2, "Contact name is required"),
  shippingContactPhone: z.string().min(8, "Contact phone is required"),
  shippingCountryCode: z.string().min(2, "Country is required"),
  shippingStateOrProvince: z.string().min(2, "State/Province is required"),
  shippingCity: z.string().min(2, "City is required"),
  shippingPostalCode: z.string().min(3, "Postal code is required"),
  shippingAddressLine1: z.string().min(5, "Address is required"),
  shippingAddressLine2: z.string().optional(),
  shippingShortAddress: z.string().optional(),
}).refine(
  (data) => {
    // Require short address for Saudi Arabia
    if (data.shippingCountryCode === "SA") {
      return !!data.shippingShortAddress && data.shippingShortAddress.length >= 3;
    }
    return true;
  },
  {
    message: "Short address is required for Saudi Arabia addresses",
    path: ["shippingShortAddress"],
  }
);

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;

// Shipment form schema for clients
export const createShipmentSchema = z.object({
  senderName: z.string().min(2, "Sender name is required"),
  senderAddress: z.string().min(5, "Sender address is required"),
  senderCity: z.string().min(2, "Sender city is required"),
  senderCountry: z.string().min(2, "Sender country is required"),
  senderPhone: z.string().min(8, "Sender phone is required"),
  recipientName: z.string().min(2, "Recipient name is required"),
  recipientAddress: z.string().min(5, "Recipient address is required"),
  recipientCity: z.string().min(2, "Recipient city is required"),
  recipientCountry: z.string().min(2, "Recipient country is required"),
  recipientPhone: z.string().min(8, "Recipient phone is required"),
  weight: z.string().min(1, "Weight is required"),
  dimensions: z.string().optional(),
  packageType: z.string().min(1, "Package type is required"),
});

export type CreateShipmentData = z.infer<typeof createShipmentSchema>;

// Idempotency records table for API idempotency
export const idempotencyRecords = pgTable("idempotency_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  response: text("response").notNull(),
  statusCode: integer("status_code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertIdempotencyRecordSchema = createInsertSchema(idempotencyRecords).omit({
  id: true,
});

export type InsertIdempotencyRecord = z.infer<typeof insertIdempotencyRecordSchema>;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;

// Policies
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isPublished: boolean("is_published").default(true).notNull(),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// Policy Versions
export const policyVersions = pgTable("policy_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull().references(() => policies.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  changedBy: varchar("changed_by"),
  changeNote: varchar("change_note", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPolicyVersionSchema = createInsertSchema(policyVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertPolicyVersion = z.infer<typeof insertPolicyVersionSchema>;
export type PolicyVersion = typeof policyVersions.$inferSelect;

// Credit Invoice Status
export const CreditInvoiceStatus = {
  UNPAID: "UNPAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  CANCELLED: "CANCELLED",
} as const;

export type CreditInvoiceStatusValue = typeof CreditInvoiceStatus[keyof typeof CreditInvoiceStatus];

// Shipment Payment Method
export const ShipmentPaymentMethod = {
  PAY_NOW: "PAY_NOW",
  CREDIT: "CREDIT",
} as const;

export type ShipmentPaymentMethodValue = typeof ShipmentPaymentMethod[keyof typeof ShipmentPaymentMethod];

export const creditAccessRequests = pgTable("credit_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  requestedByUserId: varchar("requested_by_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  adminNotes: text("admin_notes"),
  reviewedByUserId: varchar("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCreditAccessRequestSchema = createInsertSchema(creditAccessRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCreditAccessRequest = z.infer<typeof insertCreditAccessRequestSchema>;
export type CreditAccessRequest = typeof creditAccessRequests.$inferSelect;

// Client requests to unlock the bundled Sales Channels feature (Orders / Sales Channels /
// Assignment Rules). Mirrors the credit-access request flow.
export const salesFeatureAccessRequests = pgTable("sales_feature_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  requestedByUserId: varchar("requested_by_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  adminNotes: text("admin_notes"),
  reviewedByUserId: varchar("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSalesFeatureAccessRequestSchema = createInsertSchema(salesFeatureAccessRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSalesFeatureAccessRequest = z.infer<typeof insertSalesFeatureAccessRequestSchema>;
export type SalesFeatureAccessRequest = typeof salesFeatureAccessRequests.$inferSelect;

// Credit Invoices table
export const creditInvoices = pgTable("credit_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentId: varchar("shipment_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("UNPAID"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  dueAt: timestamp("due_at").notNull(),
  paidAt: timestamp("paid_at"),
  remindersSent: integer("reminders_sent").notNull().default(0),
  lastReminderAt: timestamp("last_reminder_at"),
  nextReminderAt: timestamp("next_reminder_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCreditInvoiceSchema = createInsertSchema(creditInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCreditInvoice = z.infer<typeof insertCreditInvoiceSchema>;
export type CreditInvoice = typeof creditInvoices.$inferSelect;

// Credit Notification Events table
export const creditNotificationEvents = pgTable("credit_notification_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  creditInvoiceId: varchar("credit_invoice_id").notNull(),
  type: text("type").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  meta: text("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditNotificationEventSchema = createInsertSchema(creditNotificationEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertCreditNotificationEvent = z.infer<typeof insertCreditNotificationEventSchema>;
export type CreditNotificationEvent = typeof creditNotificationEvents.$inferSelect;

// Credit Transactions ledger (audit log of credit debits/credits per client).
// Available credit is derived as creditLimitSar - SUM(UNPAID creditInvoices); this
// table records the movement history (DEBIT on shipment, CREDIT on settlement).
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  shipmentId: varchar("shipment_id"),
  creditInvoiceId: varchar("credit_invoice_id"),
  type: text("type").notNull(), // DEBIT | CREDIT
  amountSar: decimal("amount_sar", { precision: 12, scale: 2 }).notNull(),
  balanceAfterSar: decimal("balance_after_sar", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;

// Shipment tracking numbers — editable list, position 0 is the primary number that
// mirrors shipments.carrierTrackingNumber.
export const shipmentTrackingNumbers = pgTable("shipment_tracking_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  value: text("value").notNull(),
  position: integer("position").notNull().default(0),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentTrackingNumberSchema = createInsertSchema(shipmentTrackingNumbers).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentTrackingNumber = z.infer<typeof insertShipmentTrackingNumberSchema>;
export type ShipmentTrackingNumber = typeof shipmentTrackingNumbers.$inferSelect;

// Shipment operational expenses — internal cost only (never billed to the client),
// recorded in the final stage and surfaced in the financial statements.
export const shipmentExpenses = pgTable("shipment_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  description: text("description").notNull(),
  amountSar: decimal("amount_sar", { precision: 12, scale: 2 }).notNull(),
  createdByUserId: varchar("created_by_user_id"),
  zohoExpenseId: text("zoho_expense_id"), // Zoho Books expense ID
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentExpenseSchema = createInsertSchema(shipmentExpenses).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentExpense = z.infer<typeof insertShipmentExpenseSchema>;
export type ShipmentExpense = typeof shipmentExpenses.$inferSelect;

// ---------------------------------------------------------------------------
// Sales Channels & Local Shipments (see docs/sales-channels-plan.md)
// ---------------------------------------------------------------------------

export const SalesChannelPlatform = {
  WOOCOMMERCE: "woocommerce",
  SHOPIFY: "shopify",
  SALLA: "salla",
  ZID: "zid",
  MAGENTO: "magento",
  CUSTOM: "custom",
} as const;

export type SalesChannelPlatformValue =
  typeof SalesChannelPlatform[keyof typeof SalesChannelPlatform];

export const SalesChannelStatus = {
  CONNECTED: "connected",
  ERROR: "error",
  DISCONNECTED: "disconnected",
} as const;

export type SalesChannelStatusValue =
  typeof SalesChannelStatus[keyof typeof SalesChannelStatus];

export const CarrierMode = {
  MANUAL: "manual",
  AUTO: "auto",
} as const;

export type CarrierModeValue = typeof CarrierMode[keyof typeof CarrierMode];

export const OrderStatus = {
  NEW: "new",
  READY_TO_SHIP: "ready_to_ship",
  ASSIGNED: "assigned",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  ON_HOLD: "on_hold",
} as const;

export type OrderStatusValue = typeof OrderStatus[keyof typeof OrderStatus];

// Connected e-commerce store. credentialsEncrypted holds OAuth tokens (Salla/Shopify)
// or per-store REST keys (WooCommerce), encrypted with INTEGRATION_CONFIG_SECRET.
export const salesChannels = pgTable("sales_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  storeUrl: text("store_url"),
  status: text("status").notNull().default("disconnected"),
  credentialsEncrypted: text("credentials_encrypted"),
  webhookSecret: text("webhook_secret"),
  syncSettings: text("sync_settings"), // json: { autoSync, syncWindow, importPaidOnly }
  carrierMode: text("carrier_mode").notNull().default("manual"),
  defaultCarrierRuleId: varchar("default_carrier_rule_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSalesChannelSchema = createInsertSchema(salesChannels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSalesChannel = z.infer<typeof insertSalesChannelSchema>;
export type SalesChannel = typeof salesChannels.$inferSelect;

// Imported store order. items are informational only (never used for customs).
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  salesChannelId: varchar("sales_channel_id").notNull(),
  externalOrderId: text("external_order_id").notNull(),
  externalOrderNumber: text("external_order_number"),
  status: text("status").notNull().default("new"),
  customer: text("customer"), // json: { name, phone, email }
  shipTo: text("ship_to"), // json: { address, city, region, country, postal }
  items: text("items"), // json[] informational only
  packageWeightKg: decimal("package_weight_kg", { precision: 10, scale: 3 }),
  packageDims: text("package_dims"), // json: { length, width, height, unit }
  packagePieces: integer("package_pieces").notNull().default(1),
  currency: text("currency").notNull().default("SAR"),
  orderTotal: decimal("order_total", { precision: 12, scale: 2 }),
  carrierMode: text("carrier_mode").notNull().default("manual"),
  assignedCarrierCode: text("assigned_carrier_code"),
  assignmentRuleId: varchar("assignment_rule_id"),
  shipmentId: varchar("shipment_id"),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Idempotent ingest: one row per external order per channel.
  channelExternalUnique: uniqueIndex("orders_channel_external_unique").on(
    table.salesChannelId,
    table.externalOrderId,
  ),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Opt-in carrier auto-assignment rule (evaluated by priority when a channel is auto).
export const carrierAssignmentRules = pgTable("carrier_assignment_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  conditions: text("conditions"), // json: { regionIn, cityIn, weightMin, weightMax, valueMin, valueMax, channelId }
  strategy: text("strategy").notNull().default("specific_carrier"), // specific_carrier | cheapest | fastest
  carrierCode: text("carrier_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCarrierAssignmentRuleSchema = createInsertSchema(carrierAssignmentRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarrierAssignmentRule = z.infer<typeof insertCarrierAssignmentRuleSchema>;
export type CarrierAssignmentRule = typeof carrierAssignmentRules.$inferSelect;

// Local-shipment markup, per carrier + weight band. Client price = carrier base rate +
// this markup, then fed to calculateShipmentAccounting as (baseRate, marginAmount).
export const localCarrierPricingTiers = pgTable("local_carrier_pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierCode: text("carrier_code").notNull(),
  minWeightKg: decimal("min_weight_kg", { precision: 10, scale: 3 }).notNull().default("0"),
  maxWeightKg: decimal("max_weight_kg", { precision: 10, scale: 3 }), // null = no upper bound
  // Rate-card carrier base cost for this band, used when the carrier exposes no live
  // rate API. Ignored when a live carrier rate is available. null = live rate required.
  baseRateSar: decimal("base_rate_sar", { precision: 12, scale: 2 }),
  markupType: text("markup_type").notNull().default("percent"), // percent | flat
  markupValue: decimal("markup_value", { precision: 12, scale: 2 }).notNull().default("0"),
  minCharge: decimal("min_charge", { precision: 12, scale: 2 }), // optional client-price floor
  clientProfile: text("client_profile"), // regular | mid_level | vip | null (any)
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLocalCarrierPricingTierSchema = createInsertSchema(localCarrierPricingTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLocalCarrierPricingTier = z.infer<typeof insertLocalCarrierPricingTierSchema>;
export type LocalCarrierPricingTier = typeof localCarrierPricingTiers.$inferSelect;

// Client-facing "virtual" carriers layered on top of an aggregator provider (Fizzpa /
// Shipox) whose API exposes no downstream-carrier list or selection. Each row is a
// display carrier a client can pick at shipment creation (with its own local rate card
// keyed by `code`). On booking we route to the real `provider` adapter and write
// `noteTemplate` onto the provider's order so their ops assign the intended courier.
export const VIRTUAL_CARRIER_PROVIDERS = ["fizzpa", "shipox"] as const;
export type VirtualCarrierProvider = (typeof VIRTUAL_CARRIER_PROVIDERS)[number];

export const virtualCarriers = pgTable("virtual_carriers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // client-facing carrier code, e.g. "FIZZ_XPRESS"
  name: text("name").notNull(), // display name shown to clients, e.g. "X Express"
  provider: text("provider").notNull(), // fizzpa | shipox — the real booking adapter
  // Note written onto the provider order so their dashboard shows which downstream courier
  // to assign. Displayed name is substituted for {name} if present.
  noteTemplate: text("note_template").notNull().default(""),
  // Admin-uploaded brand logo (small image data URI). Surfaced in /api/carrier-logos keyed
  // by `code` so the client rates UI shows it, exactly like Apps-tab carrier logos.
  logo: text("logo"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVirtualCarrierSchema = createInsertSchema(virtualCarriers, {
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may only contain letters, numbers, hyphen and underscore"),
  name: z.string().trim().min(1, "Name is required").max(120),
  provider: z.enum(VIRTUAL_CARRIER_PROVIDERS),
  noteTemplate: z.string().trim().max(500).optional().default(""),
}).omit({
  id: true,
  logo: true, // uploaded/removed only via the dedicated logo endpoint (validated separately)
  createdAt: true,
  updatedAt: true,
});

export type InsertVirtualCarrier = z.infer<typeof insertVirtualCarrierSchema>;
export type VirtualCarrier = typeof virtualCarriers.$inferSelect;

// Admin-uploaded brand logo per integration app (Apps tab). Keyed by the app definition
// key (fedex, smsa, …). Logo is a small image data URI so it needs no object storage.
export const integrationAppLogos = pgTable("integration_app_logos", {
  appKey: varchar("app_key").primaryKey(),
  logo: text("logo").notNull(), // data:image/*;base64,...
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type IntegrationAppLogo = typeof integrationAppLogos.$inferSelect;

export const operationProfiles = pgTable("operation_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  level: text("level").notNull().default("agent"),
  supervisorUserId: varchar("supervisor_user_id"),
  canReceiveAssignments: boolean("can_receive_assignments").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOperationProfileSchema = createInsertSchema(operationProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOperationProfile = z.infer<typeof insertOperationProfileSchema>;
export type OperationProfile = typeof operationProfiles.$inferSelect;

export const shipmentAssignments = pgTable("shipment_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  assignedToUserId: varchar("assigned_to_user_id").notNull(),
  assignedByUserId: varchar("assigned_by_user_id"),
  shipmentKind: text("shipment_kind").notNull(),
  status: text("status").notNull().default(OperationAssignmentStatus.ACTIVE),
  reason: text("reason"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentAssignmentSchema = createInsertSchema(shipmentAssignments).omit({
  id: true,
  assignedAt: true,
  createdAt: true,
});

export type InsertShipmentAssignment = z.infer<typeof insertShipmentAssignmentSchema>;
export type ShipmentAssignment = typeof shipmentAssignments.$inferSelect;

export const shipmentOperationEvents = pgTable("shipment_operation_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  actorUserId: varchar("actor_user_id"),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  audience: text("audience").notNull().default(OperationEventAudience.INTERNAL),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShipmentOperationEventSchema = createInsertSchema(shipmentOperationEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentOperationEvent = z.infer<typeof insertShipmentOperationEventSchema>;
export type ShipmentOperationEvent = typeof shipmentOperationEvents.$inferSelect;

// Verbatim carrier scan events. The point of this table is fidelity: `description` holds the
// carrier's OWN wording, never one of our labels, and `carrierLocalTime` holds the wall-clock
// string the carrier reported so the hub can show "10:23 (-07:00)" the way the carrier's own
// site does. `occurredAt` is the same moment as an absolute instant, for ordering and queries.
//
// Kept separate from shipment_operation_events, which is our internal audit trail (who did what
// in the hub). Mixing the two would let our own prose masquerade as a carrier scan.
export const shipmentCarrierTrackingEvents = pgTable("shipment_carrier_tracking_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  carrierCode: text("carrier_code").notNull(),
  /**
   * Stable per-event identity, used for the idempotent upsert. Built from the carrier's own
   * fields (timestamp + code + description + location), because none of FedEx/DHL/Aramex issue
   * an event id. Without it every 10-minute poll would re-insert the whole scan history.
   */
  eventKey: text("event_key").notNull(),
  /** Carrier's own event code: FedEx `eventType` (PU), DHL `typeCode` (PU), Aramex `UpdateCode`. */
  eventCode: text("event_code"),
  /** The carrier's exact text. Never one of our labels, never reworded, never title-cased. */
  description: text("description").notNull(),
  /** The event instant. Correct even when the carrier reports a local wall-clock. */
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  /**
   * The wall-clock the carrier actually printed, with its offset when the carrier supplies one:
   * "2026-08-15T10:23:00-07:00". Stored as text on purpose — a timestamptz column would
   * normalise the offset away, and then we could no longer show the carrier's own local time.
   */
  carrierLocalTime: text("carrier_local_time"),
  /** Just the offset, e.g. "-07:00". Null when the carrier does not report one. */
  carrierUtcOffset: text("carrier_utc_offset"),
  location: text("location"),
  /** FedEx exception scans; the "why is it stuck" text operators currently never see. */
  exceptionCode: text("exception_code"),
  exceptionDescription: text("exception_description"),
  /** DHL delivery scans. May be empty by design under GDPR. */
  signedBy: text("signed_by"),
  /** DHL `remarks[].value`/`.details`, FedEx `ancillaryDetails[].reasonDescription`. */
  remarks: text("remarks"),
  /** The untouched carrier event object, so a future field never needs a backfill. */
  raw: text("raw"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  shipmentIdx: index("idx_carrier_tracking_events_shipment").on(table.shipmentId, table.occurredAt),
  uniqueEvent: uniqueIndex("ux_carrier_tracking_events_key").on(table.shipmentId, table.eventKey),
}));

export const insertShipmentCarrierTrackingEventSchema = createInsertSchema(shipmentCarrierTrackingEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentCarrierTrackingEvent = z.infer<typeof insertShipmentCarrierTrackingEventSchema>;
export type ShipmentCarrierTrackingEvent = typeof shipmentCarrierTrackingEvents.$inferSelect;

export const shipmentOperationTasks = pgTable("shipment_operation_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  taskKey: text("task_key").notNull(),
  stageKey: text("stage_key").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default(OperationTaskStatus.PENDING),
  assignedToUserId: varchar("assigned_to_user_id"),
  completedByUserId: varchar("completed_by_user_id"),
  completedAt: timestamp("completed_at"),
  dueAt: timestamp("due_at"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  shipmentTaskUnique: uniqueIndex("shipment_operation_tasks_unique").on(table.shipmentId, table.taskKey),
}));

export const insertShipmentOperationTaskSchema = createInsertSchema(shipmentOperationTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipmentOperationTask = z.infer<typeof insertShipmentOperationTaskSchema>;
export type ShipmentOperationTask = typeof shipmentOperationTasks.$inferSelect;

export const shipmentOperationNotes = pgTable("shipment_operation_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  authorUserId: varchar("author_user_id").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default(OperationNoteVisibility.INTERNAL),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertShipmentOperationNoteSchema = createInsertSchema(shipmentOperationNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertShipmentOperationNote = z.infer<typeof insertShipmentOperationNoteSchema>;
export type ShipmentOperationNote = typeof shipmentOperationNotes.$inferSelect;

export const shipmentOperationNoteMentions = pgTable("shipment_operation_note_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull(),
  mentionedUserId: varchar("mentioned_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  noteMentionUnique: uniqueIndex("shipment_operation_note_mentions_unique").on(table.noteId, table.mentionedUserId),
}));

export const insertShipmentOperationNoteMentionSchema = createInsertSchema(shipmentOperationNoteMentions).omit({
  id: true,
  createdAt: true,
});

export type InsertShipmentOperationNoteMention = z.infer<typeof insertShipmentOperationNoteMentionSchema>;
export type ShipmentOperationNoteMention = typeof shipmentOperationNoteMentions.$inferSelect;

export const shipmentSpecialHandling = pgTable("shipment_special_handling", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().unique(),
  priority: text("priority").notNull().default("normal"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default(OperationSpecialHandlingStatus.OPEN),
  assignedToUserId: varchar("assigned_to_user_id"),
  createdByUserId: varchar("created_by_user_id"),
  resolvedByUserId: varchar("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShipmentSpecialHandlingSchema = createInsertSchema(shipmentSpecialHandling).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipmentSpecialHandling = z.infer<typeof insertShipmentSpecialHandlingSchema>;
export type ShipmentSpecialHandling = typeof shipmentSpecialHandling.$inferSelect;

export const shipmentAttentionFlags = pgTable("shipment_attention_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull(),
  issueType: text("issue_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default(OperationAttentionStatus.OPEN),
  details: text("details"),
  metadata: text("metadata"),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedByUserId: varchar("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Only one OPEN flag per shipment+issueType. Partial so historical RESOLVED rows
  // don't collide when an OPEN flag is resolved (or the same issue recurs later).
  shipmentAttentionOpenUnique: uniqueIndex("shipment_attention_flags_open_unique")
    .on(table.shipmentId, table.issueType)
    .where(sql`${table.status} = 'OPEN'`),
}));

export const insertShipmentAttentionFlagSchema = createInsertSchema(shipmentAttentionFlags).omit({
  id: true,
  detectedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipmentAttentionFlag = z.infer<typeof insertShipmentAttentionFlagSchema>;
export type ShipmentAttentionFlag = typeof shipmentAttentionFlags.$inferSelect;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("info"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  actionUrl: text("action_url"),
  emailSentAt: timestamp("email_sent_at"),
  emailStatus: text("email_status"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  emailSentAt: true,
  emailStatus: true,
  readAt: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  availableVariables: text("available_variables").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// HS Code source enum
export const HsCodeSource = {
  USER: "USER",
  FEDEX: "FEDEX",
  HISTORY: "HISTORY",
  UNKNOWN: "UNKNOWN",
} as const;

export type HsCodeSourceValue = typeof HsCodeSource[keyof typeof HsCodeSource];

// HS Code confidence levels
export const HsCodeConfidence = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  MISSING: "MISSING",
} as const;

export type HsCodeConfidenceValue = typeof HsCodeConfidence[keyof typeof HsCodeConfidence];

// Item categories for HS code classification
export const ItemCategory = {
  ELECTRONICS: "electronics",
  CLOTHING: "clothing",
  FOOD: "food",
  COSMETICS: "cosmetics",
  PHARMACEUTICALS: "pharmaceuticals",
  MACHINERY: "machinery",
  CHEMICALS: "chemicals",
  TEXTILES: "textiles",
  METALS: "metals",
  PLASTICS: "plastics",
  FURNITURE: "furniture",
  AUTOMOTIVE: "automotive",
  TOYS: "toys",
  SPORTS: "sports",
  DOCUMENTS: "documents",
  SAMPLES: "samples",
  OTHER: "other",
} as const;

export type ItemCategoryValue = typeof ItemCategory[keyof typeof ItemCategory];

export const FedExTradeDocumentType = {
  COMMERCIAL_INVOICE: "COMMERCIAL_INVOICE",
  PRO_FORMA_INVOICE: "PRO_FORMA_INVOICE",
  CERTIFICATE_OF_ORIGIN: "CERTIFICATE_OF_ORIGIN",
  USMCA_CERTIFICATION_OF_ORIGIN: "USMCA_CERTIFICATION_OF_ORIGIN",
  USMCA_COMMERCIAL_INVOICE_CERTIFICATION_OF_ORIGIN: "USMCA_COMMERCIAL_INVOICE_CERTIFICATION_OF_ORIGIN",
  OTHER: "OTHER",
} as const;

export type FedExTradeDocumentTypeValue =
  typeof FedExTradeDocumentType[keyof typeof FedExTradeDocumentType];

export const FEDEX_TRADE_DOCUMENT_MAX_FILES = 5;
export const FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export const FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES = [
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "text/plain",
] as const;

export const shipmentTradeDocumentSchema = z.object({
  fileName: z.string().min(1),
  objectPath: z.string().min(1),
  contentType: z.string().min(1).refine(
    (value) =>
      FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES.includes(
        value.split(";")[0].trim().toLowerCase() as typeof FEDEX_TRADE_DOCUMENT_ALLOWED_CONTENT_TYPES[number],
      ),
    "Unsupported FedEx trade document content type",
  ),
  size: z.number().int().positive().max(FEDEX_TRADE_DOCUMENT_MAX_SIZE_BYTES),
  documentType: z.enum([
    FedExTradeDocumentType.COMMERCIAL_INVOICE,
    FedExTradeDocumentType.PRO_FORMA_INVOICE,
    FedExTradeDocumentType.CERTIFICATE_OF_ORIGIN,
    FedExTradeDocumentType.USMCA_CERTIFICATION_OF_ORIGIN,
    FedExTradeDocumentType.USMCA_COMMERCIAL_INVOICE_CERTIFICATION_OF_ORIGIN,
    FedExTradeDocumentType.OTHER,
  ]),
  uploadedDocumentId: z.string().optional(),
  uploadedAt: z.string().optional(),
});

export type ShipmentTradeDocument = z.infer<typeof shipmentTradeDocumentSchema>;

// Shipment item interface (stored as JSON in itemsData)
export interface ShipmentItem {
  itemName: string;
  itemDescription?: string;
  category: string;
  material?: string;
  countryOfOrigin: string;
  hsCode?: string;
  hsCodeSource?: HsCodeSourceValue;
  hsCodeConfidence?: HsCodeConfidenceValue;
  hsCodeCandidates?: Array<{ code: string; description: string; confidence: number }>;
  price: number;
  quantity: number;
  // Currency the client declared this item's value in (e.g. "GBP") — the customs/declared
  // value currency, distinct from the SAR freight charge currency.
  currency?: string;
}

// HS Code Mappings table (history-based accuracy improvement)
export const hsCodeMappings = pgTable("hs_code_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id"),
  normalizedKey: text("normalized_key").notNull(),
  hsCode: text("hs_code").notNull(),
  description: text("description"),
  usedCount: integer("used_count").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHsCodeMappingSchema = createInsertSchema(hsCodeMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHsCodeMapping = z.infer<typeof insertHsCodeMappingSchema>;
export type HsCodeMapping = typeof hsCodeMappings.$inferSelect;

// Branding config type
export interface BrandingConfig {
  appName: string;
  primaryColor: string;
  logoUrl: string;
}

// Dashboard stats types
export interface TrendData {
  value: number;
  label: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
}

export interface AdminDashboardStats {
  totalClients: number;
  activeClients: number;
  pendingApplications: number;
  totalShipments: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  totalRevenue: number;
  monthlyRevenue: number;
  trends: {
    clients: TrendData;
    shipments: TrendData;
    revenue: TrendData;
  };
  shipmentsByMonth: ChartDataPoint[];
  revenueByMonth: ChartDataPoint[];
  statusDistribution: StatusDistribution[];
}

export interface ClientDashboardStats {
  totalShipments: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  pendingInvoices: number;
  totalSpent: number;
  trends: {
    shipments: TrendData;
    delivered: TrendData;
    spent: TrendData;
  };
  shipmentsByMonth: ChartDataPoint[];
  statusDistribution: StatusDistribution[];
}

export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: varchar("level", { length: 20 }).notNull(),
  message: text("message").notNull(),
  source: varchar("source", { length: 100 }),
  errorCode: varchar("error_code", { length: 100 }),
  stack: text("stack"),
  metadata: text("metadata"),
  endpoint: varchar("endpoint", { length: 500 }),
  userId: varchar("user_id", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  createdAt: true,
});

export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;

// ============================================
// TASKS MODULE (internal-only collaboration)
// ============================================

export const TaskStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
} as const;

export type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type TaskPriorityValue = typeof TaskPriority[keyof typeof TaskPriority];

export const TaskActivityEventType = {
  TASK_CREATED: "task_created",
  TASK_UPDATED: "task_updated",
  ASSIGNMENT_CHANGED: "assignment_changed",
  DEADLINE_CHANGED: "deadline_changed",
  PRIORITY_CHANGED: "priority_changed",
  COMMENT_ADDED: "comment_added",
  ATTACHMENT_ADDED: "attachment_added",
  TASK_COMPLETED: "task_completed",
  TASK_REOPENED: "task_reopened",
} as const;

export type TaskActivityEventTypeValue =
  typeof TaskActivityEventType[keyof typeof TaskActivityEventType];

export const TASK_PERMISSION_NAMES = [
  "tasks:read",
  "tasks:create",
  "tasks:update",
  "tasks:assign",
  "tasks:complete",
  "tasks:reopen",
  "task-comments:create",
] as const;

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default(TaskStatus.PENDING),
  priority: text("priority").notNull().default(TaskPriority.MEDIUM),
  createdByUserId: varchar("created_by_user_id").notNull(),
  assignedToUserId: varchar("assigned_to_user_id").notNull(),
  deadlineAt: timestamp("deadline_at"),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id"),
  reopenedAt: timestamp("reopened_at"),
  reopenedByUserId: varchar("reopened_by_user_id"),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("tasks_status_idx").on(table.status),
  assigneeStatusIdx: index("tasks_assignee_status_idx").on(table.assignedToUserId, table.status),
  creatorStatusIdx: index("tasks_creator_status_idx").on(table.createdByUserId, table.status),
  deadlineStatusIdx: index("tasks_deadline_status_idx").on(table.deadlineAt, table.status),
  lastActivityIdx: index("tasks_last_activity_idx").on(table.lastActivityAt),
}));

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  completedAt: true,
  completedByUserId: true,
  reopenedAt: true,
  reopenedByUserId: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const taskCompletionRecipients = pgTable("task_completion_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskUserUnique: uniqueIndex("task_completion_recipients_unique").on(table.taskId, table.userId),
}));

export const insertTaskCompletionRecipientSchema = createInsertSchema(taskCompletionRecipients).omit({
  id: true,
  createdAt: true,
});

export type InsertTaskCompletionRecipient = z.infer<typeof insertTaskCompletionRecipientSchema>;
export type TaskCompletionRecipient = typeof taskCompletionRecipients.$inferSelect;

export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskSortIdx: index("task_attachments_task_sort_idx").on(table.taskId, table.sortOrder),
}));

export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments).omit({
  id: true,
  createdAt: true,
});

export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;
export type TaskAttachment = typeof taskAttachments.$inferSelect;

export const taskComments = pgTable("task_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  authorUserId: varchar("author_user_id").notNull(),
  parentCommentId: varchar("parent_comment_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  taskCreatedIdx: index("task_comments_task_created_idx").on(table.taskId, table.createdAt),
}));

export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type TaskComment = typeof taskComments.$inferSelect;

export const taskActivityEvents = pgTable("task_activity_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  actorUserId: varchar("actor_user_id"),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskCreatedIdx: index("task_activity_events_task_created_idx").on(table.taskId, table.createdAt),
}));

export const insertTaskActivityEventSchema = createInsertSchema(taskActivityEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertTaskActivityEvent = z.infer<typeof insertTaskActivityEventSchema>;
export type TaskActivityEvent = typeof taskActivityEvents.$inferSelect;
