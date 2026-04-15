import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import type { BiasDirection, BiasData } from '@/store/slices/biasSlice';

function BiasIcon({ direction, size = 16 }: { direction: BiasDirection; size?: number }) {
  if (direction === 'BULLISH') return <TrendingUp size={size} className="text-ict-bullish" />;
  if (direction === 'BEARISH') return <TrendingDown size={size} className="text-ict-bearish" />;
  return <Minus size={size} className="text-ict-neutral" />;
}

function BiasSection({
  label,
  bias,
}: {
  label: string;
  bias: BiasData;
}) {
  const variant = bias.direction === 'BULLISH' ? 'bullish' : bias.direction === 'BEARISH' ? 'bearish' : 'neutral';
  const safeScore = typeof bias.score === 'number' && !isNaN(bias.score) ? bias.score : 0;
  const safeFactors = Array.isArray(bias.factors) ? bias.factors : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ict-muted uppercase tracking-wider">{label}</span>
        <Badge variant={variant} size="xs" dot>
          {bias.conviction || 'N/A'}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <BiasIcon direction={bias.direction} size={20} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold ${
              bias.direction === 'BULLISH' ? 'text-ict-bullish' :
              bias.direction === 'BEARISH' ? 'text-ict-bearish' :
              'text-ict-neutral'
            }`}>
              {bias.direction || 'N/A'}
            </span>
            <span className="text-xs font-mono text-ict-muted">{safeScore}%</span>
          </div>

          {/* Animated score bar */}
          <div className="mt-1 h-1.5 rounded-full bg-ict-border/30 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                bias.direction === 'BULLISH' ? 'bg-gradient-to-r from-ict-bullish to-green-300' :
                bias.direction === 'BEARISH' ? 'bg-gradient-to-r from-ict-bearish to-red-300' :
                'bg-gradient-to-r from-ict-neutral to-yellow-300'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${safeScore}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                boxShadow: bias.direction === 'BULLISH'
                  ? '0 0 8px rgba(0,200,83,0.3)'
                  : bias.direction === 'BEARISH'
                  ? '0 0 8px rgba(255,23,68,0.3)'
                  : '0 0 8px rgba(255,214,0,0.3)',
              }}
            />
          </div>
        </div>
      </div>

      {/* MO/DO Levels */}
      {(bias.moLevel || bias.doLevel) && (
        <div className="flex gap-2 mt-1">
          {bias.moLevel && (
            <div className="flex-1 px-2 py-1.5 rounded-md bg-ict-accent/5 border border-ict-accent/10">
              <span className="text-[9px] text-ict-muted block">MO Level</span>
              <span className="text-xs font-mono text-ict-accent font-semibold">
                {typeof bias.moLevel.price === 'number' ? bias.moLevel.price.toFixed(5) : '--'}
              </span>
            </div>
          )}
          {bias.doLevel && (
            <div className="flex-1 px-2 py-1.5 rounded-md bg-ict-accent/5 border border-ict-accent/10">
              <span className="text-[9px] text-ict-muted block">DO Level</span>
              <span className="text-xs font-mono text-ict-accent font-semibold">
                {typeof bias.doLevel.price === 'number' ? bias.doLevel.price.toFixed(5) : '--'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Scrollable factors list */}
      {safeFactors.length > 0 && (
        <div className="space-y-1 mt-1 max-h-[72px] overflow-y-auto no-scrollbar">
          {safeFactors.map((factor, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-1.5"
            >
              <div className={`w-1 h-1 rounded-full flex-shrink-0 ${
                bias.direction === 'BULLISH' ? 'bg-ict-bullish/60' :
                bias.direction === 'BEARISH' ? 'bg-ict-bearish/60' :
                'bg-ict-neutral/60'
              }`} />
              <span className="text-[11px] text-ict-muted truncate">{factor}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BiasWidget() {
  try {
    const weeklyBias = useStore((s) => s.weeklyBias);
    const dailyBias = useStore((s) => s.dailyBias);
    const po3 = useStore((s) => s.po3);

    const po3Phase = po3?.current || 'NONE';
    const po3Confidence = typeof po3?.confidence === 'number' ? po3.confidence : 0;

    const po3Variant = po3Phase === 'DISTRIBUTION' ? 'bullish' :
      po3Phase === 'MANIPULATION' ? 'bearish' :
      po3Phase === 'ACCUMULATION' ? 'accent' : 'muted';

    // PO3 visual blocks
    const po3Phases = ['ACCUMULATION', 'MANIPULATION', 'DISTRIBUTION'] as const;

    return (
      <Card title="Market Bias" accent="cyan">
        <div className="space-y-4">
          <BiasSection label="Weekly" bias={weeklyBias} />
          <div className="border-t border-ict-border/20" />
          <BiasSection label="Daily" bias={dailyBias} />

          {/* PO3 Phase with visual blocks */}
          <div className="border-t border-ict-border/20 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-ict-muted uppercase tracking-wider">Power of 3</span>
              <Badge variant={po3Variant} size="xs">
                {po3Phase}
              </Badge>
            </div>

            {/* Three colored phase blocks */}
            <div className="flex gap-1 mb-2">
              {po3Phases.map((phase) => {
                const isActive = po3Phase === phase;
                const colors = {
                  ACCUMULATION: { bg: 'bg-ict-accent', glow: 'shadow-[0_0_8px_rgba(0,188,212,0.5)]' },
                  MANIPULATION: { bg: 'bg-ict-bearish', glow: 'shadow-[0_0_8px_rgba(255,23,68,0.5)]' },
                  DISTRIBUTION: { bg: 'bg-ict-bullish', glow: 'shadow-[0_0_8px_rgba(0,200,83,0.5)]' },
                };
                const c = colors[phase];
                return (
                  <motion.div
                    key={phase}
                    className={`flex-1 h-2 rounded-full transition-all ${
                      isActive ? `${c.bg} ${c.glow}` : 'bg-ict-border/30'
                    }`}
                    animate={{ opacity: isActive ? 1 : 0.4 }}
                    transition={{ duration: 0.3 }}
                  />
                );
              })}
            </div>

            <div className="flex justify-between">
              {po3Phases.map((phase) => (
                <span
                  key={phase}
                  className={`text-[8px] uppercase ${
                    po3Phase === phase ? 'text-ict-text font-semibold' : 'text-ict-muted/50'
                  }`}
                >
                  {phase.slice(0, 5)}
                </span>
              ))}
            </div>

            {/* Confidence bar */}
            {po3Confidence > 0 && (
              <div className="mt-2 h-1 rounded-full bg-ict-border/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-ict-accent"
                  animate={{ width: `${po3Confidence}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Market Bias" accent="cyan">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load bias data</span>
        </div>
      </Card>
    );
  }
}
