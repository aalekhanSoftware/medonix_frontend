import { Injectable } from '@angular/core';

export interface CacheEntry<T> {
  data: T;
  expiration: number;
  lastAccessed: number;
}

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private cache: { [key: string]: CacheEntry<any> } = {};
  private readonly DEFAULT_EXPIRATION_MINUTES = 30;
  private readonly MAX_CACHE_SIZE = 100;

  set<T>(key: string, data: T, expirationMinutes: number = this.DEFAULT_EXPIRATION_MINUTES): void {
    // Implement LRU eviction if cache is too large
    if (Object.keys(this.cache).length >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    const expirationTime = Date.now() + (expirationMinutes * 60 * 1000);
    this.cache[key] = {
      data,
      expiration: expirationTime,
      lastAccessed: Date.now()
    };

    // Also store in localStorage as backup
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        expiration: expirationTime,
        lastAccessed: Date.now()
      }));
    } catch (e) {
      // Handle localStorage quota exceeded or other errors
      console.warn('Could not cache data in localStorage', e);
    }
  }

  get<T>(key: string): T | null {
    // First check memory cache
    const entry = this.cache[key];
    if (entry) {
      if (entry.expiration > Date.now()) {
        // Update last accessed time
        entry.lastAccessed = Date.now();
        return entry.data;
      } else {
        // Remove expired entry
        delete this.cache[key];
      }
    }

    // Then check localStorage
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed: CacheEntry<T> = JSON.parse(stored);
        if (parsed.expiration > Date.now()) {
          this.cache[key] = parsed;
          return parsed.data;
        }
        // Clear expired data
        localStorage.removeItem(key);
      }
    } catch (e) {
      // Handle JSON parsing errors
      console.warn('Could not parse cached data from localStorage', e);
      localStorage.removeItem(key);
    }

    return null;
  }

  clear(key: string): void {
    delete this.cache[key];
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Handle localStorage errors
      console.warn('Could not remove cached data from localStorage', e);
    }
  }

  clearAll(): void {
    this.cache = {};
    try {
      localStorage.clear();
    } catch (e) {
      // Handle localStorage errors
      console.warn('Could not clear localStorage', e);
    }
  }

  private evictLRU(): void {
    // Find the least recently used entry
    let lruKey: string | null = null;
    let oldestAccess = Infinity;

    for (const key in this.cache) {
      if (this.cache[key].lastAccessed < oldestAccess) {
        oldestAccess = this.cache[key].lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      delete this.cache[lruKey];
      try {
        localStorage.removeItem(lruKey);
      } catch (e) {
        // Handle localStorage errors
        console.warn('Could not remove LRU entry from localStorage', e);
      }
    }
  }

  // Get cache statistics for debugging
  getStats(): { size: number; keys: string[] } {
    const keys = Object.keys(this.cache);
    return {
      size: keys.length,
      keys
    };
  }
}