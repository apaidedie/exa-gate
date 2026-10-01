import type { StateStore } from './types.js';
import { canDecrypt, decrypt, encrypt, isEncryptedFormat } from '../crypto.js';

export type ReencryptOptions = {
  secret: string;
  legacySecret?: string;
};

/**
 * Re-encrypt stored keys with the current EXA_KEYS_ENCRYPTION_SECRET.
 *
 * Handles two upgrade paths:
 *  - secret rotation: rows written with EXA_KEYS_ENCRYPTION_SECRET_LEGACY
 *  - plaintext rows from deployments that ran without any secret
 *
 * Rows that cannot be decrypted by either secret abort startup with an
 * actionable error instead of failing later with an obscure GCM error.
 * Returns the number of rows re-encrypted (0 = nothing to do).
 */
export function reencryptKeys(state: StateStore, options: ReencryptOptions): number {
  const rows = state.listPersistentKeys().filter((row) => row.value);
  let migrated = 0;
  for (const row of rows) {
    const stored = row.value as string;
    if (canDecrypt(stored, options.secret)) continue;

    let plaintext: string | null = null;
    if (options.legacySecret && canDecrypt(stored, options.legacySecret)) {
      plaintext = decrypt(stored, options.legacySecret);
    } else if (!isEncryptedFormat(stored)) {
      // Row predates encryption — it was stored as plaintext.
      plaintext = stored;
    }

    if (plaintext === null) {
      throw new Error(
        `Key "${row.id}" cannot be decrypted with the current EXA_KEYS_ENCRYPTION_SECRET. ` +
          'If the secret was rotated, set EXA_KEYS_ENCRYPTION_SECRET_LEGACY to the previous secret and restart once.'
      );
    }

    state.upsertKey(row.id, encrypt(plaintext, options.secret), row.weight, row.enabled);
    migrated += 1;
  }
  return migrated;
}
