import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../socket/events.js';
import { sendAlert as sendTelegramAlert } from './telegram.js';
import { db } from '../config/database.js';

// ── Types ───────────────────────────────────────────────────

interface Alert {
  id?: number;
  instrument?: string;
  alert_type: string;
  priority: string;
  title: string;
  message: string;
  metadata?: string;
}

type Priority = 'critical' | 'high' | 'medium' | 'low';

// ── Deduplication ───────────────────────────────────────────

interface DedupeEntry {
  hash: string;
  timestamp: number;
}

const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const dedupeCache: Map<string, DedupeEntry> = new Map();

function computeDedupeHash(alert: Alert): string {
  // Hash based on type + instrument + priority + title
  const parts = [
    alert.alert_type,
    alert.instrument || '',
    alert.priority,
    alert.title,
  ];
  return parts.join('|');
}

function isDuplicate(alert: Alert): boolean {
  const hash = computeDedupeHash(alert);
  const existing = dedupeCache.get(hash);

  if (!existing) return false;

  const age = Date.now() - existing.timestamp;
  if (age > DEDUPE_WINDOW_MS) {
    dedupeCache.delete(hash);
    return false;
  }

  return true;
}

function recordAlert(alert: Alert): void {
  const hash = computeDedupeHash(alert);
  dedupeCache.set(hash, { hash, timestamp: Date.now() });

  // Cleanup stale entries every 100 inserts
  if (dedupeCache.size > 100) {
    const now = Date.now();
    for (const [key, entry] of dedupeCache) {
      if (now - entry.timestamp > DEDUPE_WINDOW_MS) {
        dedupeCache.delete(key);
      }
    }
  }
}

// ── Priority routing ────────────────────────────────────────
//
// CRITICAL -> Telegram + WebSocket (always)
// HIGH     -> WebSocket + optional Telegram (if not rate limited)
// MEDIUM   -> WebSocket only
// LOW      -> WebSocket only

function shouldSendTelegram(priority: Priority): boolean {
  switch (priority) {
    case 'critical':
      return true;
    case 'high':
      return true;
    case 'medium':
    case 'low':
    default:
      return false;
  }
}

// ── Main notify function ────────────────────────────────────

export async function notify(alert: Alert, io: Server): Promise<void> {
  try {
    // Check deduplication
    if (isDuplicate(alert)) {
      console.log(
        `[NOTIFY] Dedup: skipping duplicate alert "${alert.title}" (within ${DEDUPE_WINDOW_MS / 1000}s window)`
      );
      return;
    }

    // Record for future dedup checks
    recordAlert(alert);

    // 1. Always emit via WebSocket to all connected clients
    io.emit(SOCKET_EVENTS.ALERT_NEW, {
      ...alert,
      timestamp: new Date().toISOString(),
    });

    if (alert.id) {
      try {
        db.prepare('UPDATE alerts SET sent_web = 1 WHERE id = ?').run(alert.id);
      } catch (err) {
        console.error('[NOTIFY] Failed to update sent_web:', err);
      }
    }

    // 2. Send via Telegram based on priority routing
    const priority = alert.priority as Priority;
    if (shouldSendTelegram(priority)) {
      try {
        const sent = await sendTelegramAlert(alert);
        if (sent && alert.id) {
          db.prepare('UPDATE alerts SET sent_telegram = 1 WHERE id = ?').run(alert.id);
        }
      } catch (err) {
        console.error('[NOTIFY] Telegram send failed:', err);
        // Don't throw - WebSocket already sent
      }
    }

    console.log(
      `[NOTIFY] Alert dispatched: [${alert.priority.toUpperCase()}] ${alert.title}` +
      (shouldSendTelegram(priority) ? ' (+ Telegram)' : ' (WebSocket only)')
    );
  } catch (error) {
    console.error('[NOTIFY] Fatal error in notify:', error);
  }
}

// ── Create, save to DB, and notify ──────────────────────────

export function createAndNotify(
  alertData: Omit<Alert, 'id'>,
  io: Server
): number {
  try {
    const stmt = db.prepare(`
      INSERT INTO alerts (instrument, alert_type, priority, title, message, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      alertData.instrument || null,
      alertData.alert_type,
      alertData.priority,
      alertData.title,
      alertData.message,
      alertData.metadata || '{}'
    );

    const alertId = result.lastInsertRowid as number;

    const alert: Alert = {
      ...alertData,
      id: alertId,
    };

    // Fire and forget - notify should never crash the caller
    notify(alert, io).catch((err) => {
      console.error('[NOTIFY] Failed to dispatch alert:', err);
    });

    return alertId;
  } catch (error) {
    console.error('[NOTIFY] Failed to create alert:', error);
    return -1;
  }
}

// ── Batch notify (for scan results) ─────────────────────────

export async function notifyBatch(
  alerts: Omit<Alert, 'id'>[],
  io: Server
): Promise<number> {
  let sent = 0;

  for (const alertData of alerts) {
    const id = createAndNotify(alertData, io);
    if (id > 0) sent++;
  }

  if (sent > 0) {
    console.log(`[NOTIFY] Batch: dispatched ${sent}/${alerts.length} alerts`);
  }

  return sent;
}

// ── Get dedupe stats ────────────────────────────────────────

export function getDedupeStats(): { size: number; windowMs: number } {
  return {
    size: dedupeCache.size,
    windowMs: DEDUPE_WINDOW_MS,
  };
}
