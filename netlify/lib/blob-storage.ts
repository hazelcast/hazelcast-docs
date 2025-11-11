// Netlify Blobs storage wrapper with automatic expiration handling
// Falls back to in-memory storage for local development

interface StoredData<T> {
  value: T;
  expiresAt: number;
}

// In-memory fallback for local development
const inMemoryStores = new Map<string, Map<string, StoredData<any>>>();

function getInMemoryStore<T>(storeName: string): Map<string, StoredData<T>> {
  if (!inMemoryStores.has(storeName)) {
    inMemoryStores.set(storeName, new Map());
  }
  return inMemoryStores.get(storeName)!;
}

/**
 * Creates a blob storage wrapper with automatic expiration handling.
 * Uses Netlify Blobs in production, falls back to in-memory storage for local development.
 *
 * @param storeName - The name of the storage
 * @returns Storage interface with set, get, delete, and has methods
 */
export function createBlobStorage<T>(storeName: string) {
  const isProduction = process.env.NETLIFY === 'true';

  if (!isProduction) {
    // In-memory storage for local development
    console.log(`[${storeName}] Using in-memory storage for local development`);
    const memStore = getInMemoryStore<T>(storeName);

    return {
      async set(key: string, value: T, ttlMs?: number): Promise<void> {
        const data: StoredData<T> = {
          value,
          expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
        };
        memStore.set(key, data);

        // Auto-cleanup for in-memory storage
        if (ttlMs) {
          setTimeout(() => memStore.delete(key), ttlMs);
        }
      },

      async get(key: string): Promise<T | null> {
        const data = memStore.get(key);
        if (!data) {
          return null;
        }

        // Check if expired
        if (data.expiresAt < Date.now()) {
          memStore.delete(key);
          return null;
        }

        return data.value;
      },

      async delete(key: string): Promise<void> {
        memStore.delete(key);
      },

      async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
      },
    };
  }

  // Netlify Blobs for production - lazy initialization
  console.log(`[${storeName}] Using Netlify Blobs for production`);
  let blobStore: any = null;

  const getStore = async () => {
    if (!blobStore) {
      const { getStore: getBlobStore } = await import('@netlify/blobs');
      blobStore = getBlobStore(storeName);
    }
    return blobStore;
  };

  return {
    async set(key: string, value: T, ttlMs?: number): Promise<void> {
      const store = await getStore();
      const data: StoredData<T> = {
        value,
        expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
      };
      await store.set(key, JSON.stringify(data));
    },

    async get(key: string): Promise<T | null> {
      const store = await getStore();
      const raw = await store.get(key, { type: 'text' });
      if (!raw) {
        return null;
      }

      const data: StoredData<T> = JSON.parse(raw);

      // Check if expired
      if (data.expiresAt < Date.now()) {
        await store.delete(key);
        return null;
      }

      return data.value;
    },

    async delete(key: string): Promise<void> {
      const store = await getStore();
      await store.delete(key);
    },

    async has(key: string): Promise<boolean> {
      const value = await this.get(key);
      return value !== null;
    },
  };
}