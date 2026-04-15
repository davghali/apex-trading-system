import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { env } from '../config/env.js';

// ── Types ───────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

interface EngineHealthStatus {
  connected: boolean;
  lastCheck: number;
  lastSuccessful: number;
  consecutiveFailures: number;
  latencyMs: number | null;
}

interface CachedResponse<T = unknown> {
  data: T;
  cached: boolean;
  cacheAge?: number; // seconds since cache was set
  warning?: string;
}

// ── Cache TTLs (milliseconds) ───────────────────────────────
const CACHE_TTL = {
  BIAS: 5 * 60 * 1000,         // 5 min
  STRUCTURE: 3 * 60 * 1000,    // 3 min
  CONFLUENCE: 3 * 60 * 1000,   // 3 min
  POI: 3 * 60 * 1000,          // 3 min
  ANALYSIS: 2 * 60 * 1000,     // 2 min
  CANDLES: 60 * 1000,          // 1 min
  KILLZONE: 60 * 1000,         // 1 min
  NEWS_CALENDAR: 30 * 60 * 1000, // 30 min
  NEWS_TODAY: 5 * 60 * 1000,   // 5 min
  SCAN: 2 * 60 * 1000,         // 2 min
} as const;

// ── Retry configuration (augmentee pour cold start Render) ──
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 15000,
  retryableStatuses: new Set([408, 429, 500, 502, 503, 504]),
} as const;

