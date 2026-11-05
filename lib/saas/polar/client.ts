import { z } from "zod";

// Polar's REST API through plain fetch (T40: no SDK, we read a handful of
// fields). An Organization Access Token is scoped to one organization, so no
// organization_id is sent. Needed scopes: products:read, subscriptions:read,
// orders:read, refunds:read, metrics:read (T41: Polar's own daily figures).

export const POLAR_SERVERS = ["production", "sandbox"] as const;
export type PolarServer = (typeof POLAR_SERVERS)[number];

const BASE: Record<PolarServer, string> = {
  production: "https://api.polar.sh",
  sandbox: "https://sandbox-api.polar.sh",
};

const PAGE_SIZE = 100;
/** 50 000 objects per kind is far past one owner's products; a bug in paging must not loop forever. */
const MAX_PAGES = 500;
const TIMEOUT_MS = 20_000;

export type PolarErrorKind = "unauthorized" | "forbidden" | "rate-limited" | "server" | "network" | "shape";

export class PolarError extends Error {
  constructor(
    readonly kind: PolarErrorKind,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "PolarError";
  }
}

/** A short, secret-free line for `connector.last_error` and the settings screen. */
export function describePolarError(error: unknown): string {
  if (!(error instanceof PolarError)) return "Sync failed. Try again.";
  switch (error.kind) {
    case "unauthorized":
      return "Polar refused the token. It may be revoked or expired.";
    case "forbidden":
      return "The token is missing a scope (products, subscriptions, orders, refunds or metrics read).";
    case "rate-limited":
      return "Polar asked us to slow down. Try again in a minute.";
    case "server":
      return `Polar had a problem (${error.status ?? "?"}). Try again later.`;
    case "network":
      return "Couldn't reach Polar.";
    case "shape":
      return "Polar answered in a shape Wanheda doesn't understand.";
  }
}

const listPage = z.object({
  items: z.array(z.unknown()),
  pagination: z.object({ total_count: z.number().int(), max_page: z.number().int() }),
});

export const polarProduct = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  is_recurring: z.boolean().nullish(),
  is_archived: z.boolean().nullish(),
  organization_id: z.string().nullish(),
});
export type PolarProduct = z.infer<typeof polarProduct>;

export type ListPath = "/v1/products/" | "/v1/subscriptions/" | "/v1/orders/" | "/v1/refunds/";

/** The figures we keep from Polar's metrics, per day. Money in USD cents (Polar converts). */
export const METRIC_SLUGS = ["monthly_recurring_revenue", "active_subscriptions", "average_revenue_per_user", "committed_monthly_recurring_revenue"] as const;

const metricsBody = z.object({
  periods: z.array(z.looseObject({ timestamp: z.string() })),
});

export interface PolarMetricDay {
  /** YYYY-MM-DD (UTC). */
  day: string;
  values: Record<string, number>;
}

export interface PolarClient {
  /** Every item of one list, all pages. */
  listAll(path: ListPath): Promise<unknown[]>;
  products(): Promise<PolarProduct[]>;
  /** `GET /v1/metrics/` by day, for the whole organization or some of its products. */
  metrics(opts: { startDate: string; endDate: string; productIds?: readonly string[] }): Promise<PolarMetricDay[]>;
}

export function polarClient(opts: { server: PolarServer; token: string; fetch?: typeof fetch }): PolarClient {
  const doFetch = opts.fetch ?? fetch;

  const getJson = async (path: string, params: URLSearchParams): Promise<{ status: number; body: unknown }> => {
    const url = new URL(path, BASE[opts.server]);
    url.search = params.toString();
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { authorization: `Bearer ${opts.token}`, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new PolarError("network", null, `GET ${path} failed`);
    }
    if (res.status === 401) throw new PolarError("unauthorized", 401, `GET ${path} → 401`);
    if (res.status === 403) throw new PolarError("forbidden", 403, `GET ${path} → 403`);
    if (res.status === 429) throw new PolarError("rate-limited", 429, `GET ${path} → 429`);
    if (!res.ok) throw new PolarError("server", res.status, `GET ${path} → ${res.status}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const get = async (path: ListPath, page: number): Promise<z.infer<typeof listPage>> => {
    const { status, body } = await getJson(path, new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) }));
    const parsed = listPage.safeParse(body);
    if (!parsed.success) throw new PolarError("shape", status, `GET ${path}: unexpected body`);
    return parsed.data;
  };

  const listAll = async (path: ListPath): Promise<unknown[]> => {
    const items: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await get(path, page);
      items.push(...body.items);
      if (page >= body.pagination.max_page || body.items.length === 0) return items;
    }
    throw new PolarError("shape", null, `GET ${path}: more than ${MAX_PAGES} pages`);
  };

  return {
    listAll,
    async products() {
      const raw = await listAll("/v1/products/");
      return raw.flatMap((item) => {
        const p = polarProduct.safeParse(item);
        return p.success ? [p.data] : [];
      });
    },
    async metrics({ startDate, endDate, productIds = [] }) {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate, interval: "day", timezone: "UTC" });
      for (const id of productIds) params.append("product_id", id);
      for (const slug of METRIC_SLUGS) params.append("metrics", slug);
      const { status, body } = await getJson("/v1/metrics/", params);
      const parsed = metricsBody.safeParse(body);
      if (!parsed.success) throw new PolarError("shape", status, "GET /v1/metrics/: unexpected body");
      return parsed.data.periods.map((p) => ({
        day: p.timestamp.slice(0, 10),
        values: Object.fromEntries(METRIC_SLUGS.flatMap((slug) => (typeof p[slug] === "number" ? [[slug, p[slug]]] : []))),
      }));
    },
  };
}
