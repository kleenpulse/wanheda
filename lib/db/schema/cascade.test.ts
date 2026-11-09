import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

// Account deletion (V79) deletes the user row and relies on the database for
// the rest. A table with a `user_id` that doesn't cascade from `user` would
// either block the delete or keep a deleted person's rows.

const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));

describe("every table with a user_id", () => {
  const owned = tables.filter((table) => getTableConfig(table).columns.some((column) => column.name === "user_id"));

  it("finds the user-owned tables", () => {
    expect(owned.length).toBeGreaterThan(20);
  });

  for (const table of owned) {
    it(`${getTableName(table)} cascades from user(id)`, () => {
      const fks = getTableConfig(table).foreignKeys.filter((fk) => {
        const ref = fk.reference();
        return ref.columns.length === 1 && ref.columns[0]?.name === "user_id";
      });
      expect(fks.map((fk) => [getTableName(fk.reference().foreignTable), fk.onDelete])).toEqual([["user", "cascade"]]);
    });
  }
});
