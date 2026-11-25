const PAGE_CACHE_LIMIT = 100;

function createPageLyricsMemoryCache() {
  const recentKeys = new Set();

  // The startup extension and add-ons use CACHE as a dictionary, including
  // property assignment, enumeration and deletion. Keep that interface.
  return new Proxy({}, {
    get(target, key, receiver) {
      if (recentKeys.delete(key)) recentKeys.add(key);
      return Reflect.get(target, key, receiver);
    },

    defineProperty(target, key, descriptor) {
      if (!Reflect.defineProperty(target, key, descriptor)) return false;
      if (typeof key !== "string") return true;

      recentKeys.delete(key);
      if (Object.getOwnPropertyDescriptor(target, key).configurable) {
        recentKeys.add(key);
        if (recentKeys.size > PAGE_CACHE_LIMIT) {
          const oldest = recentKeys.values().next().value;
          Reflect.deleteProperty(target, oldest);
          recentKeys.delete(oldest);
        }
      }
      return true;
    },

    deleteProperty(target, key) {
      if (!Reflect.deleteProperty(target, key)) return false;
      recentKeys.delete(key);
      return true;
    },
  });
}

export const pageLyricsMemoryCache = createPageLyricsMemoryCache();

function evictOldestEntries(cache, remaining) {
  for (const key of cache.keys()) {
    if (remaining <= 0) break;
    cache.delete(key);
    remaining--;
  }
}

export function createPageTranslationMemoryCache({ now = () => Date.now() } = {}) {
  return {
    _cache: new Map(),
    _maxSize: PAGE_CACHE_LIMIT,
    _ttl: 30 * 60 * 1000, // 30 minutes TTL
    _cleanupTimer: null,
    _statsEnabled: false,

    // Performance statistics
    _stats: {
      hits: 0,
      misses: 0,
      evictions: 0,
      cleanups: 0,
    },

    init() {
      if (this._cleanupTimer !== null) return;
      // Start periodic cleanup to prevent memory leaks
      this._startPeriodicCleanup();

      // Listen for memory pressure events
      if ("memory" in performance) {
        this._setupMemoryPressureListener();
      }
    },

    get(key) {
      const item = this._cache.get(key);
      if (!item) {
        if (this._statsEnabled) this._stats.misses++;
        return null;
      }

      // Check if expired
      if (now() > item.expiry) {
        this._cache.delete(key);
        if (this._statsEnabled) this._stats.misses++;
        return null;
      }

      // Move the most recently used entry to the end.
      this._cache.delete(key);
      this._cache.set(key, item);

      if (this._statsEnabled) this._stats.hits++;
      return item.data;
    },

    set(key, data) {
      this._cache.delete(key);
      if (this._cache.size >= this._maxSize) {
        this._cleanupOldEntries();
      }
      if (this._maxSize <= 0) return;
      this._cache.set(key, {
        data,
        expiry: now() + this._ttl,
      });
    },

    _cleanupOldEntries() {
      const size = this._cache.size;
      const toRemove = Math.min(size, Math.max(Math.floor(size * 0.3), size - this._maxSize + 1));
      evictOldestEntries(this._cache, toRemove);

      if (this._statsEnabled) {
        this._stats.evictions += toRemove;
        this._stats.cleanups++;
      }
    },

    _startPeriodicCleanup() {
      // Clean up expired entries every 5 minutes
      this._cleanupTimer = setInterval(() => {
        const currentTime = now();
        let removed = false;
        for (const [key, item] of this._cache) {
          if (currentTime > item.expiry) {
            this._cache.delete(key);
            removed = true;
          }
        }

        if (this._statsEnabled && removed) {
          this._stats.cleanups++;
        }
      }, 5 * 60 * 1000);
    },

    _setupMemoryPressureListener() {
      // Aggressive cleanup on memory pressure
      if (typeof PerformanceObserver !== "undefined") {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === "memory") {
                const { usedJSHeapSize, jsHeapSizeLimit } = entry;
                const memoryUsage = usedJSHeapSize / jsHeapSizeLimit;

                // If memory usage > 80%, clear half the cache
                if (memoryUsage > 0.8) {
                  this._aggressiveCleanup();
                }
              }
            }
          });
          observer.observe({ entryTypes: ["measure"] });
        } catch (error) {
          // Performance Observer not available
        }
      }
    },

    _aggressiveCleanup() {
      evictOldestEntries(this._cache, Math.floor(this._cache.size * 0.5));
    },

    clear() {
      this._cache.clear();
    },

    // Clear cache entries for a specific URI
    clearByUri(uri) {
      let removed = 0;
      for (const key of this._cache.keys()) {
        if (key.includes(uri) && this._cache.delete(key)) removed++;
      }
      return removed;
    },

    // Get cache statistics
    getStats() {
      const hitRate =
        (this._stats.hits / (this._stats.hits + this._stats.misses)) * 100;
      return {
        ...this._stats,
        hitRate: isNaN(hitRate) ? 0 : hitRate.toFixed(2),
        cacheSize: this._cache.size,
        maxSize: this._maxSize,
      };
    },

    enableStats() {
      this._statsEnabled = true;
    },
  };
}

export const pageTranslationMemoryCache = createPageTranslationMemoryCache();
