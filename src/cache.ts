// In-memory LRU response cache for /search (the only high-duplication,
// retry-safe read endpoint). Disabled when EXA_SEARCH_CACHE_TTL is 0.
export type CachedResponse = { body: Buffer; contentType: string };

export type ResponseCache = {
  get(key: string): CachedResponse | undefined;
  set(key: string, value: CachedResponse): void;
  size(): number;
};

export function createResponseCache(maxEntries: number): ResponseCache {
  const store = new Map<string, CachedResponse & { expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      store.delete(key);
      if (entry.expiresAt <= Date.now()) return undefined;
      store.set(key, entry); // refresh LRU position
      return { body: entry.body, contentType: entry.contentType };
    },
    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, { ...value, expiresAt: Date.now() });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    size() {
      return store.size;
    }
  };
}
