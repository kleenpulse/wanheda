import { type APIRequestContext, expect, test } from "@playwright/test";

// Gate-mode smoke test (SPEC V6, V8). See playwright.config.ts for how each
// mode's server is configured. Every request uses maxRedirects: 0 so each hop
// is checked by hand: that is what proves "at most one redirect, no loop".

const LOCKED_BODY = "Wanheda is locked until sign-in is configured.";

async function hop(request: APIRequestContext, path: string, headers?: Record<string, string>) {
  return request.get(path, { maxRedirects: 0, ...(headers ? { headers } : {}) });
}

test.describe("gated: auth configured, signed out", { tag: "@gated" }, () => {
  test("/ redirects to /login once, and /login answers 200", async ({ request }) => {
    const first = await hop(request, "/");
    expect(first.status()).toBe(307);
    expect(first.headers().location).toBe("/login");

    const second = await hop(request, "/login");
    expect(second.status()).toBe(200);
    expect(await second.text()).toContain("Sign in with GitHub to open your own Wanheda.");
  });

  test("a deep link keeps its path in ?next= and still ends in one hop", async ({ request }) => {
    const first = await hop(request, "/money?tab=subs");
    expect(first.status()).toBe(307);
    const location = first.headers().location ?? "";
    expect(location).toBe(`/login?next=${encodeURIComponent("/money?tab=subs")}`);

    const second = await hop(request, location);
    expect(second.status()).toBe(200);
  });

  test("/admin sends a signed-out visitor to /login like any other page", async ({ request }) => {
    const res = await hop(request, "/admin");
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe(`/login?next=${encodeURIComponent("/admin")}`);
  });

  test("/login is public and never redirects a signed-out visitor", async ({ request }) => {
    const res = await hop(request, "/login?next=%2Fmoney");
    expect(res.status()).toBe(200);
    expect(res.headers().location).toBeUndefined();
  });

  // The proxy only checks that a session cookie exists (SPEC V7), so a forged
  // one gets through it. requireOwner() must still turn it away. The page is a
  // partial prerender, so the redirect arrives inside the streamed HTML (status
  // 200), not as a 307: assert the redirect target and the absence of content.
  test("a forged session cookie passes the proxy but requireOwner() sends it to /login", async ({ request }) => {
    const res = await hop(request, "/", { cookie: "better-auth.session_token=forged.e2e" });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/<meta id="__next-page-redirect" http-equiv="refresh" content="\d+;url=\/login"/);
    expect(body).not.toContain("Signed in as");
    expect(body).not.toContain("Phase 0 · Foundation");
  });
});

test.describe("locked: database configured, auth not", { tag: "@locked" }, () => {
  for (const path of ["/", "/money", "/login", "/api/auth/get-session"]) {
    test(`${path} answers 503 with no data`, async ({ request }) => {
      const res = await hop(request, path);
      expect(res.status()).toBe(503);
      expect(res.headers()["cache-control"]).toBe("no-store");
      expect((await res.text()).trim()).toBe(LOCKED_BODY);
    });
  }
});

test.describe("demo: zero env", { tag: "@demo" }, () => {
  test("/ is open and says it runs on seed data", async ({ request }) => {
    const res = await hop(request, "/");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Demo mode");
  });

  // FR-SHELL-1: the server reads the rail cookie, so the first paint already
  // has the right width (no collapsed-then-expanded flash).
  test("the server paints the rail at the width its cookie says", async ({ request }) => {
    const collapsed = await (await hop(request, "/")).text();
    expect(collapsed).toContain('data-expanded="false"');
    expect(collapsed).toContain('aria-label="Expand sidebar"');

    const open = await (await hop(request, "/", { cookie: "wanheda-rail=open" })).text();
    expect(open).toContain('data-expanded="true"');
    expect(open).toContain('aria-label="Collapse sidebar"');
  });

  // The part the browser can paint before the owner check resolves: everything
  // before the first hidden streamed segment. It must already hold the boot
  // script and the fallback's rail band, or a hard load shifts the page.
  test("the static shell already has a rail at the cookie's width", async ({ request }) => {
    const html = await (await hop(request, "/", { cookie: "wanheda-rail=open" })).text();
    const cut = html.indexOf('hidden id="S:');
    expect(cut).toBeGreaterThan(0);
    const staticShell = html.slice(0, cut);
    expect(staticShell).toContain("wanheda-rail=open(?:;|$)");
    expect(staticShell).toContain("data-rail-skeleton");
    expect(staticShell).toContain("[html[data-rail=open]_&amp;]:w-[232px]");
  });

  test("/settings is a shell page", async ({ request }) => {
    const res = await hop(request, "/settings");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain("Demo mode");
  });

  test("/admin is not found in demo: nobody is an admin without sign-in", async ({ request }) => {
    const res = await hop(request, "/admin");
    const html = await res.text();
    expect(html).not.toContain("Who uses Wanheda");
    expect(html).toContain("could not be found");
  });

  test("/login offers the way in instead of a sign-in form", async ({ request }) => {
    const res = await hop(request, "/login");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("No sign-in needed");
  });
});