class EngineClient {
  private client: AxiosInstance;
  private cache: Map<string, CacheEntry> = new Map();
  private health: EngineHealthStatus = {
    connected: false,
    lastCheck: 0,
    lastSuccessful: 0,
    consecutiveFailures: 0,
    latencyMs: null,
  };
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: env.ENGINE_URL,
      timeout: 90_000, // 90s pour cold start Render
      headers: { 'Content-Type': 'application/json' },
    });

    // Start background health monitoring
    this.startHealthMonitoring();
  }

  // ── Health monitoring ───────────────────────────────────────

  private startHealthMonitoring(): void {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.healthCheck().catch(() => {});
    }, 30_000);

    // Initial check
    this.healthCheck().catch(() => {});
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    const start = Date.now();
    this.health.lastCheck = start;

    try {
      await this.client.get('/health', { timeout: 5000 });
      this.health.connected = true;
      this.health.lastSuccessful = Date.now();
      this.health.consecutiveFailures = 0;
      this.health.latencyMs = Date.now() - start;
      return true;
    } catch {
      this.health.connected = false;
      this.health.consecutiveFailures++;
      this.health.latencyMs = null;

      if (this.health.consecutiveFailures % 5 === 1) {
        console.error(
          `[ENGINE] Health check failed (${this.health.consecutiveFailures} consecutive failures)`
        );
      }
      return false;
    }
  }

  getHealthStatus(): EngineHealthStatus {
    return { ...this.health };
  }

  // ── Cache management ────────────────────────────────────────

  private getCacheKey(endpoint: string, params?: Record<string, unknown>): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${endpoint}:${paramStr}`;
  }

  private getFromCache<T>(key: string): CachedResponse<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return {
      data: entry.data as T,
      cached: true,
      cacheAge: Math.round(age / 1000),
    };
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });

    // Evict stale entries if cache grows too large (>200 entries)
    if (this.cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now - v.timestamp > v.ttl) {
          this.cache.delete(k);
        }
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    console.log('[ENGINE] Cache cleared');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // ── Retry logic with exponential backoff ────────────────────

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const result = await operation();

        // Reset health on success
        if (!this.health.connected) {
          this.health.connected = true;
          this.health.consecutiveFailures = 0;
          console.log('[ENGINE] Connection restored');
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const axiosErr = error as AxiosError;
        const status = axiosErr.response?.status;

        // Don't retry client errors (4xx except specific retryable ones)
        if (status && status >= 400 && status < 500 && !RETRY_CONFIG.retryableStatuses.has(status)) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
            RETRY_CONFIG.maxDelayMs
          );
          // Add jitter: +/- 25%
          const jitter = delay * (0.75 + Math.random() * 0.5);

          console.warn(
            `[ENGINE] ${context} attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries} failed ` +
            `(${status || 'NETWORK'}), retrying in ${Math.round(jitter)}ms...`
          );

          await new Promise((resolve) => setTimeout(resolve, jitter));
        }
      }
    }

    // All retries exhausted
    this.health.connected = false;
    this.health.consecutiveFailures++;

    throw lastError || new Error(`${context}: all retries exhausted`);
  }

  // ── Core request method (retry + cache fallback) ───────────

  private async request<T>(
    endpoint: string,
    cacheKey: string,
    cacheTtl: number,
    method: 'get' | 'post' = 'get',
    body?: unknown
  ): Promise<CachedResponse<T>> {
    // Try cache first for GET requests
    if (method === 'get') {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) return cached;
    }

    try {
      const result = await this.withRetry(async () => {
        if (method === 'post') {
          const { data } = await this.client.post(endpoint, body);
          return data as T;
        }
        const { data } = await this.client.get(endpoint);
        return data as T;
      }, `${method.toUpperCase()} ${endpoint}`);

      // Update cache
      this.setCache(cacheKey, result, cacheTtl);

      return { data: result, cached: false };
    } catch (error) {
      // If engine is down, try to return stale cached data with warning
      const staleEntry = this.cache.get(cacheKey);
      if (staleEntry) {
        const age = Math.round((Date.now() - staleEntry.timestamp) / 1000);
        console.warn(
          `[ENGINE] ${endpoint} failed, serving stale cache (${age}s old)`
        );
        return {
          data: staleEntry.data as T,
          cached: true,
          cacheAge: age,
          warning: `Engine unavailable. Showing cached data from ${age}s ago.`,
        };
      }

      // No cache available at all
      throw error;
    }
  }

  // ── Public API methods ────────────────────────────────────

  async analyze(instrument: string): Promise<CachedResponse> {
    return this.request(
      `/analyze`,
      this.getCacheKey('analysis', { instrument }),
      CACHE_TTL.ANALYSIS,
      'post',
      { instrument }
    );
  }

  async analyzeStructure(instrument: string): Promise<CachedResponse> {
    return this.request(
      `/analyze/structure`,
      this.getCacheKey('structure', { instrument }),
      CACHE_TTL.STRUCTURE,
      'post',
      { instrument }
    );
  }

  async analyzeBias(instrument: string): Promise<CachedResponse> {
    return this.request(
      `/analyze/bias`,
      this.getCacheKey('bias', { instrument }),
      CACHE_TTL.BIAS,
      'post',
      { instrument }
    );
  }

  async analyzePOI(instrument: string): Promise<CachedResponse> {
    return this.request(
      `/analyze/poi`,
      this.getCacheKey('poi', { instrument }),
      CACHE_TTL.POI,
      'post',
      { instrument }
    );
  }

  async analyzeConfluence(instrument: string): Promise<CachedResponse> {
    return this.request(
      `/analyze/confluence`,
      this.getCacheKey('confluence', { instrument }),
      CACHE_TTL.CONFLUENCE,
      'post',
      { instrument }
    );
  }

  async scanAll(instruments?: string[]): Promise<CachedResponse> {
    const all = instruments || ['EURUSD', 'XAUUSD', 'NAS100'];
    const results: Record<string, unknown> = {};
    for (const inst of all) {
      try {
        const r = await this.analyze(inst);
        results[inst] = r.data;
      } catch { /* skip failed */ }
    }
    return { data: results, cached: false };
  }

  async getKillzone(): Promise<CachedResponse> {
    return this.request(
      '/analyze/killzone',
      this.getCacheKey('killzone'),
      CACHE_TTL.KILLZONE,
      'post',
      {}
    );
  }

  async getCandles(
    instrument: string,
    timeframe: string,
    bars: number = 500
  ): Promise<CachedResponse> {
    return this.request(
      `/data/candles/${encodeURIComponent(instrument)}/${encodeURIComponent(timeframe)}?bars=${bars}`,
      this.getCacheKey('candles', { instrument, timeframe, bars }),
      CACHE_TTL.CANDLES
    );
  }

  async getNewsCalendar(): Promise<CachedResponse> {
    return this.request(
      '/analyze/news',
      this.getCacheKey('news-calendar'),
      CACHE_TTL.NEWS_CALENDAR,
      'post',
      {}
    );
  }

  async getNewsToday(): Promise<CachedResponse> {
    return this.request(
      '/analyze/news',
      this.getCacheKey('news-today'),
      CACHE_TTL.NEWS_TODAY,
      'post',
      {}
    );
  }
}

export const engineClient = new EngineClient();
