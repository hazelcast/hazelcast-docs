// Netlify Blobs storage wrapper with automatic expiration handling
// Falls back to in-memory storage for local development

interface StoredData<T> {
  value: T;
  expiresAt: number;
}

interface AuthStorage<T> {
  set(key: string, value: T, ttlMs?: number): Promise<void>;
  get(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

// ============================================================================
// In-Memory Storage (Local Development)
// ============================================================================

const inMemoryStores = new Map<string, Map<string, StoredData<any>>>();

class InMemoryStorage<T> implements AuthStorage<T> {
  private store: Map<string, StoredData<T>>;

  constructor(private storeName: string) {
    if (!inMemoryStores.has(storeName)) {
      inMemoryStores.set(storeName, new Map());
    }
    this.store = inMemoryStores.get(storeName)!;
    console.log(`[${storeName}] Using in-memory storage for local development`);
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const data: StoredData<T> = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
    };
    this.store.set(key, data);

    // Auto-cleanup for in-memory storage
    if (ttlMs) {
      setTimeout(() => this.store.delete(key), ttlMs);
    }
  }

  async get(key: string): Promise<T | null> {
    const data = this.store.get(key);
    if (!data) {
      return null;
    }

    // Check if expired
    if (data.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return data.value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}

// ============================================================================
// Netlify Blobs Storage (Production)
// ============================================================================

class NetlifyAuthStorage<T> implements AuthStorage<T> {
  private blobStore: any = null;

  constructor(private storeName: string) {
    console.log(`[${storeName}] Using Netlify Blobs for production`);
  }

  private async getStore() {
    if (!this.blobStore) {
      const { getStore } = await import('@netlify/blobs');
      this.blobStore = getStore(this.storeName);
    }
    return this.blobStore;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const store = await this.getStore();
    const data: StoredData<T> = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
    };
    await store.set(key, JSON.stringify(data));
  }

  async get(key: string): Promise<T | null> {
    const store = await this.getStore();
    const raw = await store.get(key, { type: 'text' });
    if (!raw) {
      return null;
    }

    let data: StoredData<T>;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      await store.delete(key);
      return null;
    }

    // Check if expired
    if (data.expiresAt < Date.now()) {
      await store.delete(key);
      return null;
    }

    return data.value;
  }

  async delete(key: string): Promise<void> {
    const store = await this.getStore();
    await store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}

/**
 * Creates a blob storage wrapper with automatic expiration handling.
 * Uses Netlify Blobs in production, falls back to in-memory storage for local development.
 */
export function createAuthStorage<T>(storeName: string): AuthStorage<T> {
  const isProduction = process.env.NETLIFY === 'true';
  return isProduction
    ? new NetlifyAuthStorage<T>(storeName)
    : new InMemoryStorage<T>(storeName);
}
