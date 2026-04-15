import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.js';

const router = Router();

// ── Types ───────────────────────────────────────────────────

interface TradeInput {
  instrument: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit?: number;
  position_size: number;
  risk_amount: number;
  killzone?: string;
  setup_type?: string;
  confluence_score?: number;
  notes?: string;
  tags?: string[];
  bias_at_entry?: string;
  screenshot_url?: string;
}

interface TradeRow {
  id: number;
  instrument: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number | null;
  exit_price: number | null;
  position_size: number;
  risk_amount: number;
  pnl: number | null;
  pnl_pips: number | null;
  rr_achieved: number | null;
  status: string;
  entry_time: string;
  exit_time: string | null;
  killzone: string | null;
  setup_type: string | null;
  confluence_score: number | null;
  notes: string | null;
  tags: string;
  bias_at_entry: string | null;
  screenshot_url: string | null;
}

// ── Validation helpers ──────────────────────────────────────

function validateTradeInput(body: Partial<TradeInput>): string | null {
  if (!body.instrument || typeof body.instrument !== 'string' || body.instrument.trim().length < 2) {
    return 'instrument is required (min 2 chars)';
  }
  if (!body.direction || !['long', 'short'].includes(body.direction)) {
    return 'direction must be "long" or "short"';
  }
  if (typeof body.entry_price !== 'number' || body.entry_price <= 0) {
    return 'entry_price must be a positive number';
  }
  if (typeof body.stop_loss !== 'number' || body.stop_loss <= 0) {
    return 'stop_loss must be a positive number';
  }
  if (typeof body.position_size !== 'number' || body.position_size <= 0) {
    return 'position_size must be a positive number';
  }
  if (typeof body.risk_amount !== 'number' || body.risk_amount <= 0) {
    return 'risk_amount must be a positive number';
  }

  // Validate stop loss direction
  if (body.direction === 'long' && body.stop_loss >= body.entry_price) {
    return 'For long trades, stop_loss must be below entry_price';
  }
  if (body.direction === 'short' && body.stop_loss <= body.entry_price) {
    return 'For short trades, stop_loss must be above entry_price';
  }

  // Validate take profit direction if provided
  if (body.take_profit !== undefined && body.take_profit !== null) {
    if (typeof body.take_profit !== 'number' || body.take_profit <= 0) {
      return 'take_profit must be a positive number';
    }
    if (body.direction === 'long' && body.take_profit <= body.entry_price) {
      return 'For long trades, take_profit must be above entry_price';
    }
    if (body.direction === 'short' && body.take_profit >= body.entry_price) {
      return 'For short trades, take_profit must be below entry_price';
    }
  }

  if (body.confluence_score !== undefined && body.confluence_score !== null) {
    if (typeof body.confluence_score !== 'number' || body.confluence_score < 0 || body.confluence_score > 100) {
      return 'confluence_score must be between 0 and 100';
    }
  }

  if (body.tags && !Array.isArray(body.tags)) {
    return 'tags must be an array';
  }

  return null;
}

// ── Pip calculations ────────────────────────────────────────

function getPipMultiplier(instrument: string): number {
  const upper = instrument.toUpperCase();
  // JPY pairs: 1 pip = 0.01
  if (upper.includes('JPY')) return 100;
  // Gold: 1 pip = 0.1
  if (upper === 'XAUUSD') return 10;
  // Silver: 1 pip = 0.01
  if (upper === 'XAGUSD') return 100;
  // Indices: 1 pip = 1 point
  if (['US30', 'US100', 'US500', 'NQ', 'ES', 'YM', 'RTY'].includes(upper)) return 1;
  // Standard forex: 1 pip = 0.0001
  return 10000;
}

function calculatePips(instrument: string, priceDiff: number): number {
  const multiplier = getPipMultiplier(instrument);
  return Math.round(priceDiff * multiplier * 10) / 10;
}

// ── Enrich trade data for response ──────────────────────────

function enrichTrade(trade: TradeRow): Record<string, unknown> {
  const riskDistance = Math.abs(trade.entry_price - trade.stop_loss);
  const riskPips = calculatePips(trade.instrument, riskDistance);
  const plannedRR = trade.take_profit
    ? Math.abs(trade.take_profit - trade.entry_price) / riskDistance
    : null;

  return {
    ...trade,
    tags: typeof trade.tags === 'string' ? JSON.parse(trade.tags) : trade.tags,
    risk_pips: riskPips,
    planned_rr: plannedRR ? Math.round(plannedRR * 100) / 100 : null,
    pnl_formatted: trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : null,
    rr_formatted: trade.rr_achieved !== null ? `${trade.rr_achieved >= 0 ? '+' : ''}${trade.rr_achieved.toFixed(2)}R` : null,
  };
}

