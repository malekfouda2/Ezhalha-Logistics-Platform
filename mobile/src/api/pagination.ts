import { api, RequestOptions } from "./client";

// Client for the backend's opt-in pagination envelope (docs/mobile-api-updates.md,
// server/pagination.ts). Nothing changes unless the request carries `X-Paginate: 1`, so this
// is the one place that sets it — call sites just get pages back.

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Fetches one page of a list endpoint.
 *
 * Guest mode never reaches the server — it answers locally with a bare array
 * (mobile/src/lib/guestMode.ts, matched on the exact path before the query string is even
 * relevant) — so a bare array here is a guest response, not a broken envelope, and is
 * normalised into a single final page rather than thrown away.
 */
export async function fetchPaginated<T>(
  path: string,
  page: number,
  pageSize = 25,
  options?: RequestOptions,
): Promise<Paginated<T>> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await api.get<Paginated<T> | T[]>(
    `${path}${separator}page=${page}&pageSize=${pageSize}`,
    {
      ...options,
      headers: {
        "X-Paginate": "1",
        ...(options?.headers as Record<string, string> | undefined),
      },
    },
  );

  if (Array.isArray(response)) {
    return {
      data: response,
      pagination: {
        page: 1,
        pageSize: response.length || pageSize,
        total: response.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  return response;
}
