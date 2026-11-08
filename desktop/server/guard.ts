import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { ORIGIN_HOST, TOKEN_HEADER } from "../shared";

/*
 * Every request to the local server must name it exactly (Host
 * localhost:<port>, which a DNS-rebinding page can't fake, and not the other
 * loopback spelling) and carry the per-launch token the shell adds to the
 * app's own requests. Browser tabs and other local programs have neither.
 */

export type Verdict = { ok: true } | { ok: false; reason: "host" | "token" };

export function checkRequest(headers: IncomingHttpHeaders, port: number, token: string): Verdict {
  if (headers.host !== `${ORIGIN_HOST}:${port}`) return { ok: false, reason: "host" };
  const sent = headers[TOKEN_HEADER];
  if (typeof sent !== "string" || token === "" || !sameSecret(sent, token)) return { ok: false, reason: "token" };
  return { ok: true };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
