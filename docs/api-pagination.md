# API pagination

Every list the API returns can be delivered in one shape, for clients that ask for it.

This exists because the mobile app consumes the same `/api/*` endpoints the web portal does, and
those endpoints grew three different list shapes independently:

| Shape | Example |
| --- | --- |
| Bare array | `GET /api/client/shipments` → `[ {...}, {...} ]` |
| Resource-keyed object | `GET /api/admin/shipments` → `{ shipments: [...], total, page, totalPages }` |
| Items-keyed object | `GET /api/operations/tasks` → `{ items: [...], total, page, pageSize }` |

A native client cannot write one list screen against three shapes, and several of the bare-array
routes return an account's entire history in a single response.

## Opting in

Send a header (or a query parameter, for callers that cannot set headers):

```
X-Paginate: 1
```
```
GET /api/client/shipments?paginate=1
```

**Without the opt-in, nothing changes.** The web portal reads `response.shipments` and plain arrays
in a dozen places and sends no such header, so it never enters this code path. That is deliberate:
this is an additive contract for new clients, not a migration the existing frontend has to survive.

## The envelope

```json
{
  "data": [ { "id": "..." } ],
  "pagination": {
    "page": 2,
    "pageSize": 25,
    "total": 143,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": true
  }
}
```

- `total` is the number of items across all pages, not the number on this page.
- `totalPages` is at least `1`. An empty list is one empty page, never zero pages.
- Any sibling keys the endpoint returned alongside its list are preserved at the top level —
  `GET /api/admin/shipments?abandoned=true` still returns `recoveries` and `metrics` beside `data`.
- Error responses (HTTP 4xx/5xx) keep their own `{ error }` / `{ message }` shape and are never
  wrapped.
- Single-resource responses (`GET /api/client/account`) are never wrapped — they have no pages.

## Paging parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| `page` | `1` | 1-indexed. A page past the end returns `data: []`, not an error. |
| `pageSize` | `25` | Clamped to `100`. Aliases: `perPage`, `limit`. |

Unparseable values fall back to the default rather than 400ing — a stale bookmark or a typo'd
query string should still return a page.

A handful of routes use `limit` as a result *cap* of their own (the operations queue, admin refund
requests, admin email deliveries). Under the opt-in the envelope owns the slicing on those routes,
so `limit` behaves as a page size there like everywhere else. Without the opt-in it keeps its
existing meaning.

## Implementation

[`server/pagination.ts`](../server/pagination.ts). The middleware is registered at the top of
`registerRoutes` in [`server/routes.ts`](../server/routes.ts) so the contract holds wherever the
routes are mounted, tests included.

Handlers that want to page in SQL instead of in memory can read the resolved request off
`req.pagination` (`{ page, pageSize, requested }`) and return the resource-keyed object shape; the
middleware normalises it on the way out.

Tests: [`tests/pagination.test.ts`](../tests/pagination.test.ts) for the middleware, and the
"Pagination envelope over real routes" block in
[`tests/api-admin.test.ts`](../tests/api-admin.test.ts) for the end-to-end shapes.
