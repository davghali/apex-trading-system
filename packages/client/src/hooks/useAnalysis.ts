import { useState, useCallback, useRef, useEffect } from 'react';
import api from '@/services/api';
import { useStore } from '@/store';

interface AnalysisResponse {
  bias?: { weekly?: unknown; daily?: unknown; po3?: unknown };
  structure?: { structures?: unknown; alignment?: unknown };
  pois?: { pois?: unknown; liquidityMap?: unknown };
  confluence?: unknown;
  dxy?: { price?: number; trend?: string; correlation?: string; correlationScore?: number; smt?: unknown };
}

const CACHE_TTL = 60000; // 1 minute cache
const AUTO_REFRESH_INTERVAL = 300000; // 5 minutes

export function useAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const instrument = useStore((s) => s.instrument);
  const isInKillzone = useStore((s) => s.isInKillzone);

  const cacheRef = useRef<{ data: AnalysisResponse | null; timestamp: number; instrument: string }>({
    data: null,
    timestamp: 0,
    instrument: '',
  });

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyData = useCallback((data: AnalysisResponse) => {
    const store = useStore.getState();

    try {
      if (data.bias) {
        if (data.bias.weekly) store.updateWeeklyBias(data.bias.weekly as any);
        if (data.bias.daily) store.updateDailyBias(data.bias.daily as any);
        if (data.bias.po3) store.updatePO3(data.bias.po3 as any);
      }
      if (data.structure) {
        const s = data.structure as any;
        if (s.structures) store.setStructures(s.structures);
        if (s.alignment) store.updateAlignment(s.alignment);
      }
      if (data.pois) {
        const p = data.pois as any;
        if (p.pois) store.setPOIs(p.pois);
        if (p.liquidityMap) store.updateLiquidityMap(p.liquidityMap);
      }
      if (data.confluence) {
        store.updateConfluence(data.confluence as any);
      }
      if (data.dxy) {
        const d = data.dxy;
        if (typeof d.price === 'number') store.setDXYPrice(d.price);
        if (d.trend) store.setDXYTrend(d.trend as any);
        if (d.correlation) store.setCorrelation(d.correlation as any, d.correlationScore ?? 0);
        if (d.smt) store.setSMTDivergence(d.smt as any);
      }
    } catch (err) {
      console.error('[useAnalysis] Error applying data:', err);
    }
  }, []);

  const fetchAnalysis = useCallback(async (force = false) => {
    // Check cache if not forced
    if (
      !force &&
      cacheRef.current.data &&
      cacheRef.current.instrument === instrument &&
      Date.now() - cacheRef.current.timestamp < CACHE_TTL
    ) {
      return cacheRef.current.data;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get<AnalysisResponse>('/analysis', {
        params: { instrument },
      });

      const data = response.data;

      // Cache the result
      cacheRef.current = {
        data,
        timestamp: Date.now(),
        instrument,
      };

      applyData(data);
      setLastFetch(Date.now());
      return data;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Analysis failed';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [instrument, applyData]);

  const requestFullScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<AnalysisResponse>('/analysis/scan', { instrument });
      const data = response.data;

      if (data) {
        // Invalidate cache for fresh data
        cacheRef.current = {
          data,
          timestamp: Date.now(),
          instrument,
        };
        applyData(data);
      }

      setLastFetch(Date.now());
      return data;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Scan failed';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [instrument, applyData]);

  const refresh = useCallback(() => fetchAnalysis(true), [fetchAnalysis]);

  // Auto-refresh during killzones
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }

    if (isInKillzone) {
      autoRefreshRef.current = setInterval(() => {
        fetchAnalysis(false);
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [isInKillzone, fetchAnalysis]);

  // Invalidate cache when instrument changes
  useEffect(() => {
    if (cacheRef.current.instrument !== instrument) {
      cacheRef.current = { data: null, timestamp: 0, instrument: '' };
    }
  }, [instrument]);

  return {
    loading,
    error,
    lastFetch,
    fetchAnalysis,
    requestFullScan,
    refresh,
  };
}
