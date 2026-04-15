import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.js';

const router = Router();

// ── Types ───────────────────────────────────────────────────

interface TradeRow {
  id: number;
  instrument: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number | null;
  exit_price: number | null;
  pnl: number | null;
  pnl_pips: number | null;
  rr_achieved: number | null;
  status: string;
  entry_time: string;
  exit_time: string | null;
  killzone: string | null;
  setup_type: string | null;
  confluence_score: number | null;
  risk_amount: number;
}

// ── Helper: round to 2 decimals ─────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Helper: compute streak stats ────────────────────────────

function computeStreaks(trades: TradeRow[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };
} {
  let maxWins = 0;
  let maxLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if ((trade.pnl ?? 0) > 0) {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxWins) maxWins = currentWins;
    } else {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxLosses) maxLosses = currentLosses;
    }
  }

  const lastTrade = trades[trades.length - 1];
  const currentType = !lastTrade ? 'none' : (lastTrade.pnl ?? 0) > 0 ? 'win' : 'loss';
  const currentCount = currentType === 'win' ? currentWins : currentType === 'loss' ? currentLosses : 0;

  return {
    maxConsecutiveWins: maxWins,
    maxConsecutiveLosses: maxLosses,
    currentStreak: { type: currentType, count: currentCount },
  };
}

// ── Helper: build date-filtered query ───────────────────────

function buildDateQuery(
  baseQuery: string,
  dateField: string,
  from?: string,
  to?: string
): { query: string; params: unknown[] } {
  let query = baseQuery;
  const params: unknown[] = [];

  if (from) {
    query += ` AND ${dateField} >= ?`;
    params.push(from);
  }
  if (to) {
    query += ` AND ${dateField} <= ?`;
    params.push(to);
  }

  return { query, params };
}

// ── GET /api/journal/stats — Aggregated journal statistics ──
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    const { query, params } = buildDateQuery(
      "SELECT * FROM trades WHERE status = 'closed'",
      'exit_time',
      from,
      to
    );

    const trades = db.prepare(query + ' ORDER BY exit_time ASC').all(...params) as TradeRow[];

    if (trades.length === 0) {
      res.json({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgRR: 0,
        profitFactor: 0,
        totalPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        grossProfit: 0,
        grossLoss: 0,
        avgWinSize: 0,
        avgLossSize: 0,
        avgWinRR: 0,
        avgLossRR: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        currentStreak: { type: 'none', count: 0 },
        expectancy: 0,
        avgTradesPerDay: 0,
      });
      return;
    }

    const winTrades = trades.filter((t) => (t.pnl ?? 0) > 0);
    const lossTrades = trades.filter((t) => (t.pnl ?? 0) <= 0);

    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const grossProfit = winTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(lossTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0));

    const winRate = (winTrades.length / trades.length) * 100;
    const avgRR = trades.reduce((sum, t) => sum + (t.rr_achieved ?? 0), 0) / trades.length;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    const avgWinSize = winTrades.length > 0
      ? winTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / winTrades.length
      : 0;
    const avgLossSize = lossTrades.length > 0
      ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / lossTrades.length)
      : 0;

    const avgWinRR = winTrades.length > 0
      ? winTrades.reduce((s, t) => s + (t.rr_achieved ?? 0), 0) / winTrades.length
      : 0;
    const avgLossRR = lossTrades.length > 0
      ? lossTrades.reduce((s, t) => s + Math.abs(t.rr_achieved ?? 0), 0) / lossTrades.length
      : 0;

    // Expectancy: (winRate * avgWin) - (lossRate * avgLoss)
    const expectancy = (winRate / 100 * avgWinSize) - ((1 - winRate / 100) * avgLossSize);

    // Average trades per day
    const firstDate = new Date(trades[0].exit_time || trades[0].entry_time);
    const lastDate = new Date(trades[trades.length - 1].exit_time || trades[trades.length - 1].entry_time);
    const daySpan = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    const avgTradesPerDay = trades.length / daySpan;

    const streaks = computeStreaks(trades);

    res.json({
      totalTrades: trades.length,
      wins: winTrades.length,
      losses: lossTrades.length,
      winRate: r2(winRate),
      avgRR: r2(avgRR),
      profitFactor: r2(profitFactor),
      totalPnl: r2(totalPnl),
      bestTrade: r2(Math.max(...trades.map((t) => t.pnl ?? 0))),
      worstTrade: r2(Math.min(...trades.map((t) => t.pnl ?? 0))),
      grossProfit: r2(grossProfit),
      grossLoss: r2(grossLoss),
      avgWinSize: r2(avgWinSize),
      avgLossSize: r2(avgLossSize),
      avgWinRR: r2(avgWinRR),
      avgLossRR: r2(avgLossRR),
      maxConsecutiveWins: streaks.maxConsecutiveWins,
      maxConsecutiveLosses: streaks.maxConsecutiveLosses,
      currentStreak: streaks.currentStreak,
      expectancy: r2(expectancy),
      avgTradesPerDay: r2(avgTradesPerDay),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Stats failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute journal stats' });
  }
});

