import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  attempts?: number;
  timeoutMs?: number;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * neon-http sends every query as its own HTTPS request, so one dropped packet
 * fails a whole render. Retry at the transport (from ellum-harness): only a
 * rejected fetch (DNS, TCP, TLS, timeout) is retried; any response, including
 * a Postgres error, is returned as is. A caller's abort is never retried.
 * Backoff is 250 ms, 500 ms, 1 s with jitter. A request lost after reaching
 * Neon could run twice, which matters only for non-idempotent writes.
 */
export function createRetryingFetch(options: RetryOptions = {}): Fetch {
  const attempts = options.attempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? wait;
  const random = options.random ?? Math.random;

  return async (input, init = {}) => {
    for (let attempt = 1; ; attempt++) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        return await doFetch(input, { ...init, signal });
      } catch (error) {
        if (init.signal?.aborted || attempt >= attempts) throw error;
        await sleep(250 * 2 ** (attempt - 1) * (0.5 + random()));
      }
    }
  };
}

export function createDb(databaseUrl: string) {
  neonConfig.fetchFunction = createRetryingFetch();
  return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof createDb>;
