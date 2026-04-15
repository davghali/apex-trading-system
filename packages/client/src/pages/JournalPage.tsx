import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Award,
  AlertTriangle,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import { formatCurrency, formatRR, formatDate } from '@/lib/formatters';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// Simple SVG equity curve
function EquityCurve({ trades }: { trades: { pnl: number; closeTime?: string }[] }) {
  const closedTrades = trades.filter((t) => t.closeTime).sort((a, b) =>
    new Date(a.closeTime || 0).getTime() - new Date(b.closeTime || 0).getTime()
  );

  if (closedTrades.length < 2) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-ict-muted">Need at least 2 closed trades for equity curve</span>
      </div>
    );
  }

  const width = 400;
  const height = 120;
  const padding = { top: 10, bottom: 10, left: 5, right: 5 };

  // Build cumulative equity
  let cumulative = 0;
  const points = closedTrades.map((t, i) => {
    cumulative += t.pnl;
    return { x: i, y: cumulative };
  });

  const minY = Math.min(0, ...points.map((p) => p.y));
  const maxY = Math.max(0, ...points.map((p) => p.y));
  const rangeY = maxY - minY || 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const pathPoints = points.map((p, i) => {
    const x = padding.left + (i / (points.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((p.y - minY) / rangeY) * chartHeight;
    return `${x},${y}`;
  });

  const isPositive = cumulative >= 0;
  const color = isPositive ? '#00C853' : '#FF1744';

  // Area fill
  const firstX = padding.left;
  const lastX = padding.left + chartWidth;
  const baseY = padding.top + chartHeight - ((0 - minY) / rangeY) * chartHeight;
  const areaPath = `M${firstX},${baseY} L${pathPoints.join(' L')} L${lastX},${baseY} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* Zero line */}
      <line x1={padding.left} x2={lastX} y1={baseY} y2={baseY} stroke="#2A2A4A" strokeWidth="1" strokeDasharray="4 4" />

      {/* Area fill */}
      <path d={areaPath} fill={`${color}15`} />

      {/* Line */}
      <polyline
        points={pathPoints.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot */}
      {pathPoints.length > 0 && (
        <circle
          cx={parseFloat(pathPoints[pathPoints.length - 1].split(',')[0])}
          cy={parseFloat(pathPoints[pathPoints.length - 1].split(',')[1])}
          r="3"
          fill={color}
          stroke={`${color}40`}
          strokeWidth="4"
        />
      )}
    </svg>
  );
}

export default function JournalPage() {
  try {
    const trades = useStore((s) => s.trades);
    const stats = useStore((s) => s.stats);

    const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
    const [instrumentFilter, setInstrumentFilter] = useState('all');
    const [setupFilter, setSetupFilter] = useState('all');
    const [directionFilter, setDirectionFilter] = useState<'all' | 'LONG' | 'SHORT'>('all');

    const safeTrades = Array.isArray(trades) ? trades : [];

    const filteredTrades = useMemo(() => {
      return safeTrades.filter((t) => {
        if (t.status !== 'CLOSED') return false;
        if (filter === 'wins' && t.pnl < 0) return false;
        if (filter === 'losses' && t.pnl >= 0) return false;
        if (instrumentFilter !== 'all' && t.instrument !== instrumentFilter) return false;
        if (setupFilter !== 'all' && t.model !== setupFilter) return false;
        if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
        return true;
      });
    }, [safeTrades, filter, instrumentFilter, setupFilter, directionFilter]);

    const closedTrades = safeTrades.filter((t) => t.status === 'CLOSED');
    const wins = closedTrades.filter((t) => t.pnl >= 0).length;
    const losses = closedTrades.filter((t) => t.pnl < 0).length;

    // Get unique instruments and setups
    const instruments = [...new Set(closedTrades.map((t) => t.instrument).filter(Boolean))];
    const setups = [...new Set(closedTrades.map((t) => t.model).filter(Boolean))];

    // Stats
    const safeStats = stats || { totalTrades: 0, winRate: 0, avgRR: 0, profitFactor: 0, bestTrade: 0, worstTrade: 0, totalPnl: 0 };
    const totalPnl = closedTrades.reduce((sum, t) => sum + (typeof t.pnl === 'number' ? t.pnl : 0), 0);
    const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl || 0)) : 0;
    const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl || 0)) : 0;

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
            <h1 className="text-lg font-bold text-ict-text">Trade Journal</h1>
            <p className="text-xs text-ict-muted mt-0.5">Track, review, and analyze all your trades</p>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'wins', 'losses'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f
                    ? f === 'wins' ? 'bg-ict-bullish/10 border border-ict-bullish/30 text-ict-bullish' :
                      f === 'losses' ? 'bg-ict-bearish/10 border border-ict-bearish/30 text-ict-bearish' :
                      'bg-ict-accent/10 border border-ict-accent/30 text-ict-accent'
                    : 'bg-ict-card border border-ict-border/30 text-ict-muted hover:text-ict-text'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Stats overview */}
        <motion.div variants={itemVariants} className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Trades', value: `${closedTrades.length}`, icon: BarChart3, accent: true },
            { label: 'Win Rate', value: `${safeStats.winRate > 0 ? safeStats.winRate.toFixed(0) : (closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : '0')}%`, icon: Target, color: wins > losses ? 'text-ict-bullish' : 'text-ict-bearish' },
            { label: 'Wins / Losses', value: `${wins} / ${losses}`, icon: TrendingUp, color: 'text-ict-text' },
            { label: 'Avg RR', value: safeStats.avgRR > 0 ? formatRR(safeStats.avgRR) : '--', icon: Target, accent: true },
            { label: 'Best Trade', value: bestTrade > 0 ? formatCurrency(bestTrade) : '--', icon: Award, color: 'text-ict-bullish' },
            { label: 'Worst Trade', value: worstTrade < 0 ? formatCurrency(worstTrade) : '--', icon: TrendingDown, color: 'text-ict-bearish' },
          ].map(({ label, value, icon: Icon, accent, color }) => (
            <div key={label} className="p-3 rounded-xl bg-ict-card/80 border border-ict-border/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className={color || (accent ? 'text-ict-accent' : 'text-ict-muted')} />
                <span className="text-[9px] text-ict-muted uppercase">{label}</span>
              </div>
              <span className={`text-sm font-mono font-bold ${color || 'text-ict-text'}`}>{value}</span>
            </div>
          ))}
        </motion.div>

        {/* Equity Curve */}
        <motion.div variants={itemVariants}>
          <Card title="Equity Curve" headerRight={
            <span className={`text-xs font-mono font-bold ${totalPnl >= 0 ? 'text-ict-bullish' : 'text-ict-bearish'}`}>
              {formatCurrency(totalPnl)}
            </span>
          }>
            <div className="h-[130px]">
              <EquityCurve trades={closedTrades} />
            </div>
          </Card>
        </motion.div>

        {/* Filters row */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ict-muted">Instrument:</span>
            <select
              value={instrumentFilter}
              onChange={(e) => setInstrumentFilter(e.target.value)}
              className="px-2 py-1 rounded-lg bg-ict-card border border-ict-border/30 text-xs text-ict-text focus:outline-none focus:border-ict-accent/50"
            >
              <option value="all">All</option>
              {instruments.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ict-muted">Setup:</span>
            <select
              value={setupFilter}
              onChange={(e) => setSetupFilter(e.target.value)}
              className="px-2 py-1 rounded-lg bg-ict-card border border-ict-border/30 text-xs text-ict-text focus:outline-none focus:border-ict-accent/50"
            >
              <option value="all">All</option>
              {setups.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ict-muted">Direction:</span>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-ict-card border border-ict-border/30 text-xs text-ict-text focus:outline-none focus:border-ict-accent/50"
            >
              <option value="all">All</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
          </div>
          <span className="text-[10px] text-ict-muted ml-auto">{filteredTrades.length} trades</span>
        </motion.div>

        {/* Trades table */}
        <motion.div variants={itemVariants}>
          <Card title="Trade History" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ict-border/20">
                    {['Date', 'Instrument', 'Dir', 'Entry', 'Exit', 'Setup', 'P&L', 'RR', 'Score'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-ict-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.length > 0 ? filteredTrades.map((trade, i) => {
                    const safePnl = typeof trade.pnl === 'number' && !isNaN(trade.pnl) ? trade.pnl : 0;
                    const safeRR = typeof trade.rr === 'number' && !isNaN(trade.rr) ? trade.rr : 0;
                    const isWin = safePnl >= 0;

                    return (
                      <motion.tr
                        key={trade.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className={`
                          border-b border-ict-border/10
                          ${isWin ? 'hover:bg-ict-bullish/[0.03]' : 'hover:bg-ict-bearish/[0.03]'}
                          transition-colors
                        `}
                        style={{
                          borderLeft: `3px solid ${isWin ? '#00C853' : '#FF1744'}`,
                        }}
                      >
                        <td className="px-4 py-2.5 font-mono text-ict-muted">
                          {trade.openTime ? formatDate(trade.openTime) : '--'}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-ict-text">{trade.instrument || '--'}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={trade.direction === 'LONG' ? 'bullish' : 'bearish'} size="xs">
                            {trade.direction || '--'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-ict-text">
                          {typeof trade.entryPrice === 'number' ? trade.entryPrice.toFixed(5) : '--'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-ict-text">
                          {typeof trade.exitPrice === 'number' ? trade.exitPrice.toFixed(5) : '--'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="muted" size="xs">{trade.model || trade.setupType || '--'}</Badge>
                        </td>
                        <td className={`px-4 py-2.5 font-mono font-semibold ${isWin ? 'text-ict-bullish' : 'text-ict-bearish'}`}>
                          {formatCurrency(safePnl)}
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${safeRR >= 0 ? 'text-ict-bullish' : 'text-ict-bearish'}`}>
                          {formatRR(safeRR)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] font-mono text-ict-muted">
                            {typeof trade.score === 'number' ? `${trade.score}` : '--'}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
                        <BookOpen size={24} className="text-ict-muted/20 mx-auto mb-2" />
                        <span className="text-sm text-ict-muted">No trades recorded yet</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    );
  } catch {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={24} className="text-ict-bearish mx-auto mb-2" />
        <span className="text-sm text-ict-muted">Journal page encountered an error. Please refresh.</span>
      </div>
    );
  }
}
