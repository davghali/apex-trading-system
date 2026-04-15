import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.js';

const router = Router();

// ── Types ───────────────────────────────────────────────────

interface AlertRow {
  id: number;
  instrument: string | null;
  alert_type: string;
  priority: string;
  title: string;
  message: string;
  metadata: string;
  sent_telegram: number;
  sent_web: number;
  acknowledged: number;
  created_at: string;
  acknowledged_at: string | null;
}

// ── Helper: parse alert row ─────────────────────────────────

function parseAlertRow(row: AlertRow): Record<string, unknown> {
  let metadata = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
  } catch {
    metadata = {};
  }

  return {
    ...row,
    metadata,
    sent_telegram: Boolean(row.sent_telegram),
    sent_web: Boolean(row.sent_web),
    acknowledged: Boolean(row.acknowledged),
  };
}

// ── GET /api/alerts — List alerts with advanced filtering ───
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      acknowledged,
      priority,
      instrument,
      alert_type,
      from,
      to,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: unknown[] = [];

    if (acknowledged !== undefined) {
      query += ' AND acknowledged = ?';
      params.push(acknowledged === 'true' ? 1 : 0);
    }

    if (priority) {
      // Support comma-separated priorities: "high,critical"
      const priorities = (priority as string).split(',').map((p) => p.trim());
      query += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
      params.push(...priorities);
    }

    if (instrument) {
      query += ' AND instrument = ?';
      params.push((instrument as string).toUpperCase());
    }

    if (alert_type) {
      query += ' AND alert_type = ?';
      params.push(alert_type);
    }

    if (from) {
      query += ' AND created_at >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND created_at <= ?';
      params.push(to);
    }

    const parsedLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
    const parsedOffset = Math.max(0, Number(offset) || 0);

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parsedLimit, parsedOffset);

    const alerts = db.prepare(query).all(...params) as AlertRow[];
    const parsed = alerts.map(parseAlertRow);

    // Unacknowledged count
    const unackCount = db.prepare(
      'SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0'
    ).get() as { count: number };

    res.json({
      alerts: parsed,
      count: parsed.length,
      unacknowledged: unackCount.count,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] GET / failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch alerts' });
  }
});

// ── GET /api/alerts/:id — Get single alert ──────────────────
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid alert ID' });
      return;
    }

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined;
    if (!alert) {
      res.status(404).json({ error: true, message: 'Alert not found' });
      return;
    }

    res.json(parseAlertRow(alert));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] GET /${req.params.id} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch alert' });
  }
});

// ── POST /api/alerts/:id/acknowledge — Acknowledge single alert
router.post('/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: true, message: 'Invalid alert ID' });
      return;
    }

    const existing = db.prepare('SELECT id FROM alerts WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: true, message: 'Alert not found' });
      return;
    }

    db.prepare(
      "UPDATE alerts SET acknowledged = 1, acknowledged_at = datetime('now') WHERE id = ?"
    ).run(id);

    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] Acknowledge /${req.params.id} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to acknowledge alert' });
  }
});

// ── POST /api/alerts/acknowledge-bulk — Bulk acknowledge ────
router.post('/acknowledge-bulk', (req: Request, res: Response) => {
  try {
    const { ids, all } = req.body as { ids?: number[]; all?: boolean };

    if (all) {
      const result = db.prepare(
        "UPDATE alerts SET acknowledged = 1, acknowledged_at = datetime('now') WHERE acknowledged = 0"
      ).run();

      res.json({
        success: true,
        message: `Acknowledged ${result.changes} alert(s)`,
        count: result.changes,
      });
      return;
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: true, message: 'Provide "ids" array or set "all" to true' });
      return;
    }

    if (ids.length > 100) {
      res.status(400).json({ error: true, message: 'Maximum 100 alerts per bulk operation' });
      return;
    }

    // Validate all IDs are numbers
    if (ids.some((id) => typeof id !== 'number' || id <= 0)) {
      res.status(400).json({ error: true, message: 'All IDs must be positive numbers' });
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(
      `UPDATE alerts SET acknowledged = 1, acknowledged_at = datetime('now') WHERE id IN (${placeholders}) AND acknowledged = 0`
    ).run(...ids);

    res.json({
      success: true,
      message: `Acknowledged ${result.changes} alert(s)`,
      count: result.changes,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] Bulk acknowledge failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to bulk acknowledge alerts' });
  }
});

// ── DELETE /api/alerts/cleanup — Auto-cleanup old acknowledged alerts (>7 days)
router.delete('/cleanup', (_req: Request, res: Response) => {
  try {
    const result = db.prepare(
      "DELETE FROM alerts WHERE acknowledged = 1 AND acknowledged_at < datetime('now', '-7 days')"
    ).run();

    res.json({
      success: true,
      message: `Cleaned up ${result.changes} old acknowledged alert(s)`,
      deleted: result.changes,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] Cleanup failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to cleanup old alerts' });
  }
});

// ── DELETE /api/alerts/clear — Clear all acknowledged alerts ─
router.delete('/clear', (_req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM alerts WHERE acknowledged = 1').run();
    res.json({
      success: true,
      message: `Cleared ${result.changes} acknowledged alert(s)`,
      deleted: result.changes,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] Clear failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to clear alerts' });
  }
});

// ── GET /api/alerts/stats — Alert statistics ────────────────
router.get('/stats/summary', (_req: Request, res: Response) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM alerts').get() as { count: number };
    const unack = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0').get() as { count: number };
    const critical = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE priority = 'critical' AND acknowledged = 0").get() as { count: number };
    const high = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE priority = 'high' AND acknowledged = 0").get() as { count: number };

    const todayCount = db.prepare(
      "SELECT COUNT(*) as count FROM alerts WHERE date(created_at) = date('now')"
    ).get() as { count: number };

    res.json({
      total: total.count,
      unacknowledged: unack.count,
      critical_unack: critical.count,
      high_unack: high.count,
      today: todayCount.count,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ALERTS] Stats failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to get alert stats' });
  }
});

export default router;
