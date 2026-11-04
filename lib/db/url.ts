// drizzle-kit needs a direct (unpooled) connection: migrations use session
// features that Neon's pooler does not keep. Prefer DATABASE_URL_UNPOOLED; else
// derive it from the pooled URL, since Neon's direct host is the pooled host
// without the `-pooler` suffix on its first label.

export function directDatabaseUrl(env: {
  DATABASE_URL?: string | undefined;
  DATABASE_URL_UNPOOLED?: string | undefined;
}): string | undefined {
  const direct = env.DATABASE_URL_UNPOOLED?.trim();
  if (direct) return direct;

  const pooled = env.DATABASE_URL?.trim();
  if (!pooled) return undefined;

  let url: URL;
  try {
    url = new URL(pooled);
  } catch {
    return undefined;
  }
  const [first, ...rest] = url.hostname.split(".");
  if (first?.endsWith("-pooler")) {
    url.hostname = [first.slice(0, -"-pooler".length), ...rest].join(".");
  }
  return url.toString();
}
