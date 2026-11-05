// The connector seal key (SPEC V33), parsed with no IO and no crypto import, so
// env/server.ts (loaded by next.config.ts) can validate it at build time.

const KEY_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/** 32 bytes from canonical base64 (`openssl rand -base64 32`), or null. */
export function sealKeyBytes(raw: string | undefined): Uint8Array | null {
  const trimmed = raw?.trim();
  if (!trimmed || !KEY_BASE64.test(trimmed)) return null;
  const bytes = Uint8Array.from(Buffer.from(trimmed, "base64"));
  return bytes.length === 32 ? bytes : null;
}