// ── Update daily stats after trade close ────────────────────

function updateDailyStatsForDate(dateStr: string): void {
  try {
    const trades = db.prepare(`
      SELECT pnl, rr_achieved
      FROM trades
      WHERE status = 'closed' AND date(exit_time) = ?
    `).all(dateStr) as Array<{ pnl: number | null; rr_achieved: number | null }>;

    if (trades.length === 0) return;

    const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnl ?? 0) <= 0);
    const grossPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const avgRR = trades.reduce((s, t) => s + (t.rr_achieved ?? 0), 0) / trades.length;
    const winRate = (wins.length / trades.length) * 100;

    db.prepare(`
      INSERT INTO daily_stats (date, trades_taken, wins, losses, gross_pnl, net_pnl, max_drawdown, avg_rr, best_trade, worst_trade, profit_factor, win_rate)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        trades_taken = excluded.trades_taken, wins = excluded.wins, losses = excluded.losses,
        gross_pnl = excluded.gross_pnl, net_pnl = excluded.net_pnl,
        avg_rr = excluded.avg_rr, best_trade = excluded.best_trade, worst_trade = excluded.worst_trade,
        profit_factor = excluded.profit_factor, win_rate = excluded.win_rate
    `).run(
      dateStr, trades.length, wins.length, losses.length,
      Math.round(grossPnl * 100) / 100,
      Math.round(grossPnl * 100) / 100,
      Math.round(avgRR * 100) / 100,
      Math.round(Math.max(...trades.map((t) => t.pnl ?? 0)) * 100) / 100,
      Math.round(Math.min(...trades.map((t) => t.pnl ?? 0)) * 100) / 100,
      Math.round(profitFactor * 100) / 100,
      Math.round(winRate * 100) / 100
    );
  } catch (err) {
    console.error('[TRADES] Failed to update daily stats:', err);
  }
}

// ── ROUTES ──────────────────────────────────────────────────

// GET /api/trades — List trades with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, from, to, instrument, setup_type, killzone, limit = '100', offset = '0' } = req.query;

    let query = 'SELECT * FROM trades WHERE 1=1';
    const params: unknown[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (instrument) {
      query += ' AND instrument = ?';
      params.push((instrument as string).toUpperCase());
    }
    if (setup_type) {
      query += ' AND setup_type = ?';
      params.push(setup_type);
    }
    if (killzone) {
      query += ' AND killzone = ?';
      params.push(killzone);
    }
    if (from) {
      query += ' AND entry_time >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND entry_time <= ?';
      params.push(to);
    }

    // Validate and clamp limit
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
    const parsedOffset = Math.max(0, Number(offset) || 0);

    query += ' ORDER BY entry_time DESC LIMIT ? OFFSET ?';
    params.push(parsedLimit, parsedOffset);

    const trades = db.prepare(query).all(...params) as TradeRow[];
    const enriched = trades.map(enrichTrade);

    // Total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM trades WHERE 1=1';
    const countParams: unknown[] = [];
    if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
    if (instrument) { countQuery += ' AND instrument = ?'; countParams.push((instrument as string).toUpperCase()); }

    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };

    res.json({
      trades: enriched,
      count: enriched.length,
      total: countResult.total,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] GET / failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch trades' });
  }
});

// GET /api/trades/:id — Get single trade
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid trade ID' });
      return;
    }

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined;

    if (!trade) {
      res.status(404).json({ error: true, message: 'Trade not found' });
      return;
    }

    res.json(enrichTrade(trade));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] GET /${req.params.id} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch trade' });
  }
});

// POST /api/trades — Create trade
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as TradeInput;

    const validationError = validateTradeInput(body);
    if (validationError) {
      res.status(400).json({ error: true, message: validationError });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO trades (instrument, direction, entry_price, stop_loss, take_profit,
        position_size, risk_amount, killzone, setup_type, confluence_score, notes, tags, bias_at_entry, screenshot_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      body.instrument.toUpperCase(),
      body.direction,
      body.entry_price,
      body.stop_loss,
      body.take_profit || null,
      body.position_size,
      body.risk_amount,
      body.killzone || null,
      body.setup_type || null,
      body.confluence_score ?? null,
      body.notes || null,
      JSON.stringify(body.tags || []),
      body.bias_at_entry || null,
      body.screenshot_url || null
    );

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid) as TradeRow;

    console.log(`[TRADES] Created trade #${trade.id}: ${trade.instrument} ${trade.direction} @ ${trade.entry_price}`);

    res.status(201).json(enrichTrade(trade));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] POST / failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to create trade' });
  }
});

