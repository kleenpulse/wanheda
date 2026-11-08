/** The sha256 the npm package's `checksums.json` gives a release file, or null. */
export function expectedSha(checksumsJson: string, file: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(checksumsJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = (parsed as Record<string, unknown>)[file];
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

/** The sha256 a release's `SHASUMS256.txt` gives a file (`<hex> *<name>` lines), or null. */
export function shasumsEntry(text: string, file: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (match?.[2] === file) return match[1] ?? null;
  }
  return null;
}
