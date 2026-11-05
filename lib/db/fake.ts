import { getTableName, isTable } from "drizzle-orm";

// Tests only. A stand-in for the drizzle client that records every query
// (table, operation, chained calls) and answers each with whatever the test's
// `answer` returns. Store tests use it to check their own logic (ownership
// checks, races, what gets written); the SQL itself is checked against Neon.

export type FakeOp = "select" | "selectDistinct" | "insert" | "update" | "delete";

export interface FakeQuery {
  op: FakeOp;
  /** The table name (`from(...)` for reads, the target for writes). */
  table: string;
  calls: { method: string; args: unknown[] }[];
  /** The rows passed to `.values(...)`, if any. */
  values: unknown;
  /** The object passed to `.set(...)`, if any. */
  set: unknown;
}

export interface FakeDb {
  db: unknown;
  queries: FakeQuery[];
  /** How many `db.batch([...])` calls ran. */
  batches: number;
}

const QUERY = Symbol("fake-query");

/** `answer` returns the query's result, or throws to make it fail. Every query is awaited or batched. */
export function fakeDb(answer: (q: FakeQuery) => unknown): FakeDb {
  const queries: FakeQuery[] = [];
  const state = { batches: 0 };
  const run = (q: FakeQuery): Promise<unknown> => {
    queries.push(q);
    try {
      return Promise.resolve(answer(q));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const build = (op: FakeOp, target?: unknown) => {
    const q: FakeQuery = { op, table: tableName(target), calls: [], values: undefined, set: undefined };
    const proxy: object = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === QUERY) return q;
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => run(q).then(ok, fail);
          }
          return (...args: unknown[]) => {
            if (prop === "from" && q.table === "") q.table = tableName(args[0]);
            if (prop === "values") q.values = args[0];
            if (prop === "set") q.set = args[0];
            q.calls.push({ method: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db = {
    select: () => build("select"),
    selectDistinct: () => build("selectDistinct"),
    insert: (t: unknown) => build("insert", t),
    update: (t: unknown) => build("update", t),
    delete: (t: unknown) => build("delete", t),
    batch: async (list: readonly unknown[]) => {
      state.batches++;
      const out: unknown[] = [];
      // In order, like one transaction; the first failure fails the batch.
      for (const item of list) out.push(await run((item as Record<symbol, FakeQuery>)[QUERY] as FakeQuery));
      return out;
    },
  };
  return {
    db,
    queries,
    get batches() {
      return state.batches;
    },
  };
}

function tableName(t: unknown): string {
  return t !== undefined && isTable(t) ? getTableName(t) : "";
}
