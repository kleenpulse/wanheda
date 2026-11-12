import { createHash, randomBytes } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { HANDOFF_TTL_SECONDS, isHandoffValue } from "./desktop-link";

/*
 * The desktop app's sign-in handoff (ADR-0016, SPEC V68), as a Better Auth
 * plugin with two server-only endpoints: neither is on the HTTP router, so the
 * only ways in are app/api/desktop/handoff and app/api/desktop/redeem.
 *
 * mint: the browser, signed in, gets a single-use token for its user. Only a
 * hash of it is stored, in Better Auth's verification table, for 2 minutes.
 * redeem: the app's window spends the token and gets a session of its own.
 *
 * Better Auth's one-time-token plugin would hand the browser's own session to
 * the app, so signing out of one would sign out the other. Here the app's
 * session is made when the token is spent, with the app's own user agent.
 */

const PREFIX = "desktop-handoff:";

function identifier(token: string): string {
  return `${PREFIX}${createHash("sha256").update(token).digest("base64url")}`;
}

export const desktopHandoff = () =>
  ({
    id: "desktop-handoff",
    endpoints: {
      mintDesktopToken: createAuthEndpoint.serverOnly({ method: "POST", use: [sessionMiddleware] }, async (ctx) => {
        const token = randomBytes(32).toString("base64url");
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: identifier(token),
          value: ctx.context.session.user.id,
          expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
        });
        return ctx.json({ token });
      }),
      redeemDesktopToken: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ token: z.string() }) },
        async (ctx) => {
          const { token } = ctx.body;
          if (!isHandoffValue(token)) throw ctx.error("BAD_REQUEST", { message: "Invalid token" });
          // Single use: consumed here whatever happens next. Expired rows come back null.
          const row = await ctx.context.internalAdapter.consumeVerificationValue(identifier(token));
          if (!row) throw ctx.error("BAD_REQUEST", { message: "Invalid token" });
          const user = await ctx.context.internalAdapter.findUserById(row.value);
          if (!user) throw ctx.error("BAD_REQUEST", { message: "Invalid token" });
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
