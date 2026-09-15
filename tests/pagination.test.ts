import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPaginationMeta,
  envelopeBody,
  paginateArray,
  paginationEnvelope,
} from "../server/pagination";

/**
 * The mobile client consumes the same endpoints the web portal does. These tests pin the two
 * halves of that bargain: the envelope is uniform for callers that ask for it, and invisible to
 * callers that do not.
 */

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.use(paginationEnvelope());
  app.get("/api/things", handler);
  app.get("/things", handler);
  return supertest(app);
}

describe("pagination meta", () => {
  it("counts pages from the total and the page size", () => {
    expect(buildPaginationMeta({ page: 2, pageSize: 25, total: 143 })).toEqual({
      page: 2,
      pageSize: 25,
      total: 143,
      totalPages: 6,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("reports one empty page rather than zero pages", () => {
    // "Page 1 of 0" renders as a broken pager on every client that shows the count.
    const meta = buildPaginationMeta({ page: 1, pageSize: 25, total: 0 });
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });

  it("slices the requested page out of an in-memory list", () => {
    const { data, pagination } = paginateArray(rows(30), { page: 2, pageSize: 25 });
    expect(data).toEqual([{ id: 26 }, { id: 27 }, { id: 28 }, { id: 29 }, { id: 30 }]);
    expect(pagination.total).toBe(30);
    expect(pagination.hasNextPage).toBe(false);
  });

  it("returns an empty page past the end instead of wrapping", () => {
    expect(paginateArray(rows(5), { page: 9, pageSize: 25 }).data).toEqual([]);
  });
});

describe("envelope over a response body", () => {
  const request = { page: 1, pageSize: 25 };

  it("moves an already-paginated body onto the shared shape and keeps its extras", () => {
    // `/api/admin/shipments` returns the item list first, then siblings the client still needs.
    const body = {
      shipments: rows(25),
      total: 143,
      page: 1,
      totalPages: 6,
      recoveries: [{ id: "r1" }],
      metrics: { lostRevenue: 12 },
    };

    const result = envelopeBody(body, request) as any;

    expect(result.data).toHaveLength(25);
    expect(result.pagination.total).toBe(143);
    expect(result.pagination.totalPages).toBe(6);
    expect(result.recoveries).toEqual([{ id: "r1" }]);
    expect(result.metrics).toEqual({ lostRevenue: 12 });
    // The resource-named key is gone; that is the whole point of normalising.
    expect(result.shipments).toBeUndefined();
  });

  it("leaves a single resource alone", () => {
    const account = { id: "acc_1", name: "Guest" };
    expect(envelopeBody(account, request)).toBe(account);
  });

  it("does not wrap an envelope twice", () => {
    const already = paginateArray(rows(3), request);
    expect(envelopeBody(already, request)).toBe(already);
  });
});

describe("pagination middleware", () => {
  it("returns the bare array unchanged without the opt-in", async () => {
    // The web portal sends no such header, so this is the case that protects it.
    const res = await appWith((_req, response) => { response.json(rows(30)); }).get("/api/things");

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(30);
  });

  it("wraps a bare array when the header asks for it", async () => {
    const res = await appWith((_req, response) => { response.json(rows(30)); })
      .get("/api/things")
      .set("X-Paginate", "1");

    expect(res.body.data).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 25, total: 30, totalPages: 2, hasNextPage: true });
  });

  it("accepts ?paginate=1 for callers that cannot set headers", async () => {
    const res = await appWith((_req, response) => { response.json(rows(3)); }).get("/api/things?paginate=1");
    expect(res.body.pagination.total).toBe(3);
  });

  it("reads page with pageSize, perPage or limit", async () => {
    const send = appWith((_req, response) => { response.json(rows(100)); });

    for (const key of ["pageSize", "perPage", "limit"]) {
      const res = await send.get(`/api/things?page=3&${key}=10`).set("X-Paginate", "1");
      expect(res.body.data[0]).toEqual({ id: 21 });
      expect(res.body.pagination).toMatchObject({ page: 3, pageSize: 10, totalPages: 10 });
    }
  });

  it("clamps the page size and falls back on a junk page", async () => {
    const send = appWith((_req, response) => { response.json(rows(500)); });

    const huge = await send.get("/api/things?pageSize=5000").set("X-Paginate", "1");
    expect(huge.body.pagination.pageSize).toBe(MAX_PAGE_SIZE);

    // Number("abc") is NaN; slicing on it would return nothing at all.
    const junk = await send.get("/api/things?page=abc").set("X-Paginate", "1");
    expect(junk.body.pagination.page).toBe(1);
    expect(junk.body.data).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it("leaves error bodies in their own shape", async () => {
    const res = await appWith((_req, response) => { response.status(404).json({ error: "Not found" }); })
      .get("/api/things")
      .set("X-Paginate", "1");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("ignores routes outside /api", async () => {
    const res = await appWith((_req, response) => { response.json(rows(30)); })
      .get("/things")
      .set("X-Paginate", "1");

    expect(Array.isArray(res.body)).toBe(true);
  });

  it("exposes the resolved page to handlers that page in SQL themselves", async () => {
    const res = await appWith((req, response) => {
      response.json({ seen: req.pagination });
    })
      .get("/api/things?page=4&pageSize=10")
      .set("X-Paginate", "1");

    expect(res.body.seen).toEqual({ page: 4, pageSize: 10, requested: true });
  });

  it("marks pagination unrequested when nobody opted in", async () => {
    const res = await appWith((req, response) => { response.json({ seen: req.pagination }); }).get("/api/things");
    expect(res.body.seen.requested).toBe(false);
  });
});
