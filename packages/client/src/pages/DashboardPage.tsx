import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import TradingCoach from '@/components/dashboard/TradingCoach';
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

      // Bias - transform API shape (bias/phase) to store shape (direction/current)
      try {
        const biasData = data.bias || {};
        const mapBias = (b: any) => ({
          direction: (b.bias || 'NEUTRAL') as any,
          score: Number(b.score) || 0,
          conviction: (b.conviction || 'LOW') as any,
          factors: Array.isArray(b.factors) ? b.factors : [],
        });
        if (biasData.weekly && updateWeeklyBias) updateWeeklyBias(mapBias(biasData.weekly));
        if (biasData.daily && updateDailyBias) updateDailyBias(mapBias(biasData.daily));
        if (biasData.po3 && updatePO3) {
          const phase = biasData.po3.phase || 'NONE';
          const mapped = (['ACCUMULATION', 'MANIPULATION', 'DISTRIBUTION'].includes(phase) ? phase : 'NONE') as any;
          updatePO3({
            current: mapped,
            confidence: Number(biasData.po3.confidence) || 0,
          });
        }
      } catch (e) { console.warn('[Dashboard] Bias update failed:', e); }

      // Structure
      try {
        const struct = data.structure || {};
        if (struct.structures && setStructures) setStructures(struct.structures);
        if (struct.alignment && updateAlignment) updateAlignment(struct.alignment);
      } catch (e) { console.warn('[Dashboard] Structure update failed:', e); }

      // POIs - transform API shape to store shape
      try {
        const poisData = data.pois || {};
        if (poisData.pois && setPOIs) {
          const currentPrice = Number(data.current_price) || 0;
          const transformedPois = (poisData.pois as any[]).map((p, i) => {
            const typeMap: Record<string, string> = {
              'FVG': 'FVG', 'ORDER_BLOCK': 'OB', 'EXTREME_OB': 'OB',
              'BREAKER_BLOCK': 'BB', 'PROPULSION_BLOCK': 'OB',
              'SUPER_ZONE': 'OB', 'INVERSE_FVG': 'FVG',
            };
            const priceHigh = Number(p.high ?? p.price_high ?? 0);
            const priceLow = Number(p.low ?? p.price_low ?? 0);
            return {
              id: String(p.id ?? `${p.type}-${p.timeframe}-${i}`),
              type: (typeMap[p.type] || 'OB') as any,
              side: (p.direction === 'bullish' ? 'BUY' : 'SELL') as any,
              priceHigh,
              priceLow,
              timeframe: p.timeframe || '',
              strength: Number(p.quality_score ?? 50),
              mitigated: Boolean(p.mitigated || p.status === 'MITIGATED'),
              distance: currentPrice > 0 ? Math.abs((priceHigh + priceLow) / 2 - currentPrice) : 0,
              label: p.type,
            };
          });
          setPOIs(transformedPois);
        }
        if (poisData.liquidity_map && updateLiquidityMap) {
          const lm = poisData.liquidity_map;
          updateLiquidityMap({
            bsl: (lm.buy_side_liquidity || []).map((l: any) => ({
              price: Number(l.level ?? 0),
              type: (l.type && l.type.includes('EQH') ? 'EQH' : 'BSL') as any,
              strength: l.significance === 'EXTREME' ? 100 : l.significance === 'VERY_HIGH' ? 80 : l.significance === 'HIGH' ? 60 : 40,
              swept: Boolean(l.swept),
            })),
            ssl: (lm.sell_side_liquidity || []).map((l: any) => ({
              price: Number(l.level ?? 0),
              type: (l.type && l.type.includes('EQL') ? 'EQL' : 'SSL') as any,
              strength: l.significance === 'EXTREME' ? 100 : l.significance === 'VERY_HIGH' ? 80 : l.significance === 'HIGH' ? 60 : 40,
              swept: Boolean(l.swept),
            })),
          });
        }
      } catch (e) { console.warn('[Dashboard] POI update failed:', e); }

      // Session - transform API shape to match store KillzoneInfo schema
      try {
        const session = data.session || {};
        const setNextKillzone = useStore.getState().setNextKillzone;
        if (session.current_session && setCurrentKillzone) {
          const sessionName = String(session.current_session);
          const kzNameMap: Record<string, string> = {
            'LONDON_KZ': 'LONDON',
            'NY_KZ': 'NY_AM',
            'NY_AM_KZ': 'NY_AM',
            'NY_PM_KZ': 'NY_PM',
            'ASIAN_KZ': 'ASIAN',
            'ASIAN': 'ASIAN',
            'POST_SESSION': 'NONE',
            'OFF_SESSION': 'NONE',
          };
          const mappedName = (kzNameMap[sessionName] || sessionName.replace('_KZ', '')) as any;
          const labelMap: Record<string, string> = {
            'LONDON': 'London Killzone',
            'NY_AM': 'New York AM',
            'NY_PM': 'New York PM',
            'ASIAN': 'Asian Session',
            'NONE': 'Off Session',
          };
          setCurrentKillzone({
            name: mappedName,
            label: labelMap[mappedName] || sessionName,
            start: '',
            end: '',
            active: Boolean(session.is_active),
            progress: Number(session.progress) || 0,
            remainingSeconds: (Number(session.time_remaining) || 0) * 60, // API sends minutes
            model: 'CLASSIC' as any,
            characteristics: [],
          });
        }
        // Next killzone
        if (session.next_session && setNextKillzone) {
          const nextName = String(session.next_session);
          const kzNameMap: Record<string, string> = {
            'LONDON_KZ': 'LONDON',
            'NY_KZ': 'NY_AM',
            'NY_AM_KZ': 'NY_AM',
            'NY_PM_KZ': 'NY_PM',
            'ASIAN_KZ': 'ASIAN',
          };
          const mappedNext = (kzNameMap[nextName] || nextName.replace('_KZ', '')) as any;
          setNextKillzone({
            name: mappedNext,
            label: String(mappedNext).replace('_', ' '),
            startsIn: (Number(session.next_session_in) || 0) * 60, // API sends minutes
          });
        }
        // Skip legacy code below
        if (false) {
          setCurrentKillzone({ name: 'NONE', label: '', start: '', end: '', active: false, progress: 0, remainingSeconds: 0, model: 'NONE', characteristics: [] } as any);
        }
      } catch (e) { console.warn('[Dashboard] Session update failed:', e); }

      // Confluence - transform API shape to store shape
      try {
        const conf = data.confluence;
        if (conf && updateConfluence) {
          const cats = conf.categories || {};
          const categoriesArray = [
            { name: 'Structure & Bias', score: cats.A_STRUCTURE_BIAS || 0, maxScore: 25, weight: 0.25, details: [] },
            { name: 'POI Quality', score: cats.B_POI_QUALITY || 0, maxScore: 25, weight: 0.25, details: [] },
            { name: 'Entry Confirmation', score: cats.C_ENTRY_CONFIRMATION || 0, maxScore: 20, weight: 0.20, details: [] },
            { name: 'Timing & Session', score: cats.D_TIMING_SESSION || 0, maxScore: 15, weight: 0.15, details: [] },
            { name: 'Risk Factors', score: cats.E_RISK_FACTORS || 0, maxScore: 15, weight: 0.15, details: [] },
          ];
          updateConfluence({
            score: conf.total_score || 0,
            grade: conf.grade || 'F',
            recommendation: conf.recommendation || 'Analyse en cours...',
            categories: categoriesArray,
          });
        }
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

      {/* ⭐ TRADING COACH - DIT QUOI FAIRE MAINTENANT ⭐ */}
      <motion.div variants={itemVariants}>
        <TradingCoach />
      </motion.div>

      {/* Details techniques (pour aller plus loin) */}
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
