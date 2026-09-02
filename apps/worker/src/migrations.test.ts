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
