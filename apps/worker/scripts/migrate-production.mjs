#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const assumeYes = process.argv.includes("--yes");

function fatal(message) {
  console.error(`Migration failed: ${message}`);
  process.exit(1);
}

if (process.argv.includes("--help")) {
  console.log(`Usage: pnpm --filter @language-coach/worker run migrate:production -- [--yes]

Applies pending SQL files from apps/worker/migrations to the production database.

Environment:
  NEON_PRODUCTION_DATABASE_URL  Direct, unpooled owner/admin Neon connection string

Options:
  --yes  Skip the interactive MIGRATE confirmation`);
  process.exit(0);
}

const connectionString = process.env.NEON_PRODUCTION_DATABASE_URL;
if (!connectionString) {
  fatal("NEON_PRODUCTION_DATABASE_URL is required. Set it in mise.local.toml.");
}

let connectionUrl;
try {
  connectionUrl = new URL(connectionString);
} catch {
  fatal("NEON_PRODUCTION_DATABASE_URL must be a valid PostgreSQL connection string.");
}

if (!new Set(["postgres:", "postgresql:"]).has(connectionUrl.protocol)) {
  fatal("NEON_PRODUCTION_DATABASE_URL must use the postgres or postgresql protocol.");
}
if (connectionUrl.hostname.includes("-pooler")) {
  fatal("Production migrations require a direct Neon connection, not a pooled endpoint.");
}

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((filename) => /^\d+.*\.sql$/.test(filename))
  .sort();
if (!migrationFiles.length) fatal("No SQL migration files were found.");

const client = new Client({
  connectionString,
  application_name: "language-coach-production-migration",
});

let transactionStarted = false;
try {
  await client.connect();

  const targetResult = await client.query(`
    SELECT current_database() AS database_name, current_user AS role_name
  `);
  const target = targetResult.rows[0];
  if (target.role_name === "language_coach_app") {
    throw new Error("Use an owner/admin connection for migrations, not the language_coach_app runtime role.");
  }

  const runtimeRoleResult = await client.query(`
    SELECT rolcanlogin, rolbypassrls
    FROM pg_roles
    WHERE rolname = 'language_coach_app'
  `);
  const runtimeRole = runtimeRoleResult.rows[0];
  if (!runtimeRole) throw new Error("Create the language_coach_app role before running migrations.");
  if (!runtimeRole.rolcanlogin) throw new Error("The language_coach_app role must have LOGIN permission.");
  if (runtimeRole.rolbypassrls) throw new Error("The language_coach_app role must not have BYPASSRLS permission.");

  console.log(`Production migration target:\n  host: ${connectionUrl.hostname}\n  database: ${target.database_name}\n  role: ${target.role_name}`);

  if (!assumeYes) {
    if (!process.stdin.isTTY) throw new Error("Interactive confirmation is unavailable. Pass --yes only in an approved deployment workflow.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question("Type MIGRATE to apply pending production migrations: ");
    prompt.close();
    if (answer !== "MIGRATE") {
      console.log("Migration cancelled.");
      await client.end();
      process.exit(0);
    }
  }

  await client.query("BEGIN");
  transactionStarted = true;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('language-coach-production-migrations', 0))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.language_coach_schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await client.query("SELECT filename FROM public.language_coach_schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.filename));
  const pending = migrationFiles.filter((filename) => !applied.has(filename));

  for (const filename of pending) {
    const sql = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");
    console.log(`Applying ${filename}...`);
    await client.query(sql);
    await client.query(
      "INSERT INTO public.language_coach_schema_migrations (filename) VALUES ($1)",
      [filename],
    );
  }

  await client.query("COMMIT");
  transactionStarted = false;
  console.log(pending.length ? `Applied ${pending.length} production migration(s).` : "Production database is already up to date.");
} catch (error) {
  if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
