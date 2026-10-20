/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const noteIdentityMigration = readFileSync(
  new URL("../migrations/0003_note_identity.sql", import.meta.url),
  "utf8",
);

describe("note identity migration", () => {
  it("uses note IDs for uniqueness and keeps device turns as a non-unique lookup", () => {
    expect(noteIdentityMigration).toContain("DROP INDEX IF EXISTS public.learning_notes_device_turn_idx");
    expect(noteIdentityMigration).toMatch(/CREATE INDEX learning_notes_device_turn_idx/);
    expect(noteIdentityMigration).not.toMatch(/CREATE UNIQUE INDEX learning_notes_device_turn_idx/);
  });
});

const billingMigration = readFileSync(
  new URL("../migrations/0004_billing.sql", import.meta.url),
  "utf8",
);

describe("billing migration", () => {
  it("keeps billing rows inside each user's row-level security scope", () => {
    for (const table of ["billing_customers", "billing_subscriptions"]) {
      expect(billingMigration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(billingMigration).toMatch(new RegExp(`CREATE POLICY ${table}_owner ON public\\.${table}`));
    }
    expect(billingMigration).not.toMatch(/GRANT[^;]*DELETE[^;]*billing/);
  });

  it("resolves webhook customers through a narrow security-definer lookup", () => {
    expect(billingMigration).toMatch(/FUNCTION public\.resolve_billing_customer\(candidate_customer_id text\)\s+RETURNS text/);
    expect(billingMigration).toContain("SECURITY DEFINER");
    expect(billingMigration).toContain("SET search_path = public, pg_temp");
  });
});
