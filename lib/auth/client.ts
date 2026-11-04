import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

// Same-origin: the client talks to /api/auth on whatever host serves the page.
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});
