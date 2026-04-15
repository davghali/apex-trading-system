import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, Target, Percent, Trophy, Minus } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import { formatCurrency, formatRR } from '@/lib/formatters';

interface StatItemProps {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  color?: string;
  isPositive?: boolean;
}

function StatItem({ label, value, icon: Icon, color, isPositive }: StatItemProps) {
  const textColor = color || (isPositive === undefined ? 'text-ict-text' :
    isPositive ? 'text-ict-bullish' : 'text-ict-bearish');

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02]">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        isPositive === undefined ? 'bg-ict-accent/10' :
        isPositive ? 'bg-ict-bullish/10' : 'bg-ict-bearish/10'
      }`}>
        <Icon size={14} className={
          isPositive === undefined ? 'text-ict-accent' :
          isPositive ? 'text-ict-bullish' : 'text-ict-bearish'
        } />
      </div>
      <div>
        <span className="text-[10px] text-ict-muted block">{label}</span>
        <span className={`text-sm font-mono font-semibold ${textColor}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

// Simple sparkline SVG
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;

  const height = 20;
  const width = 48;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  const color = positive ? '#00C853' : '#FF1744';

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function QuickStats() {
  try {
    const dailyPnl = useStore((s) => s.dailyPnl);
    const weeklyPnl = useStore((s) => s.weeklyPnl);
    const monthlyPnl = useStore((s) => s.monthlyPnl);
    const todayTrades = useStore((s) => s.todayTrades);
    const stats = useStore((s) => s.stats);
    const tradingRules = useStore((s) => s.tradingRules);

    const safeDailyPnl = typeof dailyPnl === 'number' && !isNaN(dailyPnl) ? dailyPnl : 0;
    const safeWeeklyPnl = typeof weeklyPnl === 'number' && !isNaN(weeklyPnl) ? weeklyPnl : 0;
    const safeMonthlyPnl = typeof monthlyPnl === 'number' && !isNaN(monthlyPnl) ? monthlyPnl : 0;
    const safeTodayTrades = typeof todayTrades === 'number' ? todayTrades : 0;
    const maxTrades = typeof tradingRules?.maxDailyTrades === 'number' ? tradingRules.maxDailyTrades : 3;
    const tradesRemaining = Math.max(0, maxTrades - safeTodayTrades);

    // Mini sparkline data (simulated daily PnL history)
    const sparkData = [0, safeDailyPnl * 0.2, safeDailyPnl * 0.5, safeDailyPnl * 0.3, safeDailyPnl * 0.8, safeDailyPnl];

    const safeWinRate = typeof stats?.winRate === 'number' && !isNaN(stats.winRate) ? stats.winRate : 0;
    const safeAvgRR = typeof stats?.avgRR === 'number' && !isNaN(stats.avgRR) ? stats.avgRR : 0;
    const safePF = typeof stats?.profitFactor === 'number' && !isNaN(stats.profitFactor) ? stats.profitFactor : 0;

    return (
      <Card title="Quick Stats">
        <div className="space-y-4">
          {/* Today section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-ict-muted uppercase tracking-wider">
                Today
              </span>
              {/* Trades remaining indicator */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-ict-muted">Trades left:</span>
                <Badge
                  variant={tradesRemaining > 0 ? 'accent' : 'bearish'}
                  size="xs"
                >
                  {tradesRemaining}/{maxTrades}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02]">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  safeDailyPnl >= 0 ? 'bg-ict-bullish/10' : 'bg-ict-bearish/10'
                }`}>
                  {safeDailyPnl >= 0 ? (
                    <TrendingUp size={14} className="text-ict-bullish" />
                  ) : (
                    <TrendingDown size={14} className="text-ict-bearish" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-ict-muted block">Daily P&L</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-mono font-semibold ${
                      safeDailyPnl >= 0 ? 'text-ict-bullish' : 'text-ict-bearish'
                    }`}>
                      {formatCurrency(safeDailyPnl)}
                    </span>
                    <Sparkline data={sparkData} positive={safeDailyPnl >= 0} />
                  </div>
                </div>
              </div>
              <StatItem
                label="Trades"
                value={`${safeTodayTrades}`}
                icon={BarChart3}
              />
            </div>
          </div>

          {/* Summary section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold text-ict-muted uppercase tracking-wider">
                Summary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatItem
                label="Week P&L"
                value={formatCurrency(safeWeeklyPnl)}
                icon={safeWeeklyPnl >= 0 ? TrendingUp : TrendingDown}
                isPositive={safeWeeklyPnl >= 0}
              />
              <StatItem
                label="Month P&L"
                value={formatCurrency(safeMonthlyPnl)}
                icon={safeMonthlyPnl >= 0 ? TrendingUp : TrendingDown}
                isPositive={safeMonthlyPnl >= 0}
              />
            </div>
          </div>

          {/* Performance metrics */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold text-ict-muted uppercase tracking-wider">
                Performance
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center p-2 rounded-lg bg-white/[0.02]"
              >
                <Percent size={12} className="text-ict-accent mx-auto mb-1" />
                <span className="text-[9px] text-ict-muted block">Win Rate</span>
                <span className={`text-xs font-mono font-bold ${
                  safeWinRate > 50 ? 'text-ict-bullish' : safeWinRate > 0 ? 'text-ict-bearish' : 'text-ict-text'
                }`}>
                  {safeWinRate > 0 ? `${safeWinRate.toFixed(0)}%` : '--'}
                </span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-center p-2 rounded-lg bg-white/[0.02]"
              >
                <Target size={12} className="text-ict-accent mx-auto mb-1" />
                <span className="text-[9px] text-ict-muted block">Avg RR</span>
                <span className={`text-xs font-mono font-bold ${
                  safeAvgRR >= 2 ? 'text-ict-bullish' : safeAvgRR > 0 ? 'text-ict-neutral' : 'text-ict-text'
                }`}>
                  {safeAvgRR > 0 ? formatRR(safeAvgRR) : '--'}
                </span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center p-2 rounded-lg bg-white/[0.02]"
              >
                <Trophy size={12} className="text-ict-accent mx-auto mb-1" />
                <span className="text-[9px] text-ict-muted block">PF</span>
                <span className={`text-xs font-mono font-bold ${
                  safePF >= 1.5 ? 'text-ict-bullish' : safePF > 0 ? 'text-ict-neutral' : 'text-ict-text'
                }`}>
                  {safePF > 0 ? safePF.toFixed(2) : '--'}
                </span>
              </motion.div>
            </div>
          </div>
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Quick Stats">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load stats</span>
        </div>
      </Card>
    );
  }
}
