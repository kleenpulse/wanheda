import { describe, expect, it } from "vitest";
import { directDatabaseUrl } from "./url";

const POOLED = "postgresql://user:pass@ep-quiet-sky-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://user:pass@ep-quiet-sky-a1b2c3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("directDatabaseUrl", () => {
  it("prefers DATABASE_URL_UNPOOLED", () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: "postgresql://u:p@direct/db" })).toBe(
      "postgresql://u:p@direct/db",
    );
  });

  it("strips -pooler from the first host label of DATABASE_URL", () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED })).toBe(DIRECT);
  });

  it("keeps a URL that is already direct", () => {
    expect(directDatabaseUrl({ DATABASE_URL: DIRECT })).toBe(DIRECT);
  });

  it("only touches the first label", () => {
    const url = "postgresql://u:p@ep-x.eu-pooler.example.com/db";
    expect(directDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("ignores a blank DATABASE_URL_UNPOOLED", () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: "  " })).toBe(DIRECT);
  });

  it("is undefined with no URL or a malformed one", () => {
    expect(directDatabaseUrl({})).toBeUndefined();
    expect(directDatabaseUrl({ DATABASE_URL: "not a url" })).toBeUndefined();
  });
});
