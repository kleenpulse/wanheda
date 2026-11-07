import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PdfPasswords, openFailure, type PasswordBackend } from "./pdf-password";

// Locked PDFs (V40): pdf.js's password errors, the device-only password store,
// and a real encrypted PDF (built here: RC4, standard security handler R2) opened by pdf.js.

describe("openFailure", () => {
  it("tells a missing password, a wrong one and a broken file apart", () => {
    expect(openFailure(Object.assign(new Error("x"), { name: "PasswordException", code: 1 }))).toBe("need-password");
    expect(openFailure(Object.assign(new Error("x"), { name: "PasswordException", code: 2 }))).toBe("wrong-password");
    expect(openFailure(Object.assign(new Error("x"), { name: "InvalidPDFException" }))).toBe("broken");
    expect(openFailure(null)).toBe("broken");
    expect(openFailure("PasswordException")).toBe("broken");
  });
});

function memoryDevice(): PasswordBackend & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    get: (sha) => Promise.resolve(rows.get(sha)),
    put: (sha, pw) => {
      rows.set(sha, pw);
      return Promise.resolve();
    },
    delete: (sha) => {
      rows.delete(sha);
      return Promise.resolve();
    },
  };
}

describe("PdfPasswords", () => {
  it("remembers on the device when asked, and finds it again in a new tab", async () => {
    const device = memoryDevice();
    await new PdfPasswords(() => Promise.resolve(device)).keep("a", "secret", true);
    expect(device.rows.get("a")).toBe("secret");
    expect(await new PdfPasswords(() => Promise.resolve(device)).get("a")).toBe("secret");
  });

  it("not remembered: this tab only, and an older device copy goes", async () => {
    const device = memoryDevice();
    device.rows.set("a", "old");
    const store = new PdfPasswords(() => Promise.resolve(device));
    await store.keep("a", "new", false);
    expect(await store.get("a")).toBe("new");
    expect(device.rows.has("a")).toBe(false);
    expect(await new PdfPasswords(() => Promise.resolve(device)).get("a")).toBeUndefined();
  });

  it("forget drops it everywhere", async () => {
    const device = memoryDevice();
    const store = new PdfPasswords(() => Promise.resolve(device));
    await store.keep("a", "secret", true);
    await store.forget("a");
    expect(await store.get("a")).toBeUndefined();
    expect(device.rows.size).toBe(0);
  });

  it("no device (demo, no IndexedDB) or a failing one: memory still works", async () => {
    const none = new PdfPasswords(() => Promise.resolve(null));
    await none.keep("a", "secret", true);
    expect(await none.get("a")).toBe("secret");
    const broken: PasswordBackend = { get: () => Promise.reject(new Error("x")), put: () => Promise.reject(new Error("x")), delete: () => Promise.reject(new Error("x")) };
    const flaky = new PdfPasswords(() => Promise.resolve(broken));
    await flaky.keep("b", "pw", true);
    expect(await flaky.get("b")).toBe("pw");
    expect(await flaky.get("c")).toBeUndefined();
  });
});

// ── A real locked PDF ──────────────────────────────────────────────────────

const PAD = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
const md5 = (...parts: Buffer[]) => createHash("md5").update(Buffer.concat(parts)).digest();
const padded = (pw: string) => Buffer.concat([Buffer.from(pw, "latin1"), PAD]).subarray(0, 32);

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + (s[i] ?? 0) + (key[i % key.length] ?? 0)) & 255;
    [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
  }
  const out = Buffer.alloc(data.length);
  let a = 0;
  let b = 0;
  for (let n = 0; n < data.length; n++) {
    a = (a + 1) & 255;
    b = (b + (s[a] ?? 0)) & 255;
    [s[a], s[b]] = [s[b] ?? 0, s[a] ?? 0];
    out[n] = (data[n] ?? 0) ^ (s[((s[a] ?? 0) + (s[b] ?? 0)) & 255] ?? 0);
  }
  return out;
}

/** A one-page PDF saying `text`, locked with `password` (40-bit RC4, R2: what pdf.js supports and needs no AES here). */
function lockedPdf(text: string, password: string): Uint8Array {
  const id = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
  const p = Buffer.alloc(4);
  p.writeInt32LE(-4);
  const o = rc4(md5(padded(`${password}-owner`)).subarray(0, 5), padded(password));
  const key = md5(padded(password), o, p, id).subarray(0, 5);
  const u = rc4(key, PAD);
  const objKey = (num: number) => md5(key, Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0])).subarray(0, 10);

  const content = rc4(objKey(4), Buffer.from(`BT /F1 20 Tf 50 700 Td (${text}) Tj ET`, "latin1"));
  const objs: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"),
    Buffer.concat([Buffer.from(`<< /Length ${String(content.length)} >>\nstream\n`), content, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.from(`<< /Filter /Standard /V 1 /R 2 /O <${o.toString("hex")}> /U <${u.toString("hex")}> /P -4 >>`),
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  let at = chunks[0]?.length ?? 0;
  const offsets: number[] = [];
  for (const [i, body] of objs.entries()) {
    offsets.push(at);
    const obj = Buffer.concat([Buffer.from(`${String(i + 1)} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    chunks.push(obj);
    at += obj.length;
  }
  const n = objs.length + 1;
  chunks.push(
    Buffer.from(
      `xref\n0 ${String(n)}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("")}` +
        `trailer\n<< /Size ${String(n)} /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>] >>\nstartxref\n${String(at)}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(chunks));
}

// pdf.js's legacy build in Node, as extract.test.ts does.
describe("a locked PDF in pdf.js", () => {
  const open = async (password?: string) => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: lockedPdf("Statement for May.", "test"), verbosity: 0, ...(password !== undefined ? { password } : {}) });
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      return content.items.map((i) => ("str" in i ? i.str : "")).join("");
    } finally {
      await task.destroy();
    }
  };

  it("asks for the password, refuses a wrong one, and opens with the right one", async () => {
    expect(openFailure(await open().catch((e: unknown) => e))).toBe("need-password");
    expect(openFailure(await open("nope").catch((e: unknown) => e))).toBe("wrong-password");
    expect(await open("test")).toBe("Statement for May.");
  });
});
