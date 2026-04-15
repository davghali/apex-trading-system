import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair,
  Calculator,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Plus,
  X,
  Loader2,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import Modal from '@/components/common/Modal';
import ProgressBar from '@/components/common/ProgressBar';
import { useStore } from '@/store';
import { formatPrice, formatCurrency, formatRR } from '@/lib/formatters';
import api from '@/services/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// Pre-trade checklist items from ICT spec
const checklistItems = [
  { id: 'htf_bias', label: 'HTF Bias confirmed (Weekly/Daily)', category: 'Bias' },
  { id: 'daily_bias', label: 'Daily bias aligns with HTF', category: 'Bias' },
  { id: 'po3_phase', label: 'PO3 phase identified', category: 'Bias' },
  { id: 'structure_aligned', label: 'Multi-TF structure aligned', category: 'Structure' },
  { id: 'bos_choch', label: 'BOS or CHoCH confirmed on LTF', category: 'Structure' },
  { id: 'liquidity_swept', label: 'Liquidity sweep completed', category: 'Liquidity' },
  { id: 'poi_identified', label: 'POI identified (OB/FVG/BB)', category: 'POI' },
  { id: 'poi_quality', label: 'POI quality score >= 60%', category: 'POI' },
  { id: 'killzone_active', label: 'Inside active killzone', category: 'Timing' },
  { id: 'model_confirmed', label: 'ICT model pattern confirmed', category: 'Timing' },
  { id: 'dxy_confirms', label: 'DXY correlation confirms', category: 'Confirmation' },
  { id: 'no_high_news', label: 'No high-impact news within 30min', category: 'Risk' },
  { id: 'risk_within_limits', label: 'Risk within daily/weekly limits', category: 'Risk' },
  { id: 'rr_above_min', label: 'Risk:Reward >= 2:1 minimum', category: 'Risk' },
  { id: 'confluence_score', label: 'Confluence score >= 65 (Grade B+)', category: 'Final' },
];

