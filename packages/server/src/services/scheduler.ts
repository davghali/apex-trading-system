import cron from 'node-cron';
import type { Server } from 'socket.io';
import { engineClient } from './engine-client.js';
import { db } from '../config/database.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { emitAnalysisResults, emitSessionUpdate } from '../socket/handler.js';

// ── Types ───────────────────────────────────────────────────

interface ScheduledTask {
  name: string;
  task: cron.ScheduledTask;
  description: string;
}

interface ScanRecord {
  taskName: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: number;
  durationMs?: number;
  resultSummary?: string;
  errorMessage?: string;
}

interface SchedulerStatus {
  running: boolean;
  taskCount: number;
  lastScan: ScanRecord | null;
  isKillzone: boolean;
  currentKillzone: string | null;
  totalScans: number;
  failedScans: number;
}

// ── State ───────────────────────────────────────────────────

const tasks: ScheduledTask[] = [];
let lastScan: ScanRecord | null = null;
let totalScans = 0;
let failedScans = 0;
let isRunning = false;

// ── Killzone detection (UTC-based) ──────────────────────────

interface KillzoneWindow {
  name: string;
  startUTC: number;
  endUTC: number;
}

const KILLZONES: KillzoneWindow[] = [
  { name: 'Asian', startUTC: 0, endUTC: 9 },
  { name: 'London', startUTC: 7, endUTC: 12 },
  { name: 'New York AM', startUTC: 12, endUTC: 15 },
  { name: 'New York PM', startUTC: 15, endUTC: 17 },
];

function getActiveKillzone(): KillzoneWindow | null {
  const utcHour = new Date().getUTCHours();

  for (const kz of KILLZONES) {
    if (utcHour >= kz.startUTC && utcHour < kz.endUTC) {
      return kz;
    }
  }
  return null;
}

function isKillzoneHour(): boolean {
  return getActiveKillzone() !== null;
}

// ── Persist scan results to DB ──────────────────────────────

function recordScanResult(record: ScanRecord): void {
  try {
    db.prepare(`
      INSERT INTO scheduler_runs (task_name, status, result_summary, error_message, duration_ms, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, datetime(? / 1000, 'unixepoch'), datetime('now'))
    `).run(
      record.taskName,
      record.status,
      record.resultSummary || null,
      record.errorMessage || null,
      record.durationMs || null,
      record.startedAt
    );
  } catch (err) {
    console.error('[SCHEDULER] Failed to record scan result:', err);
  }
}

// ── Safe scan wrapper with error recovery ───────────────────

