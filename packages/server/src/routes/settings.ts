import { Router, type Request, type Response } from 'express';
import { db } from '../config/database.js';
import { testConnection, getRateLimitStatus } from '../services/telegram.js';

const router = Router();

// ── Default settings ────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, unknown> = {
  // Trading config
  default_risk_percent: 1,
  max_daily_risk_percent: 3,
  max_daily_trades: 3,
  default_instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NQ', 'ES'],

  // Notifications
  telegram_enabled: false,
  telegram_critical_only: false,
  websocket_enabled: true,

  // Display
  timezone: 'America/New_York',
  currency: 'USD',
  theme: 'dark',

  // Scheduler
  scan_interval_killzone: 2,
  scan_interval_offhour: 10,

  // Risk management
  daily_loss_limit: 500,
  max_position_size: 10,
  require_confluence_min: 60,
};

// ── Validation rules ────────────────────────────────────────

interface ValidationRule {
  type: 'number' | 'string' | 'boolean' | 'array';
  min?: number;
  max?: number;
  allowed?: string[];
}

const VALIDATION_RULES: Record<string, ValidationRule> = {
  default_risk_percent: { type: 'number', min: 0.1, max: 10 },
  max_daily_risk_percent: { type: 'number', min: 0.5, max: 20 },
  max_daily_trades: { type: 'number', min: 1, max: 50 },
  default_instruments: { type: 'array' },
  telegram_enabled: { type: 'boolean' },
  telegram_critical_only: { type: 'boolean' },
  websocket_enabled: { type: 'boolean' },
  timezone: { type: 'string' },
  currency: { type: 'string', allowed: ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] },
  theme: { type: 'string', allowed: ['dark', 'light', 'system'] },
  scan_interval_killzone: { type: 'number', min: 1, max: 30 },
  scan_interval_offhour: { type: 'number', min: 5, max: 60 },
  daily_loss_limit: { type: 'number', min: 0, max: 100000 },
  max_position_size: { type: 'number', min: 0.01, max: 1000 },
  require_confluence_min: { type: 'number', min: 0, max: 100 },
};

function validateSetting(key: string, value: unknown): string | null {
  const rule = VALIDATION_RULES[key];
  if (!rule) return null; // Unknown settings are allowed (extensible)

  switch (rule.type) {
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return `${key} must be a number`;
      }
      if (rule.min !== undefined && value < rule.min) {
        return `${key} must be >= ${rule.min}`;
      }
      if (rule.max !== undefined && value > rule.max) {
        return `${key} must be <= ${rule.max}`;
      }
      break;

    case 'string':
      if (typeof value !== 'string') {
        return `${key} must be a string`;
      }
      if (rule.allowed && !rule.allowed.includes(value)) {
        return `${key} must be one of: ${rule.allowed.join(', ')}`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return `${key} must be an array`;
      }
      break;
  }

  return null;
}

// ── GET /api/settings — Get all settings (with defaults) ────
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT key, value, updated_at FROM settings').all() as Array<{
      key: string;
      value: string;
      updated_at: string;
    }>;

    // Start with defaults
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };

    // Override with stored values
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    res.json(settings);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SETTINGS] GET / failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch settings' });
  }
});

// ── GET /api/settings/:key — Get single setting ─────────────
router.get('/:key', (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;

    if (row) {
      try {
        res.json({ key, value: JSON.parse(row.value) });
      } catch {
        res.json({ key, value: row.value });
      }
      return;
    }

    // Check defaults
    if (key in DEFAULT_SETTINGS) {
      res.json({ key, value: DEFAULT_SETTINGS[key], default: true });
      return;
    }

    res.status(404).json({ error: true, message: `Setting "${key}" not found` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SETTINGS] GET /${req.params.key} failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to fetch setting' });
  }
});

// ── PUT /api/settings — Update settings (accepts key-value pairs)
router.put('/', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      res.status(400).json({ error: true, message: 'Request body must be a non-empty object' });
      return;
    }

    // Validate all values before writing
    const errors: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      const error = validateSetting(key, value);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      res.status(400).json({ error: true, message: 'Validation failed', errors });
      return;
    }

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(body)) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        upsert.run(key, serialized);
      }
    });

    transaction();

    console.log(`[SETTINGS] Updated ${Object.keys(body).length} setting(s): ${Object.keys(body).join(', ')}`);
    res.json({ success: true, message: 'Settings updated', keys: Object.keys(body) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SETTINGS] PUT / failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to update settings' });
  }
});

// ── POST /api/settings/telegram/test — Test Telegram connection
router.post('/telegram/test', async (_req: Request, res: Response) => {
  try {
    const result = await testConnection();
    const rateLimit = getRateLimitStatus();

    res.json({
      ...result,
      rateLimit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SETTINGS] Telegram test failed: ${msg}`);
    res.status(500).json({
      success: false,
      message: `Telegram test failed: ${msg}`,
    });
  }
});

// ── POST /api/settings/reset — Reset to defaults ────────────
router.post('/reset', (_req: Request, res: Response) => {
  try {
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        upsert.run(key, JSON.stringify(value));
      }
    });

    transaction();

    console.log('[SETTINGS] Reset all settings to defaults');
    res.json({ success: true, message: 'Settings reset to defaults' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SETTINGS] Reset failed: ${msg}`);
    res.status(500).json({ error: true, message: 'Failed to reset settings' });
  }
});

export default router;
