import { motion } from 'framer-motion';
import { DollarSign, GitBranch, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import StatusDot from '@/components/common/StatusDot';
import { useStore } from '@/store';

export default function DXYWidget() {
  try {
    const dxyPrice = useStore((s) => s.dxyPrice);
    const dxyTrend = useStore((s) => s.dxyTrend);
    const correlation = useStore((s) => s.correlation);
    const correlationScore = useStore((s) => s.correlationScore);
    const smtDivergence = useStore((s) => s.smtDivergence);

    const safePrice = typeof dxyPrice === 'number' && !isNaN(dxyPrice) ? dxyPrice : 0;
    const safeTrend = dxyTrend || 'RANGING';
    const safeCorrelation = correlation || 'NEUTRAL';
    const safeScore = typeof correlationScore === 'number' && !isNaN(correlationScore) ? correlationScore : 0;

    const correlationVariant = safeCorrelation === 'CONFIRMING' ? 'bullish' :
      safeCorrelation === 'DIVERGING' ? 'bearish' : 'neutral';

    const trendIcon = safeTrend === 'BULLISH'
      ? <ArrowUpRight size={14} className="text-ict-bullish" />
      : safeTrend === 'BEARISH'
      ? <ArrowDownRight size={14} className="text-ict-bearish" />
      : null;

    return (
      <Card
        title="DXY Correlation"
        accent={safeCorrelation === 'CONFIRMING' ? 'bullish' : safeCorrelation === 'DIVERGING' ? 'bearish' : 'neutral'}
        headerRight={
          <Badge variant={correlationVariant} size="xs" dot>
            {safeCorrelation}
          </Badge>
        }
      >
        <div className="space-y-3">
          {/* DXY Price & Trend */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-ict-accent/10 flex items-center justify-center">
                <DollarSign size={14} className="text-ict-accent" />
              </div>
              <div>
                <span className="text-sm font-mono font-bold text-ict-text">
                  {safePrice > 0 ? safePrice.toFixed(3) : '---'}
                </span>
                <div className="flex items-center gap-1">
                  {trendIcon}
                  <span className={`text-[10px] ${
                    safeTrend === 'BULLISH' ? 'text-ict-bullish' :
                    safeTrend === 'BEARISH' ? 'text-ict-bearish' :
                    'text-ict-muted'
                  }`}>
                    {safeTrend}
                  </span>
                </div>
              </div>
            </div>

            {/* Big colored correlation badge */}
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className={`px-3 py-1.5 rounded-lg ${
                  safeCorrelation === 'CONFIRMING'
                    ? 'bg-ict-bullish/15 border border-ict-bullish/30'
                    : safeCorrelation === 'DIVERGING'
                    ? 'bg-ict-bearish/15 border border-ict-bearish/30'
                    : 'bg-ict-muted/10 border border-ict-muted/20'
                }`}
              >
                <span className={`text-xs font-bold ${
                  safeCorrelation === 'CONFIRMING' ? 'text-ict-bullish' :
                  safeCorrelation === 'DIVERGING' ? 'text-ict-bearish' :
                  'text-ict-muted'
                }`}>
                  {safeCorrelation === 'CONFIRMING' ? 'CONFIRMS' :
                   safeCorrelation === 'DIVERGING' ? 'DIVERGES' : 'NEUTRAL'}
                </span>
              </motion.div>
            </div>
          </div>

          {/* Correlation strength bar */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-ict-muted">Correlation Strength</span>
              <span className={`text-[10px] font-mono font-bold ${
                safeScore > 70 ? 'text-ict-bullish' :
                safeScore > 40 ? 'text-ict-neutral' :
                'text-ict-bearish'
              }`}>
                {safeScore}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-ict-border/30 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  safeCorrelation === 'CONFIRMING' ? 'bg-gradient-to-r from-ict-bullish to-green-300' :
                  safeCorrelation === 'DIVERGING' ? 'bg-gradient-to-r from-ict-bearish to-red-300' :
                  'bg-gradient-to-r from-ict-neutral to-yellow-300'
                }`}
                animate={{ width: `${safeScore}%` }}
                transition={{ duration: 0.8 }}
                style={{
                  boxShadow: safeScore > 70
                    ? '0 0 8px rgba(0,200,83,0.3)'
                    : safeScore > 40
                    ? '0 0 8px rgba(255,214,0,0.3)'
                    : 'none',
                }}
              />
            </div>
          </div>

          {/* SMT Divergence */}
          {smtDivergence && smtDivergence.detected && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-2 rounded-lg bg-ict-bearish/5 border border-ict-bearish/15"
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={12} className="text-ict-bearish" />
                <span className="text-xs font-semibold text-ict-bearish">
                  SMT Divergence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <GitBranch size={10} className="text-ict-muted" />
                <span className="text-[10px] text-ict-muted">
                  {smtDivergence.pair1 || '--'} vs {smtDivergence.pair2 || '--'}
                </span>
                <Badge
                  variant={smtDivergence.direction === 'BULLISH' ? 'bullish' : 'bearish'}
                  size="xs"
                >
                  {smtDivergence.direction || '--'}
                </Badge>
              </div>
              {smtDivergence.description && (
                <p className="text-[10px] text-ict-muted mt-1">{smtDivergence.description}</p>
              )}
            </motion.div>
          )}

          {(!smtDivergence || !smtDivergence.detected) && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.02]">
              <StatusDot status="idle" size="sm" />
              <span className="text-[10px] text-ict-muted">No SMT divergence detected</span>
            </div>
          )}
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="DXY Correlation" accent="neutral">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load DXY data</span>
        </div>
      </Card>
    );
  }
}
