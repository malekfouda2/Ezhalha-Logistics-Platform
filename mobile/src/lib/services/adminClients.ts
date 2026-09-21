import { api } from "@/api/client";
import { fetchPaginated, type Paginated } from "@/api/pagination";
import type { ClientAccount } from "@shared/schema";

// Admin "Clients" section — same endpoints the web admin's clients/edit-client/account-managers
// pages already use (server/routes.ts). No backend changes; this is a thin mobile client for
// the existing admin REST surface.

export interface AssignedAccountManagerSummary {
  id: string;
  username: string;
  email: string;
}

export interface AdminClientListItem extends ClientAccount {
  assignedAccountManager?: AssignedAccountManagerSummary | null;
}

export interface AdminClientDetails extends AdminClientListItem {
  users: { id: string; username: string; email: string; isActive: boolean }[];
  shipmentCount: number;
  invoiceCount: number;
}

export interface ClientProfileOption {
  profile: string;
  displayName: string;
}

export interface AccountManagerClientSummary {
  id: string;
  accountNumber: string;
  name: string;
  profile: string;
  isActive: boolean;
}

export interface AccountManagerSummary {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  isAccountManager: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  assignedClients: AccountManagerClientSummary[];
}

export interface AccountManagerChangeRequest {
  id: string;
  accountManagerUserId: string;
  clientAccountId: string;
  requestType: string;
  status: string;
  requestedChanges: Record<string, unknown>;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  accountManager: { id: string; username: string; email: string } | null;
  client: { id: string; accountNumber: string; name: string; profile: string; isActive: boolean } | null;
  reviewedBy: { id: string; username: string; email: string } | null;
}

export interface ClientCreditSummary {
  creditEnabled: boolean;
  limit: number;
  outstanding: number;
  available: number;
  transactions: {
    id: string;
    type: string;
    amountSar: string;
    balanceAfterSar: string;
    reason: string | null;
    createdAt: string;
  }[];
}

export interface ClientAnalytics {
  client: {
    id: string;
    name: string;
    accountNumber: string;
    email: string;
    phone: string;
    country: string;
    city: string | null;
    profile: string;
    isActive: boolean;
    createdAt: string;
  };
  totals: {
    shipments: number;
    activeShipments: number;
    cancelledShipments: number;
    cancelledValueSar: number;
    grossBilledSar: number;
    revenueExTaxSar: number;
    costSar: number;
    netProfitSar: number;
    marginPct: number;
    collectedSar: number;
    outstandingSar: number;
    avgShipmentValueSar: number;
    avgProfitPerShipmentSar: number;
    totalWeightKg: number;
  };
  history: {
    firstShipmentAt: string | null;
    lastShipmentAt: string | null;
    userCount: number;
    activeUserCount: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byFulfillment: Record<string, number>;
    byCarrier: { carrierCode: string; shipments: number; revenueSar: number }[];
    topDestinations: { key: string; count: number }[];
    topOrigins: { key: string; count: number }[];
  };
  monthly: { month: string; shipments: number; revenueSar: number; profitSar: number }[];
  credit: { enabled: boolean } & Omit<ClientCreditSummary, "creditEnabled">;
  invoices: {
    count: number;
    paidCount: number;
    paidSar: number;
    openCount: number;
    openSar: number;
    overdueCount: number;
    overdueSar: number;
  };
  paymentCount: number;
}

export interface AdminClientListParams {
  page: number;
  pageSize: number;
  search?: string;
  profile?: string;
  status?: "active" | "inactive";
  accountManagerUserId?: string;
}

export interface CreateClientInput {
  name: string;
  email: string;
  phone: string;
  country: string;
  companyName?: string;
  profile?: string;
  assignedAccountManagerUserId?: string | null;
  documents?: string[];
}

export interface UpdateClientInput {
  name?: string;
  phone?: string;
  country?: string;
  companyName?: string;
  crNumber?: string;
  taxNumber?: string;
  nameAr?: string;
  companyNameAr?: string;
  profile?: string;
  isActive?: boolean;
  preferredCurrency?: "SAR" | "USD";
  assignedAccountManagerUserId?: string | null;
  shippingContactName?: string;
  shippingContactPhone?: string;
  shippingCountryCode?: string;
  shippingStateOrProvince?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingAddressLine1?: string;
  shippingAddressLine2?: string;
  shippingShortAddress?: string;
}

function buildListPath(params: Omit<AdminClientListParams, "page" | "pageSize">): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.profile) query.set("profile", params.profile);
  if (params.status) query.set("status", params.status);
  if (params.accountManagerUserId) query.set("accountManagerUserId", params.accountManagerUserId);
  const qs = query.toString();
  return qs ? `/api/admin/clients?${qs}` : "/api/admin/clients";
}

export const adminClientsService = {
  list: (page: number, pageSize: number, params: Omit<AdminClientListParams, "page" | "pageSize">) =>
    fetchPaginated<AdminClientListItem>(buildListPath(params), page, pageSize) as Promise<
      Paginated<AdminClientListItem>
    >,

  getProfileOptions: () => api.get<ClientProfileOption[]>("/api/admin/client-profile-options"),

  get: (id: string) => api.get<AdminClientDetails>(`/api/admin/clients/${id}`),

  create: (data: CreateClientInput) => api.post<AdminClientListItem>("/api/admin/clients", data),

  update: (id: string, data: UpdateClientInput) =>
    api.patch<AdminClientListItem & { requiresApproval?: boolean; request?: AccountManagerChangeRequest }>(
      `/api/admin/clients/${id}`,
      data,
    ),

  updateStatus: (id: string, isActive: boolean) =>
    api.patch<AdminClientListItem>(`/api/admin/clients/${id}/status`, { isActive }),

  remove: (id: string) => api.delete<{ success: boolean }>(`/api/admin/clients/${id}`),

  getAnalytics: (id: string) => api.get<ClientAnalytics>(`/api/admin/clients/${id}/analytics`),

  getCredit: (id: string) => api.get<ClientCreditSummary>(`/api/admin/clients/${id}/credit`),

  setCreditLimit: (id: string, creditLimitSar: number) =>
    api.patch<AdminClientListItem>(`/api/admin/clients/${id}/credit-limit`, { creditLimitSar }),

  setDangerousGoodsEnabled: (id: string, enabled: boolean) =>
    api.patch<AdminClientListItem>(`/api/admin/clients/${id}/dangerous-goods`, { enabled }),

  setSalesFeaturesEnabled: (id: string, enabled: boolean) =>
    api.patch<AdminClientListItem>(`/api/admin/clients/${id}/sales-features`, { enabled }),

  listAccountManagers: () => api.get<AccountManagerSummary[]>("/api/admin/account-managers"),

  assignClients: (accountManagerUserId: string, clientAccountIds: string[]) =>
    api.put<AccountManagerSummary>(`/api/admin/account-managers/${accountManagerUserId}/clients`, {
      clientAccountIds,
    }),

  listChangeRequests: (status?: string) =>
    api.get<AccountManagerChangeRequest[]>(
      `/api/admin/account-managers/change-requests${status ? `?status=${status}` : ""}`,
    ),

  approveChangeRequest: (id: string, adminNotes?: string) =>
    api.post<{ success: boolean }>(`/api/admin/account-managers/change-requests/${id}/approve`, { adminNotes }),

  rejectChangeRequest: (id: string, adminNotes?: string) =>
    api.post<{ success: boolean }>(`/api/admin/account-managers/change-requests/${id}/reject`, { adminNotes }),
};
