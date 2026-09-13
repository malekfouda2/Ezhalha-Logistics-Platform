// lib/guestMode.ts

import type { ClientAccount, ClientDashboardStats } from "@shared/schema";
import { ALL_CLIENT_PERMISSIONS } from "@shared/domain";

/**
 * Canned answers for a client read in guest mode, mirroring
 * `client/src/lib/guest-mode.ts` on web (`GUEST_RESPONSES`/`getGuestQueryResponse`).
 *
 * Deliberately honest rather than flattering: feature flags are all off (exactly what a real
 * new account gets) and stats are zero rather than invented. Permissions are the one place
 * everything is handed out — `(tabs)/_layout.tsx` hides tabs and `createShipment.tsx` decides
 * what's discoverable based on `/api/client/my-permissions`, so without this a guest would see
 * a near-empty app instead of the product.
 */
const GUEST_ACCOUNT: ClientAccount = {
  id: "guest",
  accountNumber: "—",
  accountType: "individual",
  name: "Guest",
  email: "",
  phone: "",
  country: "Saudi Arabia",
  companyName: null,
  crNumber: null,
  taxNumber: null,
  nationalAddressStreet: null,
  nationalAddressBuilding: null,
  nationalAddressDistrict: null,
  nationalAddressCity: null,
  nationalAddressPostalCode: null,
  nameAr: null,
  companyNameAr: null,
  nationalAddressStreetAr: null,
  nationalAddressBuildingAr: null,
  nationalAddressDistrictAr: null,
  nationalAddressCityAr: null,
  shippingContactName: null,
  shippingContactPhone: null,
  shippingCountryCode: null,
  shippingStateOrProvince: null,
  shippingCity: null,
  shippingPostalCode: null,
  shippingAddressLine1: null,
  shippingAddressLine2: null,
  shippingShortAddress: null,
  shippingContactNameAr: null,
  shippingContactPhoneAr: null,
  shippingCountryCodeAr: null,
  shippingStateOrProvinceAr: null,
  shippingCityAr: null,
  shippingPostalCodeAr: null,
  shippingAddressLine1Ar: null,
  shippingAddressLine2Ar: null,
  shippingShortAddressAr: null,
  documents: null,
  profile: "regular",
  isActive: true,
  creditEnabled: false,
  creditLimitSar: "0",
  salesFeaturesEnabled: false,
  dangerousGoodsEnabled: false,
  preferredCurrency: "SAR",
  tapCustomerId: null,
  tapIntegrationAccountId: null,
  zohoCustomerId: null,
  createdAt: new Date(),
} as unknown as ClientAccount;

const GUEST_STATS: ClientDashboardStats = {
  totalShipments: 0,
  shipmentsInTransit: 0,
  shipmentsDelivered: 0,
  pendingInvoices: 0,
  totalSpent: 0,
  trends: {
    shipments: { value: 0, label: "" },
    delivered: { value: 0, label: "" },
    spent: { value: 0, label: "" },
  },
  shipmentsByMonth: [],
  statusDistribution: [],
};

const GUEST_RESPONSES: Record<string, unknown> = {
  "/api/client/account": GUEST_ACCOUNT,
  "/api/client/my-permissions": {
    permissions: ALL_CLIENT_PERMISSIONS,
    isPrimaryContact: false,
  },
  "/api/client/stats": GUEST_STATS,
  "/api/client/credit-access": { creditEnabled: false, hasPendingRequest: false },
  "/api/client/dangerous-goods": { enabled: false, request: null },
  "/api/client/sales-features": { enabled: false, request: null },
  "/api/notifications": [],
  "/api/notifications/unread-count": { count: 0 },
};

/**
 * The canned answer for a guest's GET, or `undefined` when the caller should let the request
 * go to the network (every mutation, and any path this map doesn't know about and isn't under
 * `/api/client/`).
 *
 * Unknown `/api/client/*` reads fall back to an empty list, which every list screen already
 * knows how to render — that's what lets the whole portal be browsable without teaching each
 * screen what a guest is.
 */
export function getGuestQueryResponse(path: string): unknown {
  if (path in GUEST_RESPONSES) {
    return GUEST_RESPONSES[path];
  }
  if (path.startsWith("/api/client/")) {
    return [];
  }
  return undefined;
}
