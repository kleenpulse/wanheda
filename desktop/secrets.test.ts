import { describe, expect, test } from "vitest";
import { loadSecrets, NoKeychainError, saveSecrets, type Sealer, type SecretStore } from "./secrets";

type MemoryStore = SecretStore & { data: Buffer | null; writes: number };

function memoryStore(initial: Buffer | null = null): MemoryStore {
  const store: MemoryStore = {
    data: initial,
    writes: 0,
    read: () => store.data,
    write: (data) => {
      store.writes += 1;
      store.data = data;
    },
    keepBroken: () => void (store.data = null),
    remove: () => void (store.data = null),
  };
  return store;
}

/** A reversible fake: "sealed:" + base64. */
function fakeSealer(backend = "win32", protects = true, reseal = false): Sealer {
  return {
    backend,
    protects,
    seal: (text) => Promise.resolve(Buffer.from(`sealed:${Buffer.from(text).toString("base64")}`)),
    open: (sealed) => {
      const raw = sealed.toString();
      if (!raw.startsWith("sealed:")) return Promise.reject(new Error("bad"));
      return Promise.resolve({ text: Buffer.from(raw.slice(7), "base64").toString(), reseal });
    },
  };
}

async function sealedRecord(value: unknown): Promise<Buffer> {
  const data = (await fakeSealer().seal(JSON.stringify(value))).toString("base64");
  return Buffer.from(JSON.stringify({ v: 1, backend: "win32", data }));
}

describe("secrets", () => {
  test("no file: none (first run asks)", async () => {
    expect(await loadSecrets(memoryStore(), fakeSealer())).toEqual({ kind: "none" });
  });

  test("round trip, and the file never holds the values in plain text", async () => {
    const store = memoryStore();
    await saveSecrets(store, fakeSealer(), { DATABASE_URL: "postgres://x", ADMIN_EMAILS: "me@example.com" });
    expect(store.data?.toString()).not.toContain("postgres://x");
    expect(JSON.parse(store.data?.toString() ?? "")).toMatchObject({ v: 1, backend: "win32" });
    expect(await loadSecrets(store, fakeSealer())).toEqual({ kind: "ok", values: { DATABASE_URL: "postgres://x", ADMIN_EMAILS: "me@example.com" } });
  });

  test("demo mode is an empty record", async () => {
    const store = memoryStore();
    await saveSecrets(store, fakeSealer(), {});
    expect(await loadSecrets(store, fakeSealer())).toEqual({ kind: "ok", values: {} });
  });

  test("a changed keychain is reported, not replaced", async () => {
    const store = memoryStore();
    await saveSecrets(store, fakeSealer("win32"), { DATABASE_URL: "x" });
    const before = store.data;
    expect(await loadSecrets(store, fakeSealer("gnome_libsecret"))).toEqual({ kind: "keychain-changed", was: "win32", now: "gnome_libsecret" });
    expect(store.data).toBe(before);
  });

  test("a keychain that can't decrypt now is reported", async () => {
    const store = memoryStore();
    await saveSecrets(store, fakeSealer(), { DATABASE_URL: "x" });
    expect(await loadSecrets(store, fakeSealer("win32", false))).toEqual({ kind: "keychain-unavailable", backend: "win32" });
  });

  test("damaged files are reported, not replaced", async () => {
    for (const raw of ["{broken", "null", '{"v":2,"backend":"win32","data":""}', '{"v":1,"backend":"win32","data":"bm90IHNlYWxlZA=="}']) {
      const store = memoryStore(Buffer.from(raw));
      expect(await loadSecrets(store, fakeSealer()), raw).toEqual({ kind: "damaged" });
      expect(store.data?.toString()).toBe(raw);
    }
  });

  test("a sealed record keeps known names only; wrong types are damage", async () => {
    expect(await loadSecrets(memoryStore(await sealedRecord({ DATABASE_URL: "x", EVIL: "y" })), fakeSealer())).toEqual({ kind: "ok", values: { DATABASE_URL: "x" } });
    expect(await loadSecrets(memoryStore(await sealedRecord({ DATABASE_URL: 5 })), fakeSealer())).toEqual({ kind: "damaged" });
  });

  test("reseals when the keychain asks", async () => {
    const store = memoryStore(await sealedRecord({ DATABASE_URL: "x" }));
    expect((await loadSecrets(store, fakeSealer("win32", true, true))).kind).toBe("ok");
    expect(store.writes).toBe(1);
  });

  test("never saves without a keychain", async () => {
    const store = memoryStore();
    await expect(saveSecrets(store, fakeSealer("basic_text", false), { DATABASE_URL: "x" })).rejects.toBeInstanceOf(NoKeychainError);
    expect(store.data).toBeNull();
  });
});
