/**
 * Applies pending SQL migrations and records what it applied.
 *
 * Before this, whether a migration had run anywhere was something a person remembered. On
 * 2026-09-10 a release shipped code needing `client_applications.shipment_draft` while that
 * migration had only ever been applied to staging, and production spent three days unable to read
 * its own applications table. The fix is a ledger: the database records which files it has, so the
 * question has an answer instead of a recollection.
 *
 *   npm run db:migrate           apply everything pending
 *   npm run db:migrate:check     list what is pending; exit 1 if anything is (a deploy gate)
 *
 * Options:
 *   --expect-db=<name>  refuse to run unless connected to that database. Use it on every
 *                       production and staging run — they live on the same host.
 *   --repair            re-apply every migration, not just the pending ones. Safe: all migrations
 *                       here are written idempotently. Use when a database has drifted and the
 *                       ledger cannot be trusted.
 *   --baseline          record every migration as applied WITHOUT running any of it. For an
 *                       existing database that predates this ledger and is already up to date —
 *                       confirm that first with `npm run db:check`, which compares the code's
 *                       schema against the real one. This changes no tables.
 *
 * Migrations must stay idempotent (`IF NOT EXISTS`, `NOT EXISTS` guards). That is what makes both
 * --repair and a re-run after a partial failure safe.
 */
import "../server/load-env";
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

interface MigrationFile {
  filename: string;
  sql: string;
  checksum: string;
}

function loadMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16) };
    });
}

function flag(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match?.split("=").slice(1).join("=");
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const repair = process.argv.includes("--repair");
  const baseline = process.argv.includes("--baseline");
  const expectDb = flag("expect-db");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: dbRows } = await client.query<{ database: string }>("select current_database() as database");
    const database = dbRows[0].database;
    console.log(`database: ${database}`);

    // Production and staging share a host, so a mistyped directory is one `cd` from the wrong
    // database. When the caller states which one it expects, hold them to it.
    if (expectDb && expectDb !== database) {
      console.error(`REFUSING: connected to "${database}" but --expect-db=${expectDb}`);
      process.exit(1);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = loadMigrations();
    const { rows: appliedRows } = await client.query<{ filename: string; checksum: string }>(
      "select filename, checksum from schema_migrations",
    );
    const applied = new Map(appliedRows.map((row) => [row.filename, row.checksum]));

    // An edited migration is a different migration. Whatever ran is not what is on disk now, so
    // say so rather than reporting the file as applied.
    const edited = files.filter((file) => applied.has(file.filename) && applied.get(file.filename) !== file.checksum);
    for (const file of edited) {
      console.warn(`  CHANGED SINCE APPLIED: ${file.filename} (recorded ${applied.get(file.filename)}, on disk ${file.checksum})`);
    }

    if (baseline) {
      // Adopting an existing database. Recording without running is only honest when the schema is
      // already correct, which `npm run db:check` is there to establish — so say that plainly
      // rather than letting a baseline paper over real drift.
      for (const file of files) {
        await client.query(
          `insert into schema_migrations (filename, checksum) values ($1, $2)
             on conflict (filename) do update set checksum = excluded.checksum`,
          [file.filename, file.checksum],
        );
      }
      console.log(`baselined ${files.length} migration(s) as already applied — no SQL was run.`);
      console.log("Confirm the schema really is correct:  npm run db:check");
      process.exit(0);
    }

    const pending = repair ? files : files.filter((file) => !applied.has(file.filename));

    if (pending.length === 0) {
      console.log(`up to date — ${files.length} migration(s), nothing pending`);
      process.exit(edited.length > 0 && checkOnly ? 1 : 0);
    }

    console.log(`${pending.length} migration(s) ${repair ? "to re-apply" : "pending"}:`);
    for (const file of pending) console.log(`  ${file.filename}`);

    if (checkOnly) {
      console.error("\nPending migrations must be applied before this build goes live.");
      process.exit(1);
    }

    for (const file of pending) {
      await client.query("BEGIN");
      try {
        await client.query(file.sql);
        await client.query(
          `insert into schema_migrations (filename, checksum) values ($1, $2)
             on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`,
          [file.filename, file.checksum],
        );
        await client.query("COMMIT");
        console.log(`  applied ${file.filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`  FAILED ${file.filename}: ${error instanceof Error ? error.message : error}`);
        console.error("Nothing from this file was applied. Fix it and re-run — earlier files stay recorded.");
        process.exit(1);
      }
    }

    console.log("\nDone. Now verify the result:  npm run db:check");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
