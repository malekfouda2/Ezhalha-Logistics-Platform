import { api } from "@/api/client";
import { fetchPaginated, type Paginated } from "@/api/pagination";
import type { ClientAccount, ClientApplication } from "@shared/schema";

// Admin "Applications" section — the same endpoints the web admin's applications page uses
// (server/routes.ts `/api/admin/applications*`). No backend changes.

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface AdminApplicationListParams {
  search?: string;
  status?: ApplicationStatus;
}

export interface ReviewApplicationInput {
  action: "approve" | "reject";
  /** Pricing profile for the created client account (approve only; server defaults to `regular`). */
  profile?: string;
  /**
   * Stored as the application's review notes. On reject this is also the reason the
   * Application Rejected email sends to the applicant verbatim.
   */
  notes?: string;
}

function buildListPath(params: AdminApplicationListParams, limit: number): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  // The route caps its SQL page with `limit`, not the envelope's `pageSize` — send both so the
  // rows returned match the page the envelope describes.
  query.set("limit", String(limit));
  return `/api/admin/applications?${query.toString()}`;
}

export const adminApplicationsService = {
  list: (page: number, pageSize: number, params: AdminApplicationListParams) =>
    fetchPaginated<ClientApplication>(buildListPath(params, pageSize), page, pageSize) as Promise<
      Paginated<ClientApplication>
    >,

  listPending: () => api.get<ClientApplication[]>("/api/admin/applications/pending"),

  review: (id: string, data: ReviewApplicationInput) =>
    api.post<{ success: boolean; clientAccount?: ClientAccount }>(`/api/admin/applications/${id}/review`, data),
};