async function safeScan(
  taskName: string,
  io: Server,
  operation: () => Promise<unknown>
): Promise<void> {
  const startTime = Date.now();
  totalScans++;

  try {
    console.log(`[SCHEDULER] ${taskName} started`);
    const result = await operation();

    const duration = Date.now() - startTime;
    const record: ScanRecord = {
      taskName,
      status: 'success',
      startedAt: startTime,
      durationMs: duration,
      resultSummary: typeof result === 'object' ? 'completed' : String(result),
    };

    lastScan = record;
    recordScanResult(record);

    console.log(`[SCHEDULER] ${taskName} completed in ${duration}ms`);
  } catch (error) {
    failedScans++;
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const record: ScanRecord = {
      taskName,
      status: 'failed',
      startedAt: startTime,
      durationMs: duration,
      errorMessage: errorMsg,
    };

    lastScan = record;
    recordScanResult(record);

    console.error(`[SCHEDULER] ${taskName} FAILED after ${duration}ms: ${errorMsg}`);

    // Emit error to connected clients
    io.emit(SOCKET_EVENTS.SERVER_ERROR, {
      source: 'scheduler',
      task: taskName,
      error: errorMsg,
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Daily stats aggregation ─────────────────────────────────

function aggregateDailyStats(): void {
  try {
    // Get yesterday's date in NY timezone
    const now = new Date();
    const nyOffset = -5; // EST (simplified, doesn't handle DST)
    const nyDate = new Date(now.getTime() + nyOffset * 3600 * 1000);
    const yesterday = new Date(nyDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const trades = db.prepare(`
      SELECT pnl, rr_achieved
      FROM trades
      WHERE status = 'closed'
        AND date(exit_time) = ?
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

    // Compute max drawdown for the day
    let peak = 0;
    let maxDD = 0;
    let cumulative = 0;
    for (const t of trades) {
      cumulative += t.pnl ?? 0;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDD) maxDD = dd;
    }

    db.prepare(`
      INSERT INTO daily_stats (date, trades_taken, wins, losses, gross_pnl, net_pnl, max_drawdown, avg_rr, best_trade, worst_trade, profit_factor, win_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        trades_taken = excluded.trades_taken,
        wins = excluded.wins,
        losses = excluded.losses,
        gross_pnl = excluded.gross_pnl,
        net_pnl = excluded.net_pnl,
        max_drawdown = excluded.max_drawdown,
        avg_rr = excluded.avg_rr,
        best_trade = excluded.best_trade,
        worst_trade = excluded.worst_trade,
        profit_factor = excluded.profit_factor,
        win_rate = excluded.win_rate
    `).run(
      dateStr,
      trades.length,
      wins.length,
      losses.length,
      Math.round(grossPnl * 100) / 100,
      Math.round(grossPnl * 100) / 100, // net = gross for now (no commissions)
      Math.round(maxDD * 100) / 100,
      Math.round(avgRR * 100) / 100,
      Math.round(Math.max(...trades.map((t) => t.pnl ?? 0)) * 100) / 100,
      Math.round(Math.min(...trades.map((t) => t.pnl ?? 0)) * 100) / 100,
      Math.round(profitFactor * 100) / 100,
      Math.round(winRate * 100) / 100
    );

    console.log(`[SCHEDULER] Daily stats aggregated for ${dateStr}: ${trades.length} trades`);
  } catch (error) {
    console.error('[SCHEDULER] Daily stats aggregation failed:', error);
  }
}

// ── Start all scheduled tasks ───────────────────────────────

export function startScheduler(io: Server): void {
  if (isRunning) {
    console.warn('[SCHEDULER] Already running, skipping start');
    return;
  }

  // ── Every 2 minutes — scan during active killzones ──────
  const killzoneScan = cron.schedule('*/2 * * * *', async () => {
    if (!isKillzoneHour()) return;

    const kz = getActiveKillzone();
    await safeScan(`killzone-scan (${kz?.name || 'unknown'})`, io, async () => {
      const result = await engineClient.scanAll();
      io.emit(SOCKET_EVENTS.SCAN_COMPLETE, {
        ...result,
        killzone: kz?.name,
        timestamp: new Date().toISOString(),
      });

      // Emit granular events per instrument so the client receives
      // bias:weekly, structure:update, poi:update, etc.
      const scanData = result.data as Record<string, unknown> | undefined;
      if (scanData && typeof scanData === 'object') {
        for (const [instrument, analysisData] of Object.entries(scanData)) {
          if (analysisData && typeof analysisData === 'object') {
            emitAnalysisResults(io, instrument, analysisData as Record<string, unknown>);
          }
        }
      }

      return result;
    });
  });
  tasks.push({ name: 'killzone-scan', task: killzoneScan, description: 'Scan every 2min during killzones' });

  // ── Every 10 minutes — scan outside killzones ───────────
  const offHourScan = cron.schedule('*/10 * * * *', async () => {
    if (isKillzoneHour()) return;

    await safeScan('off-hour-scan', io, async () => {
      const result = await engineClient.scanAll();
      io.emit(SOCKET_EVENTS.SCAN_COMPLETE, {
        ...result,
        killzone: null,
        timestamp: new Date().toISOString(),
      });

      // Emit granular events per instrument
      const scanData = result.data as Record<string, unknown> | undefined;
      if (scanData && typeof scanData === 'object') {
        for (const [instrument, analysisData] of Object.entries(scanData)) {
          if (analysisData && typeof analysisData === 'object') {
            emitAnalysisResults(io, instrument, analysisData as Record<string, unknown>);
          }
        }
      }

      return result;
    });
  });
  tasks.push({ name: 'off-hour-scan', task: offHourScan, description: 'Scan every 10min outside killzones' });

  // ── Every 30 minutes — refresh news calendar ────────────
  const newsUpdate = cron.schedule('*/30 * * * *', async () => {
    await safeScan('news-calendar-refresh', io, async () => {
      const result = await engineClient.getNewsCalendar();
      io.emit(SOCKET_EVENTS.NEWS_UPDATE, {
        ...result,
        timestamp: new Date().toISOString(),
      });
      return result;
    });
  });
  tasks.push({ name: 'news-update', task: newsUpdate, description: 'Refresh news calendar every 30min' });

  // ── Every 5 minutes — killzone status broadcast ─────────
  const killzoneStatus = cron.schedule('*/5 * * * *', async () => {
    try {
      const kz = getActiveKillzone();
      const result = await engineClient.getKillzone();
      io.emit(SOCKET_EVENTS.KILLZONE_UPDATE, {
        ...result,
        active: kz !== null,
        name: kz?.name || null,
        timestamp: new Date().toISOString(),
      });

      // Also emit session:update event that the client listens for
      const killzoneData = typeof result.data === 'object' && result.data !== null
        ? result.data as Record<string, unknown>
        : {};
      emitSessionUpdate(io, {
        ...killzoneData,
        is_active: kz !== null,
        current_session: kz?.name || 'POST_SESSION',
      });
    } catch (error) {
      // Non-critical, just log
      console.warn('[SCHEDULER] Killzone status broadcast failed:', error instanceof Error ? error.message : error);
    }
  });
  tasks.push({ name: 'killzone-status', task: killzoneStatus, description: 'Broadcast killzone status every 5min' });

  // ── Midnight NY time — daily stats aggregation ──────────
  // Midnight NY = 05:00 UTC (EST) or 04:00 UTC (EDT)
  const dailyStats = cron.schedule('0 5 * * *', () => {
    console.log('[SCHEDULER] Running daily stats aggregation...');
    aggregateDailyStats();
  });
  tasks.push({ name: 'daily-stats', task: dailyStats, description: 'Aggregate daily stats at midnight NY' });

  // ── Every 6 hours — engine health check ─────────────────
  const engineHealth = cron.schedule('0 */6 * * *', async () => {
    const healthy = await engineClient.healthCheck();
    io.emit(SOCKET_EVENTS.ENGINE_STATUS, {
      connected: healthy,
      health: engineClient.getHealthStatus(),
      timestamp: new Date().toISOString(),
    });

    if (!healthy) {
      console.error('[SCHEDULER] Engine health check FAILED');
    }
  });
  tasks.push({ name: 'engine-health', task: engineHealth, description: 'Engine health check every 6h' });

  isRunning = true;
  console.log(`[SCHEDULER] Started ${tasks.length} scheduled tasks:`);
  for (const t of tasks) {
    console.log(`  - ${t.name}: ${t.description}`);
  }
}

// ── Stop all tasks ──────────────────────────────────────────

export function stopScheduler(): void {
  for (const { name, task } of tasks) {
    task.stop();
    console.log(`[SCHEDULER] Stopped: ${name}`);
  }
  tasks.length = 0;
  isRunning = false;
  engineClient.stopHealthMonitoring();
  console.log('[SCHEDULER] All tasks stopped');
}

// ── Get scheduler status ────────────────────────────────────

export function getSchedulerStatus(): SchedulerStatus {
  const kz = getActiveKillzone();
  return {
    running: isRunning,
    taskCount: tasks.length,
    lastScan,
    isKillzone: kz !== null,
    currentKillzone: kz?.name || null,
    totalScans,
    failedScans,
  };
}