// ── GET /api/journal/equity-curve — Equity curve with drawdown tracking ──
router.get('/equity-curve', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    const { query, params } = buildDateQuery(
      "SELECT id, instrument, direction, pnl, pnl_pips, rr_achieved, exit_time, setup_type FROM trades WHERE status = 'closed' AND pnl IS NOT NULL",
      'exit_time',
      from,
      to
    );

    const trades = db.prepare(query + ' ORDER BY exit_time ASC').all(...params) as Array<{
      id: number;
      instrument: string;
      direction: string;
      pnl: number;
      pnl_pips: number | null;
      rr_achieved: number | null;
      exit_time: string;
      setup_type: string | null;
    }>;

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    const curve = trades.map((trade) => {
      cumulative += trade.pnl;
      if (cumulative > peak) peak = cumulative;

      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;

      return {
        tradeId: trade.id,
        instrument: trade.instrument,
        date: trade.exit_time,
        pnl: r2(trade.pnl),
        pnlPips: trade.pnl_pips !== null ? r2(trade.pnl_pips) : null,
        rr: trade.rr_achieved !== null ? r2(trade.rr_achieved) : null,
        cumulative: r2(cumulative),
        peak: r2(peak),
        drawdown: r2(drawdown),
        drawdownPercent: r2(drawdownPercent),
      };
    });

    res.json({
      curve,
      summary: {
        totalPnl: r2(cumulative),
        maxDrawdown: r2(maxDrawdown),
        maxDrawdownPercent: r2(maxDrawdownPercent),
        peak: r2(peak),
        totalTrades: trades.length,
        recoveryFactor: maxDrawdown > 0 ? r2(cumulative / maxDrawdown) : 0,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Equity curve failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute equity curve' });
  }
});

// ── GET /api/journal/monthly — Monthly breakdown ────────────
router.get('/monthly', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    let query = `SELECT * FROM v_monthly_summary WHERE 1=1`;
    const params: unknown[] = [];

    if (from) {
      query += ` AND trade_month >= ?`;
      params.push(from.substring(0, 7)); // YYYY-MM
    }
    if (to) {
      query += ` AND trade_month <= ?`;
      params.push(to.substring(0, 7));
    }

    const months = db.prepare(query).all(...params);
    res.json({ months });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Monthly breakdown failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute monthly breakdown' });
  }
});

// ── GET /api/journal/daily — Daily breakdown ────────────────
router.get('/daily', (req: Request, res: Response) => {
  try {
    const { from, to, limit = '30' } = req.query as { from?: string; to?: string; limit?: string };

    let query = `SELECT * FROM v_daily_summary WHERE 1=1`;
    const params: unknown[] = [];

    if (from) {
      query += ` AND trade_date >= ?`;
      params.push(from);
    }
    if (to) {
      query += ` AND trade_date <= ?`;
      params.push(to);
    }

    const parsedLimit = Math.min(Math.max(1, Number(limit) || 30), 365);
    query += ` LIMIT ?`;
    params.push(parsedLimit);

    const days = db.prepare(query).all(...params);
    res.json({ days });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Daily breakdown failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute daily breakdown' });
  }
});

// ── GET /api/journal/weekly — Weekly breakdown ──────────────
router.get('/weekly', (req: Request, res: Response) => {
  try {
    const weeks = db.prepare('SELECT * FROM v_weekly_summary LIMIT 52').all();
    res.json({ weeks });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Weekly breakdown failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute weekly breakdown' });
  }
});

// ── GET /api/journal/instruments — Per-instrument statistics ─
router.get('/instruments', (_req: Request, res: Response) => {
  try {
    const instruments = db.prepare('SELECT * FROM v_instrument_stats').all();
    res.json({ instruments });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Instrument stats failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute instrument stats' });
  }
});

// ── GET /api/journal/setups — Per-setup-type statistics ─────
router.get('/setups', (_req: Request, res: Response) => {
  try {
    const setups = db.prepare('SELECT * FROM v_setup_stats').all();
    res.json({ setups });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Setup stats failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute setup stats' });
  }
});

// ── GET /api/journal/killzones — Per-killzone statistics ────
router.get('/killzones', (_req: Request, res: Response) => {
  try {
    const killzones = db.prepare('SELECT * FROM v_killzone_stats').all();
    res.json({ killzones });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JOURNAL] Killzone stats failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to compute killzone stats' });
  }
});

export default router;
