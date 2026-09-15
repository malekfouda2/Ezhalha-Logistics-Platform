import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * One pagination envelope for every list the API returns.
 *
 * The mobile client consumes the same `/api/*` endpoints the web portal does, and those endpoints
 * grew their list shapes independently: most client routes return a bare array, admin routes
 * return `{ shipments, total, page, totalPages }` (with the items key named after the resource),
 * and the task list returns `{ items, total, page, pageSize }`. A native client cannot write one
 * list screen against three shapes, and several of the bare-array routes return the account's
 * entire history in one response.
 *
 * Rather than rewrite 129 handlers, this normalises on the way out, and only when the caller asks
 * for it. Opting in is a single header:
 *
 *     X-Paginate: 1        (or ?paginate=1)
 *     ?page=2&pageSize=25  (aliases: perPage, limit)
 *
 * and the response becomes:
 *
 *     { "data": [...], "pagination": { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }
 *
 * Without the opt-in nothing changes. That matters more than the elegance of a forced migration:
 * the web portal reads `response.shipments` in a dozen places and sends no such header, so it
 * cannot be affected by this code path at all.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationRequest {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set on every request. `requested` is false unless the caller opted in. */
      pagination?: PaginationRequest & { requested: boolean };
    }
  }
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function firstValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function positiveInt(value: unknown, fallback: number, max?: number): number {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  // Number("abc") is NaN and would propagate into a slice index. A typo'd query string should
  // page normally, not return nothing.
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return 1;
  return max ? Math.min(floored, max) : floored;
}

/** True when the caller explicitly asked for the envelope. */
export function isPaginationRequested(req: Request): boolean {
  const header = firstValue(req.headers["x-paginate"]);
  if (header && TRUTHY.has(header.toLowerCase())) return true;
  const query = firstValue(req.query?.paginate);
  return Boolean(query && TRUTHY.has(query.toLowerCase()));
}

/**
 * The page the caller asked for, clamped.
 *
 * `limit` is accepted as an alias because it is the name most HTTP clients default to, but it is
 * read only under the opt-in — several routes use `limit` as a result cap of their own, and
 * silently redefining it would change what they return to the web portal.
 */
export function resolvePagination(req: Request): PaginationRequest {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const sizeSource = query.pageSize ?? query.perPage ?? query.limit;
  return {
    page: positiveInt(query.page, 1),
    pageSize: positiveInt(sizeSource, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

export function buildPaginationMeta(args: { page: number; pageSize: number; total: number }): PaginationMeta {
  const pageSize = Math.max(1, args.pageSize);
  const total = Math.max(0, args.total);
  // An empty list is one empty page, not zero pages: a client rendering "page 1 of 0" is a bug
  // report waiting to happen.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, args.page);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Slice an in-memory list and describe it. Used for routes that do not paginate in SQL. */
export function paginateArray<T>(items: T[], request: PaginationRequest): PaginatedResponse<T> {
  const pagination = buildPaginationMeta({ ...request, total: items.length });
  const start = (pagination.page - 1) * pagination.pageSize;
  return { data: items.slice(start, start + pagination.pageSize), pagination };
}

interface AlreadyPaginated {
  itemsKey: string;
  items: unknown[];
  total: number;
  page: number;
}

/**
 * Recognise a body a handler already paginated in SQL.
 *
 * The convention across `server/storage.ts` is `{ <resource>: rows, total, page, totalPages }` and
 * the task list's `{ items, total, page, pageSize }`. The resource key is always written first, so
 * the first array-valued property is the item list — `/api/admin/shipments` also returns
 * `recoveries` and `metrics` alongside, and those must survive into the envelope untouched.
 */
function detectAlreadyPaginated(body: unknown): AlreadyPaginated | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.total !== "number" || typeof record.page !== "number") return null;

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      return { itemsKey: key, items: value, total: record.total, page: record.page };
    }
  }
  return null;
}

/** Wrap a body in the envelope, or return it unchanged when it is not a list. */
export function envelopeBody(body: unknown, request: PaginationRequest): unknown {
  // Already an envelope (a handler built one itself, or this ran twice). Leave it alone.
  if (body && typeof body === "object" && !Array.isArray(body) && "pagination" in (body as object) && "data" in (body as object)) {
    return body;
  }

  if (Array.isArray(body)) return paginateArray(body, request);

  const paginated = detectAlreadyPaginated(body);
  if (!paginated) return body;

  const { itemsKey, items, total, page } = paginated;
  const rest = { ...(body as Record<string, unknown>) };
  delete rest[itemsKey];
  delete rest.total;
  delete rest.page;
  delete rest.totalPages;
  delete rest.pageSize;

  return {
    data: items,
    // The page size comes from what the handler actually returned, not from what was asked for:
    // routes that paginate in SQL clamp the size themselves, and reporting the request back would
    // describe a page that does not exist.
    pagination: buildPaginationMeta({ page, pageSize: items.length || request.pageSize, total }),
    ...rest,
  };
}

/**
 * Normalise every JSON list response, for callers that opt in.
 *
 * Register this after the request logger so the log records what was actually sent, and before the
 * routes so `req.pagination` is available to handlers that want to page in SQL instead.
 */
export function paginationEnvelope(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requested = isPaginationRequested(req);
    const request = resolvePagination(req);
    req.pagination = { ...request, requested };

    if (!requested || !req.path.startsWith("/api")) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown, ...args: unknown[]) {
      // Errors keep their own shape; a client checking `response.error` should not have to dig
      // through an envelope that never applied to it.
      if (res.statusCode >= 400) return originalJson(body, ...(args as []));
      return originalJson(envelopeBody(body, request), ...(args as []));
    } as typeof res.json;

    next();
  };
}
