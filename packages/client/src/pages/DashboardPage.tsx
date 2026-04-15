import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import BiasWidget from '@/components/dashboard/BiasWidget';
import StructureWidget from '@/components/dashboard/StructureWidget';
import POIWidget from '@/components/dashboard/POIWidget';
import KillzoneWidget from '@/components/dashboard/KillzoneWidget';
import ConfluenceWidget from '@/components/dashboard/ConfluenceWidget';
import DXYWidget from '@/components/dashboard/DXYWidget';
import AlertsFeed from '@/components/dashboard/AlertsFeed';
import QuickStats from '@/components/dashboard/QuickStats';
import TradingChart from '@/components/chart/TradingChart';
import { useStore } from '@/store';
import { formatPrice } from '@/lib/formatters';
import Badge from '@/components/common/Badge';
import { Crosshair, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2 } from 'lucide-react';
import api from '@/services/api';

const containerVariants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
};
const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const currentPrice = useStore((s) => s.currentPrice);
  const previousPrice = useStore((s) => s.previousPrice);
  const instrument = useStore((s) => s.instrument);
  const currentSignal = useStore((s) => s.currentSignal);
  const setCurrentPrice = useStore((s) => s.setCurrentPrice);
  const updateWeeklyBias = useStore((s) => s.updateWeeklyBias);
  const updateDailyBias = useStore((s) => s.updateDailyBias);
  const updatePO3 = useStore((s) => s.updatePO3);
  const setStructures = useStore((s) => s.setStructures);
  const updateAlignment = useStore((s) => s.updateAlignment);
  const setPOIs = useStore((s) => s.setPOIs);
  const updateLiquidityMap = useStore((s) => s.updateLiquidityMap);
  const setCurrentKillzone = useStore((s) => s.setCurrentKillzone);
  const updateConfluence = useStore((s) => s.updateConfluence);
  const setDXYTrend = useStore((s) => s.setDXYTrend);
  const setCorrelation = useStore((s) => s.setCorrelation);

  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/analysis/${instrument}`);

      // Price
      try {
        if (typeof data.current_price === 'number' && setCurrentPrice) {
          setCurrentPrice(data.current_price);
        }
      } catch (e) { console.warn('[Dashboard] Price update failed:', e); }

      // Bias
      try {
        const bias = data.bias || {};
        if (bias.weekly && updateWeeklyBias) updateWeeklyBias(bias.weekly);
        if (bias.daily && updateDailyBias) updateDailyBias(bias.daily);
        if (bias.po3 && updatePO3) updatePO3(bias.po3);
      } catch (e) { console.warn('[Dashboard] Bias update failed:', e); }

      // Structure
      try {
        const struct = data.structure || {};
        if (struct.structures && setStructures) setStructures(struct.structures);
        if (struct.alignment && updateAlignment) updateAlignment(struct.alignment);
      } catch (e) { console.warn('[Dashboard] Structure update failed:', e); }

      // POIs
      try {
        const pois = data.pois || {};
        if (pois.pois && setPOIs) setPOIs(pois.pois);
        if (pois.liquidity_map && updateLiquidityMap) updateLiquidityMap(pois.liquidity_map);
      } catch (e) { console.warn('[Dashboard] POI update failed:', e); }

      // Session
      try {
        const session = data.session || {};
        if (session.current_session && setCurrentKillzone) {
          setCurrentKillzone({
            name: session.current_session,
            active: session.is_active || false,
            timeRemaining: session.time_remaining || 0,
            progress: session.progress || 0,
          });
        }
      } catch (e) { console.warn('[Dashboard] Session update failed:', e); }

      // Confluence
      try {
        if (data.confluence && updateConfluence) updateConfluence(data.confluence);
      } catch (e) { console.warn('[Dashboard] Confluence update failed:', e); }

      // DXY
      try {
        const dxy = data.dxy || {};
        if (dxy.dxy_structure && setDXYTrend) setDXYTrend(dxy.dxy_structure);
        if (dxy.eurusd_confirms !== undefined && setCorrelation) {
          setCorrelation(
            dxy.eurusd_confirms ? 'CONFIRMS' : 'DIVERGES',
            dxy.eurusd_confluence_points || 0
          );
        }
      } catch (e) { console.warn('[Dashboard] DXY update failed:', e); }

      setLastUpdate(new Date().toLocaleTimeString('fr-FR'));
    } catch (e: unknown) {
      console.warn('[Dashboard] Store update issue:', e);
    } finally {
      setLoading(false);
    }
  }, [instrument]);

  // Auto-fetch on mount and every 5 minutes
  useEffect(() => {
    fetchAnalysis();
    const interval = setInterval(fetchAnalysis, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAnalysis]);

  // Re-fetch when instrument changes
  useEffect(() => {
    fetchAnalysis();
  }, [instrument]);

  const priceUp = currentPrice >= previousPrice;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
      {/* Top price bar */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-ict-text">{instrument}</h1>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-mono font-bold ${priceUp ? 'text-ict-bullish' : 'text-ict-bearish'}`}>
              {currentPrice > 0 ? formatPrice(currentPrice, instrument) : '---'}
            </span>
            {currentPrice > 0 && (
              priceUp
                ? <ArrowUpRight size={18} className="text-ict-bullish" />
                : <ArrowDownRight size={18} className="text-ict-bearish" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Last update */}
          {lastUpdate && (
            <span className="text-xs text-ict-muted">MAJ: {lastUpdate}</span>
          )}
          {error && (
            <span className="text-xs text-ict-bearish">Erreur API</span>
          )}

          {/* Refresh button */}
          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ict-accent/10 border border-ict-accent/30 text-ict-accent text-xs font-medium hover:bg-ict-accent/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Scan...' : 'Scan'}
          </button>

          {/* Entry signal */}
          {currentSignal && currentSignal.status === 'ACTIVE' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ict-accent/10 border border-ict-accent/20"
            >
              <Crosshair size={14} className="text-ict-accent" />
              <span className="text-xs font-semibold text-ict-accent">SIGNAL</span>
              <Badge variant={currentSignal.direction === 'LONG' ? 'bullish' : 'bearish'} size="xs">
                {currentSignal.direction}
              </Badge>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Row 1: Bias + Structure + KZ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BiasWidget />
        <StructureWidget />
        <KillzoneWidget />
      </motion.div>

      {/* Chart */}
      <motion.div variants={itemVariants}>
        <TradingChart height={380} />
      </motion.div>

      {/* Row 2: POI + Confluence + DXY */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <POIWidget />
        <ConfluenceWidget />
        <DXYWidget />
      </motion.div>

      {/* Row 3: Alerts + QuickStats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AlertsFeed />
        <QuickStats />
      </motion.div>
    </motion.div>
  );
}
