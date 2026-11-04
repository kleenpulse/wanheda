import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { getSchema } from "better-auth/db";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./auth";

// The hand-written tables must match what Better Auth writes. Keep the plugin
// list in step with lib/auth/server.ts (nextCookies adds no tables).
const expected = getSchema({ plugins: [passkeyPlugin()] });

const tables = new Map<string, PgTable>(
  Object.values(schema as Record<string, unknown>)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => [getTableName(table), table]),
);

describe("auth schema matches Better Auth", () => {
  it("has exactly the tables Better Auth expects", () => {
    expect([...tables.keys()].sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [modelName, model] of Object.entries(expected)) {
    describe(modelName, () => {
      const table = tables.get(modelName);
      const columns = table ? getTableColumns(table) : {};

      it("has a text primary key `id`", () => {
        expect(columns.id?.primary).toBe(true);
        expect(columns.id?.dataType).toBe("string");
      });

      for (const [field, attr] of Object.entries(model.fields)) {
        it(`${field}: present, ${attr.required ? "NOT NULL" : "nullable"}${attr.unique ? ", unique" : ""}`, () => {
          const column = columns[field];
          expect(column, `missing column for ${modelName}.${field}`).toBeDefined();
          expect(column?.notNull).toBe(attr.required === true);
          if (attr.unique) expect(column?.isUnique).toBe(true);
        });
      }

      it("has no required column Better Auth never writes", () => {
        const written = new Set(["id", ...Object.keys(model.fields)]);
        const extra = Object.entries(columns)
          .filter(([key, column]) => !written.has(key) && column.notNull && !column.hasDefault)
          .map(([key]) => key);
        expect(extra).toEqual([]);
      });

      it("references user(id) with ON DELETE CASCADE where Better Auth links to a user", () => {
        const refs = Object.entries(model.fields).filter(([, attr]) => attr.references);
        const config = table ? getTableConfig(table) : undefined;
        for (const [field] of refs) {
          const fk = config?.foreignKeys.find((key) =>
            key.reference().columns.some((column) => column.name === columns[field]?.name),
          );
          expect(fk, `no foreign key on ${modelName}.${field}`).toBeDefined();
          expect(fk && getTableName(fk.reference().foreignTable)).toBe("user");
          expect(fk?.onDelete).toBe("cascade");
        }
      });

      it("has row level security enabled", () => {
        expect(table ? getTableConfig(table).enableRLS : false).toBe(true);
      });
    });
  }
});
