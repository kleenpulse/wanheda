import { safeStorage } from "electron";
import type { Sealer } from "./secrets";

/**
 * Electron safeStorage, async API (the sync one is deprecated in Electron 45).
 * On Windows it is DPAPI, tied to the signed-in Windows user. A Linux
 * basic_text backend doesn't really encrypt, so it counts as no protection.
 */
export async function electronSealer(): Promise<Sealer> {
  const linux = process.platform === "linux";
  const available = await safeStorage.isAsyncEncryptionAvailable();
  // Linux picks its backend while the async encryptor starts, so read it after.
  const backend = linux ? safeStorage.getSelectedStorageBackend() : process.platform;
  const protects = available && !(linux && (backend === "basic_text" || backend === "unknown"));
  return {
    backend,
    protects,
    seal: (text) => safeStorage.encryptStringAsync(text),
    open: async (sealed) => {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(sealed);
      return { text: result, reseal: shouldReEncrypt };
    },
  };
}
