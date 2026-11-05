import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Connector secrets at rest (SPEC V33): AES-256-GCM, a fresh 12-byte IV per
// seal, and the connector id as additional data, so a blob copied onto another
// connector row fails to open instead of lending that row its secret.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export function seal(plaintext: string, aad: string, key: Uint8Array): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(body)].join(".");
}

/** The plaintext, or null when the blob is malformed, tampered with, sealed for another row or under another key. */
export function unseal(blob: string, aad: string, key: Uint8Array): string | null {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, ivPart, tagPart, bodyPart] = parts as [string, string, string, string];
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
