-- APEX Trading System — SQLite Schema
-- Production-grade with proper indexes, views, and constraints

-- ============================================================
-- CANDLES
-- ============================================================
CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL DEFAULT 0,
  UNIQUE(instrument, timeframe, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(instrument, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_instrument_ts ON candles(instrument, timestamp DESC);

-- ============================================================
-- POINTS OF INTEREST
-- ============================================================
CREATE TABLE IF NOT EXISTS pois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  poi_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  price_high REAL NOT NULL,
  price_low REAL NOT NULL,
  formation_time INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pois_instrument ON pois(instrument, timeframe, status);
CREATE INDEX IF NOT EXISTS idx_pois_status ON pois(status);
CREATE INDEX IF NOT EXISTS idx_pois_instrument_active ON pois(instrument, status) WHERE status = 'active';

-- ============================================================
-- STRUCTURE EVENTS (BOS / CHoCH / SMS)
-- ============================================================
CREATE TABLE IF NOT EXISTS structure_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  price REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_structure_instrument ON structure_events(instrument, timeframe);
CREATE INDEX IF NOT EXISTS idx_structure_ts ON structure_events(instrument, timestamp DESC);

-- ============================================================
-- TRADES
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL,
  exit_price REAL,
  position_size REAL NOT NULL,
  risk_amount REAL NOT NULL,
  pnl REAL,
  pnl_pips REAL,
  rr_achieved REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'cancelled')),
  entry_time TEXT NOT NULL DEFAULT (datetime('now')),
  exit_time TEXT,
  killzone TEXT,
  setup_type TEXT,
  confluence_score REAL,
  notes TEXT,
  tags TEXT DEFAULT '[]',
  bias_at_entry TEXT,
  screenshot_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument, entry_time);
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_exit_time ON trades(exit_time DESC) WHERE exit_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_setup_type ON trades(setup_type) WHERE setup_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_killzone ON trades(killzone) WHERE killzone IS NOT NULL;

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT,
  alert_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  sent_telegram INTEGER DEFAULT 0,
  sent_web INTEGER DEFAULT 0,
  acknowledged INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts(acknowledged, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_instrument ON alerts(instrument, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority, acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

-- ============================================================
-- DAILY STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  trades_taken INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  gross_pnl REAL DEFAULT 0,
  net_pnl REAL DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  avg_rr REAL DEFAULT 0,
  best_trade REAL DEFAULT 0,
  worst_trade REAL DEFAULT 0,
  profit_factor REAL DEFAULT 0,
  win_rate REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- ============================================================
-- SETTINGS (Key-Value store)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ANALYSIS CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument TEXT NOT NULL,
  analysis_type TEXT NOT NULL,
  timeframe TEXT,
  result TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_lookup ON analysis_cache(instrument, analysis_type, timeframe);
CREATE INDEX IF NOT EXISTS idx_cache_expiry ON analysis_cache(expires_at);

-- ============================================================
-- SCHEDULER STATE (track scan history)
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'failed', 'skipped')),
  result_summary TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_task ON scheduler_runs(task_name, started_at DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- Daily summary view (auto-computed from trades)
CREATE VIEW IF NOT EXISTS v_daily_summary AS
SELECT
  date(exit_time) AS trade_date,
  COUNT(*) AS trades_taken,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr,
  ROUND(MAX(pnl), 2) AS best_trade,
  ROUND(MIN(pnl), 2) AS worst_trade,
  ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 2) AS gross_profit,
  ROUND(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 2) AS gross_loss
FROM trades
WHERE status = 'closed' AND exit_time IS NOT NULL
GROUP BY date(exit_time)
ORDER BY trade_date DESC;

-- Weekly summary view
CREATE VIEW IF NOT EXISTS v_weekly_summary AS
SELECT
  strftime('%Y-W%W', exit_time) AS trade_week,
  COUNT(*) AS trades_taken,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr,
  ROUND(MAX(pnl), 2) AS best_trade,
  ROUND(MIN(pnl), 2) AS worst_trade
FROM trades
WHERE status = 'closed' AND exit_time IS NOT NULL
GROUP BY strftime('%Y-W%W', exit_time)
ORDER BY trade_week DESC;

-- Monthly summary view
CREATE VIEW IF NOT EXISTS v_monthly_summary AS
SELECT
  strftime('%Y-%m', exit_time) AS trade_month,
  COUNT(*) AS trades_taken,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr,
  ROUND(MAX(pnl), 2) AS best_trade,
  ROUND(MIN(pnl), 2) AS worst_trade
FROM trades
WHERE status = 'closed' AND exit_time IS NOT NULL
GROUP BY strftime('%Y-%m', exit_time)
ORDER BY trade_month DESC;

-- Instrument performance view
CREATE VIEW IF NOT EXISTS v_instrument_stats AS
SELECT
  instrument,
  COUNT(*) AS total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(pnl), 2) AS avg_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr
FROM trades
WHERE status = 'closed'
GROUP BY instrument
ORDER BY total_pnl DESC;

-- Setup type performance view
CREATE VIEW IF NOT EXISTS v_setup_stats AS
SELECT
  COALESCE(setup_type, 'untagged') AS setup_type,
  COUNT(*) AS total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr
FROM trades
WHERE status = 'closed'
GROUP BY setup_type
ORDER BY total_pnl DESC;

-- Killzone performance view
CREATE VIEW IF NOT EXISTS v_killzone_stats AS
SELECT
  COALESCE(killzone, 'unknown') AS killzone,
  COUNT(*) AS total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 2) AS win_rate,
  ROUND(SUM(pnl), 2) AS total_pnl,
  ROUND(AVG(rr_achieved), 2) AS avg_rr
FROM trades
WHERE status = 'closed'
GROUP BY killzone
ORDER BY total_pnl DESC;