// PUT /api/trades/:id — Update trade
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid trade ID' });
      return;
    }

    const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined;
    if (!existing) {
      res.status(404).json({ error: true, message: 'Trade not found' });
      return;
    }

    const body = req.body as Partial<TradeInput & {
      status: string;
      pnl: number;
      rr_achieved: number;
      exit_price: number;
      exit_time: string;
    }>;

    const fields: string[] = [];
    const values: unknown[] = [];

    const allowedFields = [
      'instrument', 'direction', 'entry_price', 'stop_loss', 'take_profit',
      'exit_price', 'position_size', 'risk_amount', 'pnl', 'pnl_pips', 'rr_achieved',
      'status', 'exit_time', 'killzone', 'setup_type', 'confluence_score',
      'notes', 'bias_at_entry', 'screenshot_url',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        fields.push(`${field} = ?`);
        const val = (body as Record<string, unknown>)[field];
        values.push(field === 'instrument' && typeof val === 'string' ? val.toUpperCase() : val);
      }
    }

    if ('tags' in body) {
      fields.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }

    if (fields.length === 0) {
      res.status(400).json({ error: true, message: 'No fields to update' });
      return;
    }

    values.push(id);
    db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow;
    res.json(enrichTrade(updated));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] PUT /${req.params.id} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to update trade' });
  }
});

// PUT /api/trades/:id/close — Close trade with exit price
router.put('/:id/close', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid trade ID' });
      return;
    }

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined;

    if (!trade) {
      res.status(404).json({ error: true, message: 'Trade not found' });
      return;
    }

    if (trade.status !== 'open') {
      res.status(400).json({ error: true, message: `Trade is already ${trade.status}` });
      return;
    }

    const { exit_price, notes } = req.body as { exit_price: number; notes?: string };
    if (typeof exit_price !== 'number' || exit_price <= 0) {
      res.status(400).json({ error: true, message: 'exit_price must be a positive number' });
      return;
    }

    // ── PnL calculation ────────────────────────────────────
    const entryPrice = trade.entry_price;
    const stopLoss = trade.stop_loss;
    const positionSize = trade.position_size;
    const direction = trade.direction;

    const priceDiff = direction === 'long'
      ? exit_price - entryPrice
      : entryPrice - exit_price;

    // PnL in dollars
    const pnl = Math.round(priceDiff * positionSize * 100) / 100;

    // PnL in pips
    const pnlPips = calculatePips(trade.instrument, priceDiff);

    // RR achieved
    const riskDistance = Math.abs(entryPrice - stopLoss);
    const rr_achieved = riskDistance > 0
      ? Math.round((priceDiff / riskDistance) * 100) / 100
      : 0;

    // ── Update trade ───────────────────────────────────────
    const updateFields = [
      'exit_price = ?', 'pnl = ?', 'pnl_pips = ?', 'rr_achieved = ?',
      "status = 'closed'", "exit_time = datetime('now')",
    ];
    const updateValues: unknown[] = [exit_price, pnl, pnlPips, rr_achieved];

    if (notes) {
      updateFields.push('notes = ?');
      updateValues.push(trade.notes ? `${trade.notes}\n---\n${notes}` : notes);
    }

    updateValues.push(id);
    db.prepare(`UPDATE trades SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);

    const closed = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow;

    // Update daily stats
    const exitDate = closed.exit_time ? closed.exit_time.split('T')[0] : new Date().toISOString().split('T')[0];
    updateDailyStatsForDate(exitDate);

    console.log(
      `[TRADES] Closed trade #${id}: ${trade.instrument} ${direction} | ` +
      `PnL: $${pnl} (${pnlPips} pips) | RR: ${rr_achieved}`
    );

    res.json({
      ...enrichTrade(closed),
      close_summary: {
        pnl_dollars: pnl,
        pnl_pips: pnlPips,
        rr_achieved,
        result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN',
        hold_time: trade.entry_time && closed.exit_time
          ? `${Math.round((new Date(closed.exit_time).getTime() - new Date(trade.entry_time).getTime()) / 60000)} min`
          : null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] PUT /${req.params.id}/close failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to close trade' });
  }
});

// DELETE /api/trades/:id — Delete trade
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid trade ID' });
      return;
    }

    const existing = db.prepare('SELECT id FROM trades WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: true, message: 'Trade not found' });
      return;
    }

    db.prepare('DELETE FROM trades WHERE id = ?').run(id);
    console.log(`[TRADES] Deleted trade #${id}`);
    res.json({ success: true, message: 'Trade deleted' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TRADES] DELETE /${req.params.id} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to delete trade' });
  }
});

export default router;
