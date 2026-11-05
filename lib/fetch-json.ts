/** GET a JSON route for TanStack Query. Anything but a JSON 2xx throws, so the query keeps its last good data. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${url} answered ${String(res.status)}`);
  }
  return (await res.json()) as T;
}
