/**
 * Compares the schema the code expects against the schema the database actually has.
 *
 * This exists because of a production incident on 2026-09-10. A release shipped code that selects
 * `client_applications.shipment_draft`, but that column's migration had only ever been applied to
 * staging. Drizzle names every column explicitly in its SELECT, so *every* read of that table threw
 * — the admin applications page came back empty, the dashboard hung on an uncaught rejection, and
 * new client signups failed. For three days, silently, because nothing compared the two.
 *
 * Exit code 1 means the database is missing something the code needs. Run it against every
 * environment after migrations and before switching traffic; a deploy must not continue past a
 * non-zero exit.
 *
 *   npm run db:check
 */
import "../server/load-env";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { db } from "../server/db";

export interface ExpectedTable {
  name: string;
  columns: string[];
}

export function expectedTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];
  for (const value of Object.values(schema)) {
    // Drizzle tables are the only exports that carry a table config; everything else here is a
    // zod schema, an enum object or a type.
    if (!value || typeof value !== "object") continue;
    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    if (!config?.name || !Array.isArray(config.columns)) continue;
    tables.push({ name: config.name, columns: config.columns.map((column) => column.name) });
  }
  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

export interface SchemaDiff {
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
}

/**
 * What the code needs that the database does not have.
 *
 * Deliberately one-directional: extra tables and columns in the database are not a problem — a
 * migration is applied before the build that uses it, so "ahead of the code" is the normal state
 * mid-deploy. Only the other direction breaks queries.
 */
export function diffSchema(
  expected: ExpectedTable[],
  live: Map<string, Set<string>>,
): SchemaDiff {
  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];

  for (const table of expected) {
    const liveColumns = live.get(table.name);
    if (!liveColumns) {
      missingTables.push(table.name);
      continue;
    }
    for (const column of table.columns) {
      if (!liveColumns.has(column)) missingColumns.push({ table: table.name, column });
    }
  }

  return { missingTables, missingColumns };
}

async function main(): Promise<void> {
  const expected = expectedTables();
  if (expected.length === 0) {
    console.error("Found no Drizzle tables in shared/schema.ts — refusing to report a clean check.");
    process.exit(1);
  }

  // node-postgres returns a result object, not an array — `.rows` is the payload.
  const dbNameResult = (await db.execute(sql`select current_database() as database`)) as unknown as {
    rows: Array<{ database: string }>;
  };
  const database = dbNameResult.rows[0]?.database ?? "unknown";

  const liveResult = (await db.execute(sql`
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
  `)) as unknown as { rows: Array<{ table_name: string; column_name: string }> };
  const liveRows = liveResult.rows;

  const live = new Map<string, Set<string>>();
  for (const row of liveRows) {
    if (!live.has(row.table_name)) live.set(row.table_name, new Set());
    live.get(row.table_name)!.add(row.column_name);
  }

  const { missingTables, missingColumns } = diffSchema(expected, live);

  console.log(`database        : ${database}`);
  console.log(`tables expected : ${expected.length}`);
  console.log(`columns expected: ${expected.reduce((sum, t) => sum + t.columns.length, 0)}`);

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log("\nOK — the database has every table and column the code expects.");
    process.exit(0);
  }

  console.error("\nSCHEMA DRIFT — the deployed code would fail against this database.\n");
  for (const table of missingTables) {
    console.error(`  missing table : ${table}`);
  }
  for (const { table, column } of missingColumns) {
    console.error(`  missing column: ${table}.${column}`);
  }
  console.error("\nApply the pending migrations before continuing:  npm run db:migrate");
  process.exit(1);
}

// Importing this file (from a test) must not connect to a database or exit the process.
if (process.argv[1]?.includes("check-schema")) {
  main().catch((error) => {
    console.error("Schema check failed to run:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
