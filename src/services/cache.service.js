/**
 * Simple in-memory cache service
 * Caches API responses for performance & rate-limit safety
 */

class CacheService {
  constructor() {
    this.cache = {};
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached data if still valid
   */
  get(key) {
    if (!this.cache[key]) return null;

    const { data, timestamp } = this.cache[key];
    const age = Date.now() - timestamp;

    if (age > this.ttl) {
      console.log(`🔄 Cache expired for ${key} (${Math.round(age / 1000)}s old)`);
      delete this.cache[key];
      return null;
    }

    console.log(`✅ Cache HIT for ${key} (${Math.round(age / 1000)}s old)`);
    return data;
  }

  /**
   * Set cache data
   */
  set(key, data) {
    const timestamp = Date.now();
    this.cache[key] = { data, timestamp };
    console.log(`💾 Cache SET for ${key}`);
  }

  /**
   * Clear specific cache key
   */
  clear(key) {
    if (this.cache[key]) {
      delete this.cache[key];
      console.log(`🗑️ Cache cleared for ${key}`);
    }
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache = {};
    console.log(`🗑️ All cache cleared`);
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      keys: Object.keys(this.cache),
      count: Object.keys(this.cache).length,
      ttl: this.ttl,
    };
  }
}

module.exports = new CacheService();
