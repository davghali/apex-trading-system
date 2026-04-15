import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { env } from './config/env.js';
import { initDatabase, closeDatabase, checkDatabaseHealth, backupDatabase } from './config/database.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { setupSocket, cleanupSocket, getSocketStats } from './socket/handler.js';
import { startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler.js';
import { engineClient } from './services/engine-client.js';
import { getDedupeStats } from './services/notification.js';

// Routes
import analysisRouter from './routes/analysis.js';
import tradesRouter from './routes/trades.js';
import journalRouter from './routes/journal.js';
import alertsRouter from './routes/alerts.js';
import newsRouter from './routes/news.js';
import settingsRouter from './routes/settings.js';

// ── Global error handlers (NEVER crash) ─────────────────────

process.on('uncaughtException', (error: Error) => {
  console.error(`[FATAL] Uncaught exception at ${new Date().toISOString()}:`, error.message);
  console.error(error.stack);
  // Don't exit — keep the server running
});

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`[FATAL] Unhandled promise rejection at ${new Date().toISOString()}:`, msg);
  // Don't exit — keep the server running
});

// ── Initialize database ─────────────────────────────────────

try {
  initDatabase();
} catch (error) {
  console.error('[STARTUP] Database initialization failed:', error);
  process.exit(1); // Can't run without DB
}

// ── Express app ─────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// ── Socket.io ───────────────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB max payload
});

// ── Middleware ───────────────────────────────────────────────

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// ── Request timeout (30s) ───────────────────────────────────
app.use((_req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: true, message: 'Request timeout' });
    }
  });
  next();
});

// ── Health check (pings Python engine) ──────────────────────

app.get('/health', async (_req, res) => {
  try {
    const engineHealthy = await engineClient.healthCheck();
    const engineStatus = engineClient.getHealthStatus();
    const dbHealth = checkDatabaseHealth();
    const schedulerStatus = getSchedulerStatus();
    const socketStats = getSocketStats();
    const dedupeStats = getDedupeStats();

    const allHealthy = engineHealthy && dbHealth.healthy;

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
      engine: {
        connected: engineHealthy,
        latencyMs: engineStatus.latencyMs,
        consecutiveFailures: engineStatus.consecutiveFailures,
      },
      database: {
        healthy: dbHealth.healthy,
        sizeMB: Math.round(dbHealth.size / (1024 * 1024) * 100) / 100,
        walSizeMB: Math.round(dbHealth.walSize / (1024 * 1024) * 100) / 100,
        tables: dbHealth.tables,
      },
      scheduler: {
        running: schedulerStatus.running,
        tasks: schedulerStatus.taskCount,
        isKillzone: schedulerStatus.isKillzone,
        currentKillzone: schedulerStatus.currentKillzone,
        totalScans: schedulerStatus.totalScans,
        failedScans: schedulerStatus.failedScans,
      },
      websocket: {
        connectedClients: socketStats.connectedClients,
      },
      notifications: {
        dedupeCache: dedupeStats.size,
      },
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / (1024 * 1024) * 100) / 100,
        rssMB: Math.round(process.memoryUsage().rss / (1024 * 1024) * 100) / 100,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      status: 'error',
      message: msg,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Quick health (no engine ping — for load balancers) ──────

app.get('/health/quick', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// ── Backup endpoint ─────────────────────────────────────────

app.post('/api/backup', (_req, res) => {
  try {
    const backupPath = backupDatabase();
    res.json({ success: true, path: backupPath });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: true, message: `Backup failed: ${msg}` });
  }
});

// ── API Routes ──────────────────────────────────────────────

app.use('/api/analysis', analysisRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/journal', journalRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/news', newsRouter);
app.use('/api/settings', settingsRouter);

// ── Serve React build (production mode) ─────────────────────
{
  const { dirname, resolve, join } = await import('path');
  const { existsSync } = await import('fs');
  const { fileURLToPath: toPath } = await import('url');
  const here = dirname(toPath(import.meta.url));
  const dist = resolve(here, '..', '..', 'client', 'dist');
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(join(dist, 'index.html'));
    });
    console.log(`[STATIC] Serving frontend from ${dist}`);
  }
}

// ── Error handling ──────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ── Socket.io handlers ─────────────────────────────────────

setupSocket(io);

// ── Helper: format uptime ───────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

// ── Start server ────────────────────────────────────────────

httpServer.listen(env.NODE_PORT, () => {
  console.log('');
  console.log('='.repeat(55));
  console.log('  APEX ICT Trading System  --  Node Server');
  console.log('='.repeat(55));
  console.log(`  Port:      ${env.NODE_PORT}`);
  console.log(`  Engine:    ${env.ENGINE_URL}`);
  console.log(`  CORS:      ${env.CORS_ORIGIN}`);
  console.log(`  Env:       ${env.NODE_ENV}`);
  console.log(`  DB:        ${env.DB_PATH}`);
  console.log(`  PID:       ${process.pid}`);
  console.log('='.repeat(55));
  console.log('');

  // Start scheduler after server is up
  startScheduler(io);
});

// ── Graceful shutdown ───────────────────────────────────────

let isShuttingDown = false;

function shutdown(signal: string): void {
  if (isShuttingDown) {
    console.log(`[SERVER] Already shutting down, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  console.log(`\n[SERVER] ${signal} received at ${new Date().toISOString()}`);
  console.log('[SERVER] Starting graceful shutdown...');

  // 1. Stop accepting new connections
  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed');
  });

  // 2. Stop scheduler
  try {
    stopScheduler();
    console.log('[SERVER] Scheduler stopped');
  } catch (err) {
    console.error('[SERVER] Error stopping scheduler:', err);
  }

  // 3. Stop engine health monitoring
  try {
    engineClient.stopHealthMonitoring();
    console.log('[SERVER] Engine health monitoring stopped');
  } catch (err) {
    console.error('[SERVER] Error stopping engine monitoring:', err);
  }

  // 4. Clean up socket connections
  try {
    cleanupSocket();
    io.close();
    console.log('[SERVER] Socket.io closed');
  } catch (err) {
    console.error('[SERVER] Error closing sockets:', err);
  }

  // 5. Close database (with WAL checkpoint)
  try {
    closeDatabase();
    console.log('[SERVER] Database closed');
  } catch (err) {
    console.error('[SERVER] Error closing database:', err);
  }

  console.log('[SERVER] Graceful shutdown complete');
  process.exit(0);
}

// Force exit after 10 seconds
function forceShutdown(): void {
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => {
  forceShutdown();
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  forceShutdown();
  shutdown('SIGTERM');
});

export { app, io, httpServer };
