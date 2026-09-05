import { api } from "@/api/client";
import type { ClientAccount } from "@shared/schema";

export type ClientAccountUpdate = Partial<{
  name: string;
  email: string;
  phone: string;
  companyName: string;
  shippingContactName: string;
  shippingContactPhone: string;
  shippingCountryCode: string;
  shippingStateOrProvince: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingShortAddress: string;
  preferredCurrency: "SAR" | "USD";
}>;

export async function updateClientAccount(
  data: ClientAccountUpdate,
): Promise<ClientAccount> {
  return api.patch<ClientAccount>("/api/client/account", data);
}
