import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  Target,
  Crosshair,
  Gauge,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import ProgressBar from '@/components/common/ProgressBar';
import { useStore } from '@/store';
import { useAnalysis } from '@/hooks/useAnalysis';
import { formatPrice, formatRR, timeAgo } from '@/lib/formatters';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// Skeleton loader for panels
function SkeletonPanel() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-ict-border/20 rounded w-3/4" />
      <div className="h-3 bg-ict-border/15 rounded w-1/2" />
      <div className="h-8 bg-ict-border/10 rounded w-full" />
      <div className="h-3 bg-ict-border/15 rounded w-2/3" />
      <div className="h-3 bg-ict-border/10 rounded w-1/3" />
      <div className="h-6 bg-ict-border/10 rounded w-full" />
    </div>
  );
}

export default function AnalysisPage() {
  try {
    const { loading, error, fetchAnalysis, requestFullScan, refresh } = useAnalysis();
    const [refreshingPanel, setRefreshingPanel] = useState<string | null>(null);

    const weeklyBias = useStore((s) => s.weeklyBias);
    const dailyBias = useStore((s) => s.dailyBias);
    const po3 = useStore((s) => s.po3);
    const structures = useStore((s) => s.structures);
    const alignment = useStore((s) => s.alignment);
    const pois = useStore((s) => s.pois);
    const currentKillzone = useStore((s) => s.currentKillzone);
    const score = useStore((s) => s.score);
    const grade = useStore((s) => s.grade);
    const categories = useStore((s) => s.categories);
    const currentSignal = useStore((s) => s.currentSignal);
    const instrument = useStore((s) => s.instrument);

    const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0;
    const safeGrade = grade || 'F';
    const safePois = Array.isArray(pois) ? pois : [];
    const safeCats = Array.isArray(categories) ? categories : [];
    const activePois = safePois.filter((p) => !p.mitigated);
    const timeframes = ['D1', 'H4', 'H1'];

    const handlePanelRefresh = async (panel: string) => {
      setRefreshingPanel(panel);
      await fetchAnalysis(true);
      setRefreshingPanel(null);
    };

    const PanelRefreshButton = ({ panel }: { panel: string }) => (
      <button
        onClick={() => handlePanelRefresh(panel)}
        disabled={loading || refreshingPanel === panel}
        className="p-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw size={12} className={`text-ict-muted ${refreshingPanel === panel ? 'animate-spin' : ''}`} />
      </button>
    );

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-ict-text">Full Analysis</h1>
            <p className="text-xs text-ict-muted mt-0.5">
              Complete multi-module ICT analysis for {instrument}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAnalysis(true)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ict-card border border-ict-border/30 text-xs text-ict-text hover:border-ict-accent/30 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            <button
              onClick={requestFullScan}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ict-accent/10 border border-ict-accent/30 text-xs text-ict-accent hover:bg-ict-accent/20 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
              Run Full Scan
            </button>
          </div>
        </motion.div>

        {error && (
          <motion.div variants={itemVariants} className="px-4 py-3 rounded-lg bg-ict-bearish/10 border border-ict-bearish/20">
            <span className="text-xs text-ict-bearish">{error}</span>
          </motion.div>
        )}

        {/* 2x2 Grid Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* PANEL 1: Market Structure */}
          <motion.div variants={itemVariants}>
            <Card
              title="Market Structure"
              accent={alignment?.aligned ? 'bullish' : 'neutral'}
              headerRight={<PanelRefreshButton panel="structure" />}
            >
              {loading && !structures ? (
                <SkeletonPanel />
              ) : (
                <div className="space-y-3">
                  {/* BOS/CHoCH Timeline per TF */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-ict-accent" />
                      <span className="text-xs font-semibold text-ict-text">Multi-TF Structure</span>
                    </div>
                    <Badge
                      variant={alignment?.aligned ? 'bullish' : 'neutral'}
                      size="xs"
                      dot
                      pulse={alignment?.aligned}
                    >
                      {alignment?.direction || 'RANGING'} ({alignment?.score || 0}%)
                    </Badge>
                  </div>

                  {/* Trend direction arrows and breaks per TF */}
                  {timeframes.map((tf) => {
                    const s = structures?.[tf];
                    if (!s) return null;
                    const trend = s.trend || 'RANGING';

                    return (
                      <div key={tf} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-ict-border/10">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold text-ict-text w-6">{tf}</span>
                          {/* Trend direction arrow */}
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                            trend === 'BULLISH' ? 'bg-ict-bullish/15' :
                            trend === 'BEARISH' ? 'bg-ict-bearish/15' :
                            'bg-ict-neutral/15'
                          }`}>
                            {trend === 'BULLISH' ? <ArrowUpRight size={14} className="text-ict-bullish" /> :
                             trend === 'BEARISH' ? <ArrowDownRight size={14} className="text-ict-bearish" /> :
                             <ArrowRight size={14} className="text-ict-neutral" />}
                          </div>
                          <span className={`text-xs font-medium ${
                            trend === 'BULLISH' ? 'text-ict-bullish' :
                            trend === 'BEARISH' ? 'text-ict-bearish' :
                            'text-ict-neutral'
                          }`}>
                            {trend}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Last BOS/CHoCH */}
                          {s.lastBreak !== 'NONE' && (
                            <Badge variant={s.lastBreak === 'BOS' ? 'bullish' : 'bearish'} size="xs">
                              {s.lastBreak}
                            </Badge>
                          )}
                          {s.lastBreakPrice > 0 && (
                            <span className="text-[10px] font-mono text-ict-muted">
                              @{formatPrice(s.lastBreakPrice, instrument)}
                            </span>
                          )}
                          {s.lastBreakTime && (
                            <span className="text-[9px] text-ict-muted/60">
                              {timeAgo(s.lastBreakTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Swing Points */}
                  <div className="border-t border-ict-border/20 pt-2">
                    <span className="text-[10px] text-ict-muted uppercase mb-2 block">Swing Points</span>
                    <div className="grid grid-cols-3 gap-2">
                      {timeframes.map((tf) => {
                        const s = structures?.[tf];
                        if (!s) return null;
                        return (
                          <div key={tf} className="text-center p-1.5 rounded-md bg-white/[0.02]">
                            <span className="text-[9px] font-mono text-ict-muted block">{tf}</span>
                            <div className="flex justify-between mt-1 px-1">
                              <div>
                                <span className="text-[8px] text-ict-bullish block">H</span>
                                <span className="text-[10px] font-mono text-ict-text">
                                  {s.swingHigh > 0 ? formatPrice(s.swingHigh, instrument) : '--'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[8px] text-ict-bearish block">L</span>
                                <span className="text-[10px] font-mono text-ict-text">
                                  {s.swingLow > 0 ? formatPrice(s.swingLow, instrument) : '--'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>

          {/* PANEL 2: Bias Details */}
          <motion.div variants={itemVariants}>
            <Card
              title="Bias Details"
              accent="cyan"
              headerRight={<PanelRefreshButton panel="bias" />}
            >
              {loading && !weeklyBias?.direction ? (
                <SkeletonPanel />
              ) : (
                <div className="space-y-4">
                  {/* Weekly and Daily bias with factor scores */}
                  {[
                    { label: 'Weekly', bias: weeklyBias },
                    { label: 'Daily', bias: dailyBias },
                  ].map(({ label, bias }) => {
                    const dir = bias?.direction || 'NEUTRAL';
                    const sc = typeof bias?.score === 'number' ? bias.score : 0;
                    const factors = Array.isArray(bias?.factors) ? bias.factors : [];
                    const conviction = bias?.conviction || 'LOW';

                    return (
                      <div key={label} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {dir === 'BULLISH' ? <TrendingUp size={14} className="text-ict-bullish" /> :
                             dir === 'BEARISH' ? <TrendingDown size={14} className="text-ict-bearish" /> :
                             <Minus size={14} className="text-ict-neutral" />}
                            <span className="text-xs font-semibold text-ict-text">{label} Bias</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={dir === 'BULLISH' ? 'bullish' : dir === 'BEARISH' ? 'bearish' : 'neutral'}
                              size="xs"
                              dot
                            >
                              {dir} ({sc}%)
                            </Badge>
                            <Badge variant="muted" size="xs">{conviction}</Badge>
                          </div>
                        </div>
                        <ProgressBar
                          value={sc}
                          color={dir === 'BULLISH' ? 'bullish' : dir === 'BEARISH' ? 'bearish' : 'neutral'}
                          height="sm"
                          animated
                        />
                        {/* Factor breakdown with individual scores */}
                        <div className="grid grid-cols-2 gap-1">
                          {factors.slice(0, 6).map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white/[0.02]">
                              <div className={`w-1 h-1 rounded-full ${
                                dir === 'BULLISH' ? 'bg-ict-bullish/60' :
                                dir === 'BEARISH' ? 'bg-ict-bearish/60' :
                                'bg-ict-neutral/60'
                              }`} />
                              <span className="text-[10px] text-ict-muted truncate">{f}</span>
                            </div>
                          ))}
                        </div>

                        {/* MO/DO levels */}
                        {(bias?.moLevel || bias?.doLevel) && (
                          <div className="flex gap-2">
                            {bias.moLevel && (
                              <div className="flex-1 px-2 py-1 rounded-md bg-ict-accent/5 border border-ict-accent/10">
                                <span className="text-[8px] text-ict-muted block">MO</span>
                                <span className="text-[11px] font-mono text-ict-accent">
                                  {typeof bias.moLevel.price === 'number' ? formatPrice(bias.moLevel.price, instrument) : '--'}
                                </span>
                              </div>
                            )}
                            {bias.doLevel && (
                              <div className="flex-1 px-2 py-1 rounded-md bg-ict-accent/5 border border-ict-accent/10">
                                <span className="text-[8px] text-ict-muted block">DO</span>
                                <span className="text-[11px] font-mono text-ict-accent">
                                  {typeof bias.doLevel.price === 'number' ? formatPrice(bias.doLevel.price, instrument) : '--'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* PO3 Visualization */}
                  <div className="border-t border-ict-border/20 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-ict-muted uppercase">Power of 3</span>
                      <Badge
                        variant={
                          po3?.current === 'DISTRIBUTION' ? 'bullish' :
                          po3?.current === 'MANIPULATION' ? 'bearish' :
                          po3?.current === 'ACCUMULATION' ? 'accent' : 'muted'
                        }
                        size="xs"
                      >
                        {po3?.current || 'NONE'}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      {(['ACCUMULATION', 'MANIPULATION', 'DISTRIBUTION'] as const).map((phase) => {
                        const isActive = po3?.current === phase;
                        return (
                          <motion.div
                            key={phase}
                            className={`flex-1 py-1.5 rounded text-center transition-all ${
                              isActive
                                ? phase === 'ACCUMULATION' ? 'bg-ict-accent/20 border border-ict-accent/30' :
                                  phase === 'MANIPULATION' ? 'bg-ict-bearish/20 border border-ict-bearish/30' :
                                  'bg-ict-bullish/20 border border-ict-bullish/30'
                                : 'bg-white/[0.02] border border-transparent'
                            }`}
                            animate={{ scale: isActive ? 1.02 : 1 }}
                          >
                            <span className={`text-[8px] font-semibold uppercase ${
                              isActive
                                ? phase === 'ACCUMULATION' ? 'text-ict-accent' :
                                  phase === 'MANIPULATION' ? 'text-ict-bearish' :
                                  'text-ict-bullish'
                                : 'text-ict-muted/40'
                            }`}>
                              {phase.slice(0, 5)}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>

          {/* PANEL 3: POI Detection */}
          <motion.div variants={itemVariants}>
            <Card
              title="POI Detection"
              accent="cyan"
              headerRight={
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-ict-muted">{activePois.length} active</span>
                  <PanelRefreshButton panel="pois" />
                </div>
              }
            >
              {loading && safePois.length === 0 ? (
                <SkeletonPanel />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                  {activePois.length > 0 ? activePois.slice(0, 10).map((poi) => {
                    const safeStrength = typeof poi.strength === 'number' ? poi.strength : 0;
                    const safeDistance = typeof poi.distance === 'number' ? poi.distance : null;

                    return (
                      <motion.div
                        key={poi.id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-ict-border/10"
                      >
                        <div className="flex items-center gap-2">
                          {/* Type badge */}
                          <Badge
                            variant={poi.type === 'OB' ? 'accent' : poi.type === 'FVG' ? 'info' : 'neutral'}
                            size="xs"
                          >
                            {poi.type || '--'}
                          </Badge>
                          {/* TF badge */}
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-ict-border/20 text-ict-muted">
                            {poi.timeframe || '--'}
                          </span>
                          {/* Price range */}
                          <span className="text-xs font-mono text-ict-text">
                            {formatPrice(poi.priceHigh, instrument)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Distance in pips */}
                          {safeDistance !== null && (
                            <span className="text-[10px] font-mono text-ict-muted">
                              {safeDistance.toFixed(1)}p
                            </span>
                          )}
                          {/* Quality score bar */}
                          <div className="w-12">
                            <ProgressBar
                              value={safeStrength}
                              max={100}
                              color={safeStrength > 70 ? 'bullish' : safeStrength > 40 ? 'neutral' : 'bearish'}
                              height="sm"
                            />
                          </div>
                          <span className="text-[10px] font-mono text-ict-muted w-6 text-right">
                            {safeStrength}%
                          </span>
                        </div>
                      </motion.div>
                    );
                  }) : (
                    <div className="text-center py-8">
                      <Target size={20} className="text-ict-muted/30 mx-auto mb-2" />
                      <span className="text-xs text-ict-muted">No active POIs detected</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </motion.div>

          {/* PANEL 4: Entry Analysis */}
          <motion.div variants={itemVariants}>
            <Card
              title="Entry Analysis"
              accent={currentSignal?.status === 'ACTIVE' ? 'bullish' : 'neutral'}
              headerRight={<PanelRefreshButton panel="entry" />}
            >
              {loading && !currentSignal ? (
                <SkeletonPanel />
              ) : currentSignal && currentSignal.status === 'ACTIVE' ? (
                <div className="space-y-3">
                  {/* Signal header */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-ict-accent/5 border border-ict-accent/15">
                    <div className="flex items-center gap-2">
                      <Crosshair size={16} className="text-ict-accent" />
                      <span className="text-sm font-bold text-ict-accent">SIGNAL ACTIVE</span>
                    </div>
                    <Badge
                      variant={currentSignal.direction === 'LONG' ? 'bullish' : 'bearish'}
                      size="sm"
                      dot
                      pulse
                    >
                      {currentSignal.direction} | {currentSignal.model || 'N/A'}
                    </Badge>
                  </div>

                  {/* Entry details grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Entry', value: formatPrice(currentSignal.entryPrice, instrument), accent: true },
                      { label: 'Stop Loss', value: formatPrice(currentSignal.stopLoss, instrument), color: 'text-ict-bearish' },
                      { label: 'TP1', value: formatPrice(currentSignal.takeProfit1, instrument), color: 'text-ict-bullish' },
                      { label: 'Risk:Reward', value: formatRR(currentSignal.riskReward), accent: true },
                    ].map(({ label, value, accent, color }) => (
                      <div key={label} className={`p-2 rounded-lg ${accent ? 'bg-ict-accent/5 border border-ict-accent/10' : 'bg-white/[0.02]'}`}>
                        <span className="text-[9px] text-ict-muted uppercase block">{label}</span>
                        <span className={`text-sm font-mono font-bold ${color || (accent ? 'text-ict-accent' : 'text-ict-text')}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Confidence */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-ict-muted">Signal Confidence</span>
                      <span className="text-[10px] font-mono text-ict-text">
                        {typeof currentSignal.confidence === 'number' ? `${currentSignal.confidence}%` : '--'}
                      </span>
                    </div>
                    <ProgressBar
                      value={currentSignal.confidence || 0}
                      color={currentSignal.confidence >= 70 ? 'bullish' : 'neutral'}
                      height="sm"
                      animated
                    />
                  </div>

                  {/* Conditions checklist */}
                  {Array.isArray(currentSignal.reasons) && currentSignal.reasons.length > 0 && (
                    <div className="border-t border-ict-border/20 pt-2">
                      <span className="text-[10px] text-ict-muted uppercase mb-2 block">Conditions Met</span>
                      <div className="space-y-1">
                        {currentSignal.reasons.map((reason, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <CheckCircle2 size={12} className="text-ict-bullish flex-shrink-0" />
                            <span className="text-[11px] text-ict-muted">{reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* No active signal */}
                  <div className="text-center py-6">
                    <Crosshair size={24} className="text-ict-muted/20 mx-auto mb-2" />
                    <span className="text-sm text-ict-muted">No Active Signal</span>
                    <p className="text-[10px] text-ict-muted/60 mt-1">
                      Run a full scan to detect entry opportunities
                    </p>
                  </div>

                  {/* Confluence summary */}
                  <div className="border-t border-ict-border/20 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-ict-muted">Confluence Score</span>
                      <span className="text-lg font-mono font-bold text-ict-text">
                        {safeScore}/100 ({safeGrade})
                      </span>
                    </div>
                    {safeCats.map((cat, i) => {
                      const catScore = typeof cat.score === 'number' ? cat.score : 0;
                      const catMax = typeof cat.maxScore === 'number' && cat.maxScore > 0 ? cat.maxScore : 1;
                      return (
                        <div key={i} className="mb-2">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[10px] text-ict-muted">{cat.name || 'Unknown'}</span>
                            <span className="text-[10px] font-mono text-ict-text">{catScore}/{catMax}</span>
                          </div>
                          <ProgressBar
                            value={catScore}
                            max={catMax}
                            color={catScore / catMax >= 0.6 ? 'bullish' : 'neutral'}
                            height="sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </motion.div>
    );
  } catch {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={24} className="text-ict-bearish mx-auto mb-2" />
        <span className="text-sm text-ict-muted">Analysis page encountered an error. Please refresh.</span>
      </div>
    );
  }
}
