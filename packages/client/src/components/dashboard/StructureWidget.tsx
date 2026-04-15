import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import { formatPrice } from '@/lib/formatters';
import { timeAgo } from '@/lib/formatters';
import type { TrendDirection, StructureBreak } from '@/store/slices/structureSlice';

function TrendIcon({ trend, size = 14 }: { trend: TrendDirection; size?: number }) {
  if (trend === 'BULLISH') return <ArrowUpRight size={size} className="text-ict-bullish" />;
  if (trend === 'BEARISH') return <ArrowDownRight size={size} className="text-ict-bearish" />;
  return <ArrowRight size={size} className="text-ict-neutral" />;
}

function getTrendColor(trend: TrendDirection): string {
  if (trend === 'BULLISH') return 'bg-ict-bullish';
  if (trend === 'BEARISH') return 'bg-ict-bearish';
  return 'bg-ict-neutral';
}

function getTrendGlow(trend: TrendDirection): string {
  if (trend === 'BULLISH') return '0 0 10px rgba(0,200,83,0.6)';
  if (trend === 'BEARISH') return '0 0 10px rgba(255,23,68,0.6)';
  return 'none';
}

function getBreakVariant(brk: StructureBreak): 'bullish' | 'bearish' | 'muted' {
  if (brk === 'BOS') return 'bullish';
  if (brk === 'CHoCH') return 'bearish';
  return 'muted';
}

export default function StructureWidget() {
  try {
    const structures = useStore((s) => s.structures);
    const alignment = useStore((s) => s.alignment);
    const instrument = useStore((s) => s.instrument);

    const timeframes = ['D1', 'H4', 'H1'];
    const safeAlignmentScore = typeof alignment?.score === 'number' ? alignment.score : 0;
    const isAligned = alignment?.aligned || false;

    // Find most recent break across all TFs
    const lastBreakTf = timeframes
      .map((tf) => ({ tf, s: structures[tf] }))
      .filter(({ s }) => s && s.lastBreak !== 'NONE' && s.lastBreakTime)
      .sort((a, b) => new Date(b.s.lastBreakTime).getTime() - new Date(a.s.lastBreakTime).getTime())[0];

    return (
      <Card
        title="Market Structure"
        accent={isAligned ? (alignment.direction === 'BULLISH' ? 'bullish' : 'bearish') : 'neutral'}
        headerRight={
          <Badge
            variant={isAligned ? 'bullish' : 'neutral'}
            size="xs"
            dot
            pulse={isAligned}
          >
            {isAligned ? 'ALIGNED' : 'MIXED'}
          </Badge>
        }
      >
        <div className="space-y-3">
          {/* TF alignment dots with trend arrows */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-ict-muted uppercase">Alignment</span>
            <div className="flex items-center gap-2">
              {timeframes.map((tf) => {
                const s = structures[tf];
                const trend = s?.trend || 'RANGING';
                return (
                  <motion.div
                    key={tf}
                    className="flex flex-col items-center gap-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: timeframes.indexOf(tf) * 0.1 }}
                  >
                    <div className="flex items-center gap-1">
                      <div
                        className={`w-3 h-3 rounded-full ${getTrendColor(trend)}`}
                        style={{ boxShadow: getTrendGlow(trend) }}
                      />
                      <TrendIcon trend={trend} size={12} />
                    </div>
                    <span className="text-[9px] font-mono text-ict-muted">{tf}</span>
                  </motion.div>
                );
              })}
            </div>
            {safeAlignmentScore > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <span className="text-xs font-mono font-bold text-ict-text">{safeAlignmentScore}%</span>
              </div>
            )}
          </div>

          {/* Alignment percentage bar */}
          <div className="h-1 rounded-full bg-ict-border/30 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                isAligned ? 'bg-gradient-to-r from-ict-bullish to-green-300' : 'bg-gradient-to-r from-ict-neutral to-yellow-300'
              }`}
              animate={{ width: `${safeAlignmentScore}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>

          {/* Timeframe details */}
          <div className="space-y-2">
            {timeframes.map((tf) => {
              const s = structures[tf];
              if (!s) return null;
              const trend = s.trend || 'RANGING';

              return (
                <motion.div
                  key={tf}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/[0.02]"
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-ict-text w-6">{tf}</span>
                    <TrendIcon trend={trend} />
                    <span className={`text-xs font-medium ${
                      trend === 'BULLISH' ? 'text-ict-bullish' :
                      trend === 'BEARISH' ? 'text-ict-bearish' :
                      'text-ict-neutral'
                    }`}>
                      {trend}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {s.lastBreak !== 'NONE' && (
                      <Badge variant={getBreakVariant(s.lastBreak)} size="xs">
                        {s.lastBreak}
                      </Badge>
                    )}
                    {s.lastBreakPrice > 0 && (
                      <span className="text-[10px] font-mono text-ict-muted">
                        @{formatPrice(s.lastBreakPrice, instrument)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Last BOS/CHoCH event with time */}
          {lastBreakTf && (
            <div className="border-t border-ict-border/20 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ict-muted">Last break:</span>
                  <Badge variant={getBreakVariant(lastBreakTf.s.lastBreak)} size="xs">
                    {lastBreakTf.s.lastBreak}
                  </Badge>
                  <span className="text-[10px] font-mono text-ict-muted">{lastBreakTf.tf}</span>
                </div>
                <span className="text-[10px] text-ict-muted">
                  {lastBreakTf.s.lastBreakTime ? timeAgo(lastBreakTf.s.lastBreakTime) : '--'}
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Market Structure" accent="neutral">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load structure data</span>
        </div>
      </Card>
    );
  }
}
