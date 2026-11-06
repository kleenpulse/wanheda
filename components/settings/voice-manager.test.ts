import { beforeEach, describe, expect, it, vi } from "vitest";

// The manager over fake installs: what matters here is its bookkeeping
// (queue, cancel, failure, the first voice becoming the default, delete only
// after its Undo runs out), not OPFS (voices.test.ts covers that).

interface FakeInstall {
  id: string;
  signal: AbortSignal;
  progress: (p: { received: number; total: number }) => void;
  settle: (error?: Error) => void;
}
const install = vi.hoisted(() => ({ calls: [] as FakeInstall[] }));
const removed = vi.hoisted(() => [] as string[]);
const toasts = vi.hoisted(() => [] as { id?: string; title: string; onExpire?: () => void; onClose?: () => void; action?: { onClick?: () => void } }[]);
/** What the fake disk says after a delete: true = the browser didn't let go. */
const disk = vi.hoisted(() => ({ stillThere: false }));

vi.mock("@/lib/speech/voices", async (orig) => {
  const real = await orig<typeof import("@/lib/speech/voices")>();
  return {
    ...real,
    installVoice: (id: string, signal: AbortSignal, progress: (p: { received: number; total: number }) => void) =>
      new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
        install.calls.push({
          id,
          signal,
          progress,
          settle: (error) => {
            if (error) reject(error);
            else resolve();
          },
        });
      }),
    // A refused delete leaves LJ Speech (A below) on the fake disk.
    installedVoices: () => Promise.resolve(disk.stillThere ? ["en_US-ljspeech-medium"] : []),
    hasPartial: () => Promise.resolve(false),
    isInstalled: () => Promise.resolve(disk.stillThere),
    removeVoice: (id: string) => {
      removed.push(id);
      return Promise.resolve();
    },
  };
});
vi.mock("@/lib/speech/piper", () => ({ piper: { drop: vi.fn() } }));
vi.mock("@/components/ui/toaster", () => ({
  toast: (t: (typeof toasts)[number]) => {
    toasts.push(t);
  },
  dismissToast: (id: string) => {
    toasts.find((t) => t.id === id)?.onClose?.();
  },
}));

const { useVoiceManager } = await import("./voice-manager");
const { voicePref } = await import("@/lib/speech/prefs");
const { DEFAULT_VOICE } = await import("@/lib/speech/voices");

const A = "en_US-ljspeech-medium";
const B = "en_GB-cori-medium";
const tick = () => new Promise((r) => setTimeout(r, 0));
const state = () => useVoiceManager.getState();

beforeEach(async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  // Let any run still chained from the last test settle.
  for (const c of install.calls) c.settle();
  await tick();
  install.calls.length = 0;
  removed.length = 0;
  toasts.length = 0;
  disk.stillThere = false;
  useVoiceManager.setState({ installed: [], downloads: {}, deleting: [] });
  voicePref.set(DEFAULT_VOICE);
});

describe("voice manager", () => {
  it("runs downloads one at a time, then lists the voice and makes the first one the default", async () => {
    state().download(A);
    state().download(B);
    await tick();
    expect(install.calls.map((c) => c.id)).toEqual([A]);
    expect(state().downloads[A]?.phase).toBe("downloading");
    expect(state().downloads[B]?.phase).toBe("queued");

    install.calls[0]?.progress({ received: 10, total: 100 });
    install.calls[0]?.settle();
    await tick();
    await tick();
    expect(state().installed).toEqual([A]);
    expect(state().downloads[A]).toBeUndefined();
    // Lessac, the old default, isn't here: the first voice that is takes over.
    expect(voicePref.get()).toBe(A);
    expect(install.calls.map((c) => c.id)).toEqual([A, B]);

    install.calls[1]?.settle();
    await tick();
    await tick();
    expect(state().installed).toEqual([A, B]);
    expect(voicePref.get()).toBe(A);
  });

  it("cancel drops a queued download before it starts, and a running one without a failure", async () => {
    state().download(A);
    state().download(B);
    await tick();
    state().cancel(B);
    state().cancel(A);
    expect(state().downloads).toEqual({});
    await tick();
    expect(install.calls[0]?.signal.aborted).toBe(true);
    await tick();
    expect(install.calls.map((c) => c.id)).toEqual([A]);
    expect(state().downloads).toEqual({});
    expect(state().installed).toEqual([]);
  });

  it("a failure stays, with its reason, until retried or dismissed", async () => {
    state().download(A);
    await tick();
    install.calls[0]?.settle(new Error("voice download failed its checksum"));
    await tick();
    expect(state().downloads[A]).toMatchObject({ phase: "failed", error: "voice download failed its checksum" });
    state().download(A);
    await tick();
    expect(state().downloads[A]?.phase).toBe("downloading");
    install.calls[1]?.settle();
    await tick();
    await tick();
    expect(state().installed).toEqual([A]);
  });

  it("a download again while one runs is ignored", async () => {
    state().download(A);
    state().download(A);
    await tick();
    expect(install.calls).toHaveLength(1);
  });

  it("delete waits on its Undo: undo keeps the voice, expiry removes it and moves the default", async () => {
    useVoiceManager.setState({ installed: [A, B] });
    voicePref.set(A);

    state().remove(A);
    expect(state().deleting).toEqual([A]);
    toasts.at(-1)?.action?.onClick?.();
    expect(state().deleting).toEqual([]);
    expect(removed).toEqual([]);

    state().remove(A);
    toasts.at(-1)?.onExpire?.();
    await tick();
    expect(removed).toEqual([A]);
    expect(state().installed).toEqual([B]);
    expect(state().deleting).toEqual([]);
    expect(voicePref.get()).toBe(B);
  });

  it("keep takes a delete back while its toast is up", () => {
    useVoiceManager.setState({ installed: [A] });
    state().remove(A);
    expect(state().deleting).toEqual([A]);
    state().keep(A);
    expect(state().deleting).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("a delete the browser refused keeps the voice listed and says so", async () => {
    useVoiceManager.setState({ installed: [A] });
    disk.stillThere = true;
    state().remove(A);
    toasts.at(-1)?.onExpire?.();
    await tick();
    await tick();
    expect(state().installed).toEqual([A]);
    expect(state().deleting).toEqual([]);
    expect(toasts.at(-1)?.title).toMatch(/not deleted/);
  });
});
