import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminSearchService } from "@/lib/services/adminSearch";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

export function useAdminSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { hasPermission } = useAdminAccess();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const canSearchClients = hasPermission("clients", "read");
  const canSearchShipments = hasPermission("shipments", "read");
  const canSearchInvoices = hasPermission("invoices", "read");

  const isSearchable = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const clients = useQuery({
    queryKey: ["/api/admin/clients", "search", debouncedQuery],
    queryFn: () => adminSearchService.searchClients(debouncedQuery),
    enabled: isSearchable && canSearchClients,
  });

  const shipments = useQuery({
    queryKey: ["/api/admin/shipments", "search", debouncedQuery],
    queryFn: () => adminSearchService.searchShipments(debouncedQuery),
    enabled: isSearchable && canSearchShipments,
  });

  const invoices = useQuery({
    queryKey: ["/api/admin/invoices", "search", debouncedQuery],
    queryFn: () => adminSearchService.searchInvoices(debouncedQuery),
    enabled: isSearchable && canSearchInvoices,
  });

  const isLoading =
    isSearchable &&
    ((canSearchClients && clients.isLoading) ||
      (canSearchShipments && shipments.isLoading) ||
      (canSearchInvoices && invoices.isLoading));

  const hasResults =
    (clients.data?.length ?? 0) > 0 ||
    (shipments.data?.length ?? 0) > 0 ||
    (invoices.data?.length ?? 0) > 0;

  return {
    query,
    setQuery,
    isSearchable,
    isLoading,
    hasResults,
    canSearchClients,
    canSearchShipments,
    canSearchInvoices,
    clients: clients.data ?? [],
    shipments: shipments.data ?? [],
    invoices: invoices.data ?? [],
  };
}
