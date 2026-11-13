/** `desktop:dev`'s `next dev` only ever listens here. */
export const LISTEN_HOST = "127.0.0.1";

/**
 * The name the window uses for it. Not 127.0.0.1: WebAuthn refuses an IP
 * address as a passkey site (ADR-0014). Chromium resolves `localhost` to
 * loopback itself, never through DNS.
 */
export const ORIGIN_HOST = "localhost";

export function originFor(port: number): string {
  return `http://${ORIGIN_HOST}:${port}`;
}
