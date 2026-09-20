import { fetchPaginated } from "@/api/pagination";
import type { ClientAccount, Invoice, Shipment } from "@shared/schema";

// Backs the admin search screen. Each resource is fetched through the same
// `search=` query param + pagination envelope the web admin lists already use
// (server/routes.ts `/api/admin/{clients,shipments,invoices}`), one small page
// per resource rather than a dedicated search endpoint.
const RESULTS_PER_RESOURCE = 5;

export interface AdminSearchResults {
  clients: ClientAccount[];
  shipments: Shipment[];
  invoices: Invoice[];
}

async function searchResource<T>(path: string, query: string): Promise<T[]> {
  const page = await fetchPaginated<T>(
    `${path}?search=${encodeURIComponent(query)}`,
    1,
    RESULTS_PER_RESOURCE,
  );
  return page.data;
}

export const adminSearchService = {
  searchClients: (query: string) => searchResource<ClientAccount>("/api/admin/clients", query),
  searchShipments: (query: string) => searchResource<Shipment>("/api/admin/shipments", query),
  searchInvoices: (query: string) => searchResource<Invoice>("/api/admin/invoices", query),
};