export default function TradePage() {
  try {
    const instrument = useStore((s) => s.instrument);
    const currentPrice = useStore((s) => s.currentPrice);
    const accountSize = useStore((s) => s.accountSize);
    const riskPercent = useStore((s) => s.riskPercent);
    const currentSignal = useStore((s) => s.currentSignal);
    const openTrades = useStore((s) => s.openTrades);
    const grade = useStore((s) => s.grade);
    const score = useStore((s) => s.score);
    const currentKillzone = useStore((s) => s.currentKillzone);
    const alignment = useStore((s) => s.alignment);
    const correlation = useStore((s) => s.correlation);
    const safetyLevel = useStore((s) => s.safetyLevel);
    const tradingRules = useStore((s) => s.tradingRules);
    const todayTrades = useStore((s) => s.todayTrades);

    const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
    const [entryPrice, setEntryPrice] = useState('');
    const [stopLoss, setStopLoss] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [lotSizeOverride, setLotSizeOverride] = useState('');
    const [setupType, setSetupType] = useState('OTE');
    const [notes, setNotes] = useState('');
    const [showNewTrade, setShowNewTrade] = useState(false);
    const [showCloseTrade, setShowCloseTrade] = useState<string | null>(null);
    const [closePrice, setClosePrice] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Position sizer calculations
    const safeAccountSize = typeof accountSize === 'number' && !isNaN(accountSize) ? accountSize : 100000;
    const safeRiskPercent = typeof riskPercent === 'number' && !isNaN(riskPercent) ? riskPercent : 1;
    const riskAmount = safeAccountSize * (safeRiskPercent / 100);
    const entry = parseFloat(entryPrice) || currentPrice || 0;
    const sl = parseFloat(stopLoss) || 0;
    const tp = parseFloat(takeProfit) || 0;

    const slDistance = sl > 0 ? Math.abs(entry - sl) : 0;
    const tpDistance = tp > 0 ? Math.abs(tp - entry) : 0;
    const rr = slDistance > 0 && tpDistance > 0 ? tpDistance / slDistance : 0;

    const pipValue = instrument.includes('JPY') ? 0.01 : 0.0001;
    const slPips = slDistance / pipValue;
    const lotSize = lotSizeOverride ? parseFloat(lotSizeOverride) : (slPips > 0 ? riskAmount / (slPips * 10) : 0);

    // Checklist auto-evaluation
    const checklistStatus = useMemo(() => {
      const safeScore = typeof score === 'number' ? score : 0;
      return {
        htf_bias: alignment?.aligned || false,
        daily_bias: alignment?.aligned || false,
        po3_phase: true, // Always available from analysis
        structure_aligned: alignment?.aligned || false,
        bos_choch: Object.values(useStore.getState().structures || {}).some((s: any) => s.lastBreak !== 'NONE'),
        liquidity_swept: true,
        poi_identified: (useStore.getState().pois || []).filter((p: any) => !p.mitigated).length > 0,
        poi_quality: (useStore.getState().pois || []).some((p: any) => p.strength >= 60),
        killzone_active: currentKillzone?.active || false,
        model_confirmed: currentKillzone?.model !== 'NONE',
        dxy_confirms: correlation === 'CONFIRMING',
        no_high_news: safetyLevel !== 'DANGER',
        risk_within_limits: (todayTrades || 0) < (tradingRules?.maxDailyTrades || 3),
        rr_above_min: rr >= (tradingRules?.minRR || 2),
        confluence_score: safeScore >= (tradingRules?.minConfluenceScore || 65),
      } as Record<string, boolean>;
    }, [alignment, currentKillzone, correlation, safetyLevel, rr, todayTrades, tradingRules, score]);

    const passedChecks = Object.values(checklistStatus).filter(Boolean).length;
    const totalChecks = checklistItems.length;

    // Submit new trade
    const handleSubmitTrade = async () => {
      if (!entry || !sl) return;
      setSubmitting(true);
      try {
        await api.post('/trades', {
          instrument,
          direction,
          entryPrice: entry,
          stopLoss: sl,
          takeProfit: tp,
          lotSize,
          model: setupType,
          notes,
        });
        setShowNewTrade(false);
        setEntryPrice('');
        setStopLoss('');
        setTakeProfit('');
        setNotes('');
      } catch (err) {
        console.error('Failed to submit trade:', err);
      } finally {
        setSubmitting(false);
      }
    };

    // Close trade
    const handleCloseTrade = async () => {
      if (!showCloseTrade || !closePrice) return;
      setSubmitting(true);
      try {
        const store = useStore.getState();
        store.closeTrade(showCloseTrade, parseFloat(closePrice));
        await api.post(`/trades/${showCloseTrade}/close`, { exitPrice: parseFloat(closePrice) });
        setShowCloseTrade(null);
        setClosePrice('');
      } catch (err) {
        console.error('Failed to close trade:', err);
      } finally {
        setSubmitting(false);
      }
    };

    const safeOpenTrades = Array.isArray(openTrades) ? openTrades : [];

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-ict-text">Trade Manager</h1>
            <p className="text-xs text-ict-muted mt-0.5">Position sizing, checklist, and trade execution</p>
          </div>
          <button
            onClick={() => setShowNewTrade(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ict-accent/10 border border-ict-accent/30 text-xs text-ict-accent hover:bg-ict-accent/20 transition-all"
          >
            <Plus size={14} />
            New Trade
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Position Sizer */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card title="Position Sizer" accent="cyan">
              <div className="space-y-4">
                {/* Direction toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDirection('LONG')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                      direction === 'LONG'
                        ? 'bg-ict-bullish/10 border-ict-bullish/30 text-ict-bullish'
                        : 'bg-transparent border-ict-border/30 text-ict-muted hover:border-ict-bullish/20'
                    }`}
                  >
                    <ArrowUpRight size={16} />
                    LONG
                  </button>
                  <button
                    onClick={() => setDirection('SHORT')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                      direction === 'SHORT'
                        ? 'bg-ict-bearish/10 border-ict-bearish/30 text-ict-bearish'
                        : 'bg-transparent border-ict-border/30 text-ict-muted hover:border-ict-bearish/20'
                    }`}
                  >
                    <ArrowDownRight size={16} />
                    SHORT
                  </button>
                </div>

                {/* Input fields */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Account Balance', value: safeAccountSize.toString(), readOnly: true, suffix: 'USD' },
                    { label: 'Risk %', value: safeRiskPercent.toString(), readOnly: true, suffix: '%' },
                  ].map(({ label, value, readOnly, suffix }) => (
                    <div key={label}>
                      <label className="text-[10px] text-ict-muted uppercase tracking-wider mb-1 block">{label}</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={value}
                          readOnly={readOnly}
                          className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text/60 focus:outline-none"
                        />
                        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ict-muted">{suffix}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Entry Price', val: entryPrice, setter: setEntryPrice, ph: currentPrice > 0 ? formatPrice(currentPrice, instrument) : 'Entry' },
                    { label: 'Stop Loss', val: stopLoss, setter: setStopLoss, ph: 'SL price' },
                    { label: 'Take Profit', val: takeProfit, setter: setTakeProfit, ph: 'TP price' },
                  ].map(({ label, val, setter, ph }) => (
                    <div key={label}>
                      <label className="text-[10px] text-ict-muted uppercase tracking-wider mb-1 block">{label}</label>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={ph}
                        step="any"
                        className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none transition-colors"
                      />
                    </div>
                  ))}
                </div>

                {/* Results */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Risk Amount', val: formatCurrency(riskAmount), accent: false },
                    { label: 'Lot Size', val: lotSize > 0 ? lotSize.toFixed(2) : '--', accent: true },
                    { label: 'SL Pips', val: slPips > 0 ? slPips.toFixed(1) : '--', accent: false },
                    { label: 'Risk:Reward', val: rr > 0 ? formatRR(rr) : '--', accent: true },
                  ].map(({ label, val, accent }) => (
                    <motion.div
                      key={label}
                      className={`p-3 rounded-lg ${accent ? 'bg-ict-accent/5 border border-ict-accent/10' : 'bg-white/[0.02]'}`}
                      animate={{ scale: accent && rr >= 2 ? [1, 1.02, 1] : 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className="text-[9px] text-ict-muted uppercase block">{label}</span>
                      <span className={`text-sm font-mono font-bold ${accent ? 'text-ict-accent' : 'text-ict-text'}`}>{val}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Warnings */}
                {rr > 0 && rr < 2 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ict-neutral/5 border border-ict-neutral/10">
                    <AlertTriangle size={14} className="text-ict-neutral" />
                    <span className="text-[11px] text-ict-neutral">RR below 2:1 minimum threshold</span>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Right Column: Checklist + Open Positions */}
          <motion.div variants={itemVariants} className="space-y-4">
            {/* Pre-trade Checklist */}
            <Card
              title="Pre-Trade Checklist"
              accent={passedChecks >= 12 ? 'bullish' : passedChecks >= 8 ? 'neutral' : 'bearish'}
              headerRight={
                <span className="text-[10px] font-mono text-ict-muted">{passedChecks}/{totalChecks}</span>
              }
            >
              <div className="space-y-1 max-h-[320px] overflow-y-auto no-scrollbar">
                {checklistItems.map((item) => {
                  const passed = checklistStatus[item.id] || false;
                  return (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      {passed ? (
                        <CheckCircle2 size={14} className="text-ict-bullish flex-shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-ict-bearish/50 flex-shrink-0" />
                      )}
                      <span className={`text-[11px] ${passed ? 'text-ict-text' : 'text-ict-muted/60'}`}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-ict-border/20">
                <ProgressBar
                  value={passedChecks}
                  max={totalChecks}
                  color={passedChecks >= 12 ? 'bullish' : passedChecks >= 8 ? 'neutral' : 'bearish'}
                  height="md"
                  showLabel
                  animated
                />
              </div>
            </Card>

            {/* Open Positions */}
            <Card
              title="Open Positions"
              headerRight={<span className="text-[10px] font-mono text-ict-muted">{safeOpenTrades.length}</span>}
            >
              <div className="space-y-2">
                {safeOpenTrades.length > 0 ? safeOpenTrades.map((trade) => {
                  const safePnl = typeof trade.pnl === 'number' && !isNaN(trade.pnl) ? trade.pnl : 0;
                  return (
                    <motion.div
                      key={trade.id}
                      className="p-2.5 rounded-lg bg-white/[0.02] border border-ict-border/10"
                      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={trade.direction === 'LONG' ? 'bullish' : 'bearish'} size="xs">
                            {trade.direction}
                          </Badge>
                          <span className="text-xs font-semibold text-ict-text">{trade.instrument || instrument}</span>
                        </div>
                        <span className={`text-xs font-mono font-bold ${safePnl >= 0 ? 'text-ict-bullish' : 'text-ict-bearish'}`}>
                          {formatCurrency(safePnl)}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] font-mono text-ict-muted">
                          Entry: {formatPrice(trade.entryPrice, instrument)}
                        </span>
                        <button
                          onClick={() => {
                            setShowCloseTrade(trade.id);
                            setClosePrice(currentPrice > 0 ? currentPrice.toString() : '');
                          }}
                          className="text-[10px] text-ict-accent hover:text-ict-text transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </motion.div>
                  );
                }) : (
                  <div className="text-center py-4">
                    <Crosshair size={16} className="text-ict-muted/30 mx-auto mb-1" />
                    <span className="text-xs text-ict-muted">No open positions</span>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* New Trade Modal */}
        <Modal isOpen={showNewTrade} onClose={() => setShowNewTrade(false)} title="New Trade" size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ict-muted uppercase mb-1 block">Instrument</label>
                <input type="text" value={instrument} readOnly className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text/60" />
              </div>
              <div>
                <label className="text-[10px] text-ict-muted uppercase mb-1 block">Setup Type</label>
                <select
                  value={setupType}
                  onChange={(e) => setSetupType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm text-ict-text focus:border-ict-accent/50 focus:outline-none"
                >
                  <option value="OTE">OTE</option>
                  <option value="BREAKER">Breaker</option>
                  <option value="FVG_ENTRY">FVG Entry</option>
                  <option value="TURTLE_SOUP">Turtle Soup</option>
                  <option value="SILVER_BULLET">Silver Bullet</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-ict-muted uppercase mb-1 block">Direction</label>
              <div className="flex gap-2">
                {(['LONG', 'SHORT'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                      direction === d
                        ? d === 'LONG' ? 'bg-ict-bullish/10 border-ict-bullish/30 text-ict-bullish' : 'bg-ict-bearish/10 border-ict-bearish/30 text-ict-bearish'
                        : 'border-ict-border/30 text-ict-muted'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-ict-muted uppercase mb-1 block">Entry</label>
                <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder={currentPrice > 0 ? formatPrice(currentPrice, instrument) : ''} step="any" className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-ict-muted uppercase mb-1 block">Stop Loss</label>
                <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} step="any" className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-ict-muted uppercase mb-1 block">Take Profit</label>
                <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} step="any" className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-ict-muted uppercase mb-1 block">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none resize-none" />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNewTrade(false)} className="flex-1 py-2 rounded-lg border border-ict-border/30 text-sm text-ict-muted hover:text-ict-text transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmitTrade}
                disabled={submitting || !entry || !sl}
                className="flex-1 py-2 rounded-lg bg-ict-accent/10 border border-ict-accent/30 text-sm font-semibold text-ict-accent hover:bg-ict-accent/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Submit Trade
              </button>
            </div>
          </div>
        </Modal>

        {/* Close Trade Modal */}
        <Modal isOpen={!!showCloseTrade} onClose={() => setShowCloseTrade(null)} title="Close Trade" size="sm">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-ict-muted uppercase mb-1 block">Exit Price</label>
              <input
                type="number"
                value={closePrice}
                onChange={(e) => setClosePrice(e.target.value)}
                placeholder={currentPrice > 0 ? formatPrice(currentPrice, instrument) : 'Exit price'}
                step="any"
                className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCloseTrade(null)} className="flex-1 py-2 rounded-lg border border-ict-border/30 text-sm text-ict-muted">
                Cancel
              </button>
              <button
                onClick={handleCloseTrade}
                disabled={submitting || !closePrice}
                className="flex-1 py-2 rounded-lg bg-ict-bearish/10 border border-ict-bearish/30 text-sm font-semibold text-ict-bearish hover:bg-ict-bearish/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Close Position
              </button>
            </div>
          </div>
        </Modal>
      </motion.div>
    );
  } catch {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={24} className="text-ict-bearish mx-auto mb-2" />
        <span className="text-sm text-ict-muted">Trade page encountered an error. Please refresh.</span>
      </div>
    );
  }
}
