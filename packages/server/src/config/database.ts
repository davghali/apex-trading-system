import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Ensure DB directory exists ──────────────────────────────
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ── Create database connection ──────────────────────────────
const db = new Database(env.DB_PATH);

// ── Performance pragmas (WAL for concurrent reads) ──────────
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -16000');  // 16MB cache
db.pragma('busy_timeout = 5000');  // 5s busy timeout for concurrent access
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

// ── Migration system ────────────────────────────────────────

interface MigrationRecord {
  version: number;
}

function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getCurrentVersion(): number {
  const row = db.prepare(
    'SELECT MAX(version) as version FROM _migrations'
  ).get() as MigrationRecord | undefined;
  return row?.version ?? 0;
}

interface MigrationDef {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: MigrationDef[] = [
  {
    version: 1,
    name: 'add_pnl_pips_to_trades',
    sql: `ALTER TABLE trades ADD COLUMN pnl_pips REAL`,
  },
  {
    version: 2,
    name: 'add_screenshot_url_to_trades',
    sql: `ALTER TABLE trades ADD COLUMN screenshot_url TEXT`,
  },
  {
    version: 3,
    name: 'add_acknowledged_at_to_alerts',
    sql: `ALTER TABLE alerts ADD COLUMN acknowledged_at TEXT`,
  },
  {
    version: 4,
    name: 'add_daily_stats_extras',
    sql: `
      ALTER TABLE daily_stats ADD COLUMN profit_factor REAL DEFAULT 0;
      ALTER TABLE daily_stats ADD COLUMN win_rate REAL DEFAULT 0
    `,
  },
  {
    version: 5,
    name: 'create_scheduler_runs',
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_scheduler_runs_task ON scheduler_runs(task_name, started_at DESC)
    `,
  },
];

function runMigrations(): void {
  ensureMigrationsTable();
  const currentVersion = getCurrentVersion();

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) {
    return;
  }

  console.log(`[DB] Running ${pending.length} migration(s)...`);

  const runMigration = db.transaction((migration: MigrationDef) => {
    const statements = migration.sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch (err) {
        // Ignore "duplicate column" errors for idempotent migrations
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('duplicate column name') || msg.includes('already exists')) {
          console.log(`[DB] Migration ${migration.version}: already applied, skipping`);
        } else {
          console.warn(`[DB] Migration ${migration.version} warning: ${msg}`);
        }
      }
    }

    db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
      migration.version,
      migration.name
    );
    console.log(`[DB] Applied migration ${migration.version}: ${migration.name}`);
  });

  for (const migration of pending) {
    runMigration(migration);
  }
}

// ── Initialize database ─────────────────────────────────────
export function initDatabase(): void {
  try {
    // Run base schema
    const schemaPath = path.resolve(__dirname, '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the entire schema at once — db.exec handles multiple statements natively
    db.exec(schema);

    // Run incremental migrations
    runMigrations();

    console.log(`[DB] SQLite database initialized at ${env.DB_PATH}`);
    console.log(`[DB] WAL mode: ${db.pragma('journal_mode', { simple: true })}`);
  } catch (error) {
    console.error('[DB] FATAL: Failed to initialize database:', error);
    throw error;
  }
}

// ── Health check ────────────────────────────────────────────
export function checkDatabaseHealth(): {
  healthy: boolean;
  size: number;
  walSize: number;
  tables: number;
} {
  try {
    // Quick integrity check (not full — too slow for production)
    const integrityResult = db.pragma('quick_check') as Array<{ quick_check: string }>;
    const healthy = integrityResult[0]?.quick_check === 'ok';

    // Get file sizes
    const stats = fs.statSync(env.DB_PATH);
    const walPath = env.DB_PATH + '-wal';
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    // Count tables
    const tableCount = db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%'"
    ).get() as { count: number };

    return {
      healthy,
      size: stats.size,
      walSize,
      tables: tableCount.count,
    };
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return { healthy: false, size: 0, walSize: 0, tables: 0 };
  }
}

// ── Backup ──────────────────────────────────────────────────
export function backupDatabase(targetPath?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(dbDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = targetPath || path.join(backupDir, `apex-${timestamp}.db`);

  try {
    db.backup(backupPath);
    console.log(`[DB] Backup created: ${backupPath}`);

    // Clean old backups (keep last 10)
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .sort()
      .reverse();

    for (const old of backups.slice(10)) {
      fs.unlinkSync(path.join(backupDir, old));
      console.log(`[DB] Removed old backup: ${old}`);
    }

    return backupPath;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DB] Backup failed: ${msg}`);
    throw error;
  }
}

// ── WAL checkpoint (flush WAL to main DB) ───────────────────
export function checkpoint(): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[DB] WAL checkpoint completed');
  } catch (error) {
    console.error('[DB] WAL checkpoint failed:', error);
  }
}

// ── Clean shutdown ──────────────────────────────────────────
export function closeDatabase(): void {
  try {
    checkpoint();
    db.close();
    console.log('[DB] Database connection closed');
  } catch (error) {
    console.error('[DB] Error closing database:', error);
  }
}

export { db };
