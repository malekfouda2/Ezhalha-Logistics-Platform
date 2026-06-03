import { AsyncLocalStorage } from "async_hooks";
import { storage } from "../storage";
import {
  INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY,
  IntegrationAccountCountryBasis,
  type IntegrationAccount,
  type IntegrationAccountCountryBasisValue,
} from "@shared/schema";
import { normalizeCountryCode } from "@shared/countries";
import {
  decryptIntegrationPayload,
  getIntegrationDefinition,
  sanitizeIntegrationCredentials,
  sanitizeIntegrationSettings,
} from "./integration-apps";

type IntegrationRuntimeEnv = {
  accountId: string;
  values: Record<string, string>;
};

const integrationEnvStorage = new AsyncLocalStorage<IntegrationRuntimeEnv>();

export function getIntegrationEnv(key: string): string | undefined {
  const scopedEnv = integrationEnvStorage.getStore();
  return scopedEnv ? scopedEnv.values[key] : process.env[key];
}

export function getIntegrationEnvBoolean(key: string): boolean {
  return getIntegrationEnv(key) === "true";
}

export function getCurrentIntegrationAccountId(): string | null {
  return integrationEnvStorage.getStore()?.accountId || null;
}

function parseSettings(account: IntegrationAccount) {
  try {
    return account.settings ? JSON.parse(account.settings) : {};
  } catch {
    return {};
  }
}

export function getIntegrationAccountEnv(account: IntegrationAccount) {
  const definition = getIntegrationDefinition(account.appKey);
  if (!definition) return {};

  return {
    ...sanitizeIntegrationCredentials(definition, decryptIntegrationPayload(account.credentialsEncrypted)),
    ...sanitizeIntegrationSettings(definition, parseSettings(account)),
  };
}

export type IntegrationAccountRoutingOptions = {
  shipperCountryCode?: string | null;
  recipientCountryCode?: string | null;
  clientBaseCountryCode?: string | null;
  clientAccountId?: string | null;
  environment?: string;
};

export async function getIntegrationAccountCountryBasis(): Promise<IntegrationAccountCountryBasisValue> {
  const setting = await storage.getPlatformSetting(INTEGRATION_ACCOUNT_COUNTRY_BASIS_SETTING_KEY);
  return setting?.value === IntegrationAccountCountryBasis.CLIENT_BASE_ACCOUNT_COUNTRY
    ? IntegrationAccountCountryBasis.CLIENT_BASE_ACCOUNT_COUNTRY
    : IntegrationAccountCountryBasis.SHIPPING_ACCOUNT_COUNTRY;
}

async function resolveClientBaseCountryCode(options: IntegrationAccountRoutingOptions) {
  const explicitCountryCode = normalizeCountryCode(options.clientBaseCountryCode);
  if (explicitCountryCode) return explicitCountryCode;
  if (!options.clientAccountId) return undefined;

  const account = await storage.getClientAccount(options.clientAccountId);
  return normalizeCountryCode(account?.country);
}

async function getShipmentAccountCountry(options: IntegrationAccountRoutingOptions) {
  const shippingCountryCode =
    normalizeCountryCode(options.shipperCountryCode) ||
    normalizeCountryCode(options.recipientCountryCode);
  const clientBaseCountryCode = await resolveClientBaseCountryCode(options);
  const countryBasis = await getIntegrationAccountCountryBasis();

  return countryBasis === IntegrationAccountCountryBasis.CLIENT_BASE_ACCOUNT_COUNTRY
    ? clientBaseCountryCode || shippingCountryCode || null
    : shippingCountryCode || clientBaseCountryCode || null;
}

export async function getBestIntegrationAccountForShipment(
  appKey: string,
  options: IntegrationAccountRoutingOptions = {},
) {
  if (process.env.NODE_ENV === "test" && process.env.INTEGRATION_ACCOUNT_TEST_MODE !== "true") {
    return null;
  }

  const accounts = await getEligibleIntegrationAccountsForShipment(appKey, options);

  return accounts[0] || null;
}

export async function getEligibleIntegrationAccountsForShipment(
  appKey: string,
  options: IntegrationAccountRoutingOptions = {},
) {
  if (process.env.NODE_ENV === "test" && process.env.INTEGRATION_ACCOUNT_TEST_MODE !== "true") {
    return [] as IntegrationAccount[];
  }

  const definition = getIntegrationDefinition(appKey);
  if (!definition) return [] as IntegrationAccount[];

  const targetEnvironment =
    options.environment || (process.env.NODE_ENV === "production" ? "production" : "sandbox");
  const targetCountry = await getShipmentAccountCountry(options);
  const accounts = (await getActiveIntegrationAccounts(appKey, targetEnvironment))
    .sort((left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.priority - right.priority ||
      left.accountName.localeCompare(right.accountName),
    );

  const countryMatches = targetCountry
    ? accounts.filter((account) => account.countryCode?.toUpperCase() === targetCountry)
    : [];
  const globalAccounts = accounts.filter((account) => !account.countryCode);

  return [...countryMatches, ...globalAccounts];
}

export async function getActiveIntegrationAccounts(
  appKey: string,
  environment = process.env.NODE_ENV === "production" ? "production" : "sandbox",
) {
  if (process.env.NODE_ENV === "test" && process.env.INTEGRATION_ACCOUNT_TEST_MODE !== "true") {
    return [] as IntegrationAccount[];
  }

  return (await storage.getIntegrationAccounts())
    .filter(
      (account) =>
        account.appKey === appKey &&
        account.isActive &&
        account.environment === environment,
    )
    .sort((left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.priority - right.priority ||
      left.accountName.localeCompare(right.accountName),
    );
}

export function selectCheapestCarrierAccountPortfolio<
  T extends { carrierRates: Array<{ baseRate: number }> },
>(accountRateResults: T[]): T | undefined {
  return accountRateResults.reduce<T | undefined>((winner, candidate) => {
    if (candidate.carrierRates.length === 0) {
      return winner;
    }
    if (!winner) {
      return candidate;
    }

    const candidateMinimum = Math.min(...candidate.carrierRates.map((rate) => rate.baseRate));
    const winnerMinimum = Math.min(...winner.carrierRates.map((rate) => rate.baseRate));
    return candidateMinimum < winnerMinimum ? candidate : winner;
  }, undefined);
}

export async function withIntegrationAccount<T>(
  accountOrId: IntegrationAccount | string,
  callback: () => Promise<T>,
): Promise<T> {
  const accountId = typeof accountOrId === "string" ? accountOrId : accountOrId.id;
  if (accountId.startsWith("env:")) {
    return callback();
  }

  const account =
    typeof accountOrId === "string"
      ? await storage.getIntegrationAccount(accountOrId)
      : accountOrId;
  if (!account) {
    throw new Error(`Integration account not found: ${accountId}`);
  }

  return integrationEnvStorage.run({
    accountId: account.id,
    values: getIntegrationAccountEnv(account),
  }, callback);
}

export async function withBoundIntegrationAccount<T>(
  appKey: string,
  accountId: string | null | undefined,
  options: IntegrationAccountRoutingOptions,
  callback: () => Promise<T>,
): Promise<T> {
  if (accountId) {
    return withIntegrationAccount(accountId, callback);
  }

  return withShipmentIntegrationAccount(appKey, options, callback);
}

export async function withShipmentIntegrationAccount<T>(
  appKey: string,
  options: IntegrationAccountRoutingOptions,
  callback: () => Promise<T>,
): Promise<T> {
  const account = await getBestIntegrationAccountForShipment(appKey, options);
  if (!account) {
    return callback();
  }

  return withIntegrationAccount(account, callback);
}
