import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { diffSchema, expectedTables, type ExpectedTable } from "../script/check-schema";

/**
 * The guard that should have caught the 2026-09-10 production incident.
 *
 * A release shipped code selecting `client_applications.shipment_draft` while that column's
 * migration had only ever been applied to staging. Drizzle names every column explicitly, so every
 * read of that table threw: the admin applications page came back empty, the dashboard hung on an
 * uncaught rejection, and new client signups failed — for three days, because nothing compared the
 * schema the code expects against the schema the database has.
 *
 * These tests protect the comparison itself. If `diffSchema` ever stops reporting a missing column,
 * the deploy gate silently becomes a no-op and the next release can repeat the incident.
 */

const live = (tables: Record<string, string[]>): Map<string, Set<string>> =>
  new Map(Object.entries(tables).map(([name, columns]) => [name, new Set(columns)]));

describe("schema drift detection", () => {
  const expected: ExpectedTable[] = [
    { name: "client_applications", columns: ["id", "name", "shipment_draft"] },
    { name: "shipments", columns: ["id", "tracking_number"] },
  ];

  it("reports a column the code needs and the database lacks", () => {
    // Exactly the production case.
    const diff = diffSchema(expected, live({
      client_applications: ["id", "name"],
      shipments: ["id", "tracking_number"],
    }));

    expect(diff.missingColumns).toEqual([{ table: "client_applications", column: "shipment_draft" }]);
    expect(diff.missingTables).toEqual([]);
  });

  it("reports a whole missing table without also listing each of its columns", () => {
    // One clear line beats a wall of noise when a table has ninety columns.
    const diff = diffSchema(expected, live({ shipments: ["id", "tracking_number"] }));

    expect(diff.missingTables).toEqual(["client_applications"]);
    expect(diff.missingColumns).toEqual([]);
  });

  it("stays silent when the database is ahead of the code", () => {
    // Migrations are applied before the build that uses them, so "extra" is the normal state
    // mid-deploy and must never block a release.
    const diff = diffSchema(expected, live({
      client_applications: ["id", "name", "shipment_draft", "a_column_from_the_next_release"],
      shipments: ["id", "tracking_number"],
      a_table_from_the_next_release: ["id"],
    }));

    expect(diff.missingTables).toEqual([]);
    expect(diff.missingColumns).toEqual([]);
  });

  it("finds the real tables in shared/schema.ts", () => {
    // If this ever returns nothing, the check would pass against an empty database.
    const tables = expectedTables();
    expect(tables.length).toBeGreaterThan(50);
    const applications = tables.find((table) => table.name === "client_applications");
    expect(applications?.columns).toContain("shipment_draft");
    expect(tables.find((table) => table.name === "email_deliveries")).toBeTruthy();
  });
});

describe("migration files", () => {
  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));

  it("are all idempotent, so a re-run or a repair is safe", () => {
    // The runner re-applies files under --repair, and a partially failed deploy is re-run from the
    // start. Both depend on every statement being guarded.
    const unguarded: string[] = [];
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8");
      const creates = sql.match(/^\s*(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE \S+\s+ADD COLUMN)/gim) ?? [];
      const guards = sql.match(/IF NOT EXISTS/gi) ?? [];
      if (creates.length > guards.length) unguarded.push(`${file} (${creates.length} creates, ${guards.length} guards)`);
    }
    expect(unguarded).toEqual([]);
  });

  it("are named so that filename order is apply order", () => {
    // The runner sorts by filename. A migration that depends on an earlier one must sort after it,
    // and a date prefix is what makes that true.
    const undated = files.filter((name) => !/^\d{4}-\d{2}-\d{2}-/.test(name));
    // Two files predate the convention; they are standalone and order-independent.
    expect(undated.sort()).toEqual(["integration_app_logos.sql", "local_shipments_p1.sql"]);
  });
});
