import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch } from "./client";

const ok = () => new Response("ok", { status: 200 });

function setup(fetchImpl: (...args: unknown[]) => Promise<Response>) {
  const fetch = vi.fn(fetchImpl);
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const retrying = createRetryingFetch({ fetch, sleep, random: () => 0.5 });
  return { fetch, sleep, retrying };
}

describe("createRetryingFetch", () => {
  it("returns the first successful response without retrying", async () => {
    const { fetch, sleep, retrying } = setup(() => Promise.resolve(ok()));
    const response = await retrying("https://neon.example/sql");
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns an error response as is (a Postgres error is not retried)", async () => {
    const { fetch, retrying } = setup(() => Promise.resolve(new Response("bad query", { status: 400 })));
    const response = await retrying("https://neon.example/sql");
    expect(response.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries rejected fetches, then succeeds", async () => {
    let calls = 0;
    const { fetch, sleep, retrying } = setup(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new TypeError("fetch failed")) : Promise.resolve(ok());
    });
    const response = await retrying("https://neon.example/sql");
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    // 250 ms then 500 ms, jitter factor 0.5 + 0.5 = 1.
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it("gives up after 4 attempts and rethrows the last error", async () => {
    const { fetch, sleep, retrying } = setup(() => Promise.reject(new TypeError("fetch failed")));
    await expect(retrying("https://neon.example/sql")).rejects.toThrow("fetch failed");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[250], [500], [1000]]);
  });

  it("does not retry when the caller aborted", async () => {
    const controller = new AbortController();
    const { fetch, retrying } = setup(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(retrying("https://neon.example/sql", { signal: controller.signal })).rejects.toThrow("aborted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes a timeout signal on every attempt", async () => {
    const { fetch, retrying } = setup(() => Promise.resolve(ok()));
    await retrying("https://neon.example/sql", { method: "POST" });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
