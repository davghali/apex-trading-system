import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from './events.js';
import { engineClient } from '../services/engine-client.js';

// ── Types ───────────────────────────────────────────────────

interface ClientInfo {
  id: string;
  connectedAt: number;
  lastPing: number;
  subscriptions: Set<string>;
}

// ── State ───────────────────────────────────────────────────

const connectedClients: Map<string, ClientInfo> = new Map();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// ── Setup socket handlers ───────────────────────────────────

export function setupSocket(io: Server): void {
  // ── Heartbeat: check all clients every 30s ──────────────
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = 120_000; // 2 minutes

    for (const [socketId, client] of connectedClients) {
      if (now - client.lastPing > staleThreshold) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          console.log(`[WS] Disconnecting stale client: ${socketId}`);
          socket.disconnect(true);
        }
        connectedClients.delete(socketId);
      }
    }
  }, 30_000);

  // ── Connection handler ──────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const clientInfo: ClientInfo = {
      id: socket.id,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      subscriptions: new Set(),
    };

    connectedClients.set(socket.id, clientInfo);

    console.log(
      `[WS] Client connected: ${socket.id} (total: ${connectedClients.size})`
    );

    // Send connection acknowledgment
    socket.emit(SOCKET_EVENTS.CONNECTION_ACK, {
      id: socket.id,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    });

    // ── Ping/Pong heartbeat ─────────────────────────────
    socket.on(SOCKET_EVENTS.PING, () => {
      try {
        const client = connectedClients.get(socket.id);
        if (client) {
          client.lastPing = Date.now();
        }
        socket.emit(SOCKET_EVENTS.PONG, {
          timestamp: Date.now(),
          serverTime: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[WS] Ping handler error for ${socket.id}:`, err);
      }
    });

    // ── Subscribe to instrument room ────────────────────
    socket.on(SOCKET_EVENTS.SUBSCRIBE_INSTRUMENT, (instrument: string) => {
      try {
        if (!instrument || typeof instrument !== 'string') {
          socket.emit(SOCKET_EVENTS.SERVER_ERROR, {
            error: 'Invalid instrument for subscription',
          });
          return;
        }

        const normalized = instrument.toUpperCase().trim();
        const room = `instrument:${normalized}`;

        socket.join(room);
        clientInfo.subscriptions.add(normalized);

        console.log(
          `[WS] ${socket.id} subscribed to ${normalized} ` +
          `(${clientInfo.subscriptions.size} total subs)`
        );

        // Send current engine status for the instrument
        socket.emit(SOCKET_EVENTS.ENGINE_STATUS, {
          connected: engineClient.getHealthStatus().connected,
          instrument: normalized,
        });
      } catch (err) {
        console.error(`[WS] Subscribe error for ${socket.id}:`, err);
        socket.emit(SOCKET_EVENTS.SERVER_ERROR, {
          error: 'Failed to subscribe to instrument',
        });
      }
    });

    // ── Unsubscribe from instrument room ────────────────
    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_INSTRUMENT, (instrument: string) => {
      try {
        if (!instrument || typeof instrument !== 'string') return;

        const normalized = instrument.toUpperCase().trim();
        const room = `instrument:${normalized}`;

        socket.leave(room);
        clientInfo.subscriptions.delete(normalized);

        console.log(
          `[WS] ${socket.id} unsubscribed from ${normalized} ` +
          `(${clientInfo.subscriptions.size} remaining subs)`
        );
      } catch (err) {
        console.error(`[WS] Unsubscribe error for ${socket.id}:`, err);
      }
    });

    // ── Request analysis for instrument ─────────────────
    socket.on(SOCKET_EVENTS.REQUEST_ANALYSIS, async (instrument: string) => {
      try {
        if (!instrument || typeof instrument !== 'string') {
          socket.emit(SOCKET_EVENTS.ANALYSIS_ERROR, {
            instrument: instrument || 'unknown',
            error: 'Invalid instrument',
          });
          return;
        }

        const normalized = instrument.toUpperCase().trim();
        console.log(`[WS] Analysis requested for ${normalized} by ${socket.id}`);

        const result = await engineClient.analyze(normalized);

        // Send to requesting client
        socket.emit(SOCKET_EVENTS.ANALYSIS_RESULT, {
          instrument: normalized,
          data: result.data,
          cached: result.cached,
          cacheAge: result.cacheAge,
          warning: result.warning,
          timestamp: new Date().toISOString(),
        });

        // Also broadcast to instrument room subscribers
        socket.to(`instrument:${normalized}`).emit(SOCKET_EVENTS.ANALYSIS_RESULT, {
          instrument: normalized,
          data: result.data,
          cached: result.cached,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Analysis failed';
        console.error(`[WS] Analysis error for ${instrument}: ${message}`);
        socket.emit(SOCKET_EVENTS.ANALYSIS_ERROR, {
          instrument: instrument || 'unknown',
          error: message,
        });
      }
    });

    // ── Request killzone status ─────────────────────────
    socket.on(SOCKET_EVENTS.REQUEST_KILLZONE, async () => {
      try {
        const result = await engineClient.getKillzone();
        const killzoneData = typeof result.data === 'object' && result.data !== null
          ? result.data as Record<string, unknown>
          : { data: result.data };
        socket.emit(SOCKET_EVENTS.KILLZONE_UPDATE, {
          ...killzoneData,
          cached: result.cached,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Killzone fetch failed';
        socket.emit(SOCKET_EVENTS.SERVER_ERROR, { error: message });
      }
    });

    // ── Disconnect handler ──────────────────────────────
    socket.on('disconnect', (reason: string) => {
      const client = connectedClients.get(socket.id);
      const duration = client
        ? Math.round((Date.now() - client.connectedAt) / 1000)
        : 0;

      connectedClients.delete(socket.id);

      console.log(
        `[WS] Client disconnected: ${socket.id} (${reason}) ` +
        `after ${duration}s (remaining: ${connectedClients.size})`
      );
    });

    // ── Catch-all error handler ─────────────────────────
    socket.on('error', (error: Error) => {
      console.error(`[WS] Socket error for ${socket.id}:`, error.message);
    });
  });

  console.log('[WS] Socket.io handlers initialized');
}

// ── Public broadcast functions ──────────────────────────────

export function emitToInstrument(
  io: Server,
  instrument: string,
  event: string,
  data: unknown
): void {
  try {
    const room = `instrument:${instrument.toUpperCase()}`;
    const payload = typeof data === 'object' && data !== null
      ? data as Record<string, unknown>
      : { data };
    io.to(room).emit(event, {
      ...payload,
      instrument: instrument.toUpperCase(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[WS] emitToInstrument error:`, err);
  }
}

export function broadcastAlert(io: Server, alert: unknown): void {
  try {
    io.emit(SOCKET_EVENTS.ALERT_NEW, alert);
  } catch (err) {
    console.error(`[WS] broadcastAlert error:`, err);
  }
}

export function broadcastScanResults(io: Server, results: unknown): void {
  try {
    io.emit(SOCKET_EVENTS.SCAN_COMPLETE, results);
  } catch (err) {
    console.error(`[WS] broadcastScanResults error:`, err);
  }
}

/**
 * Decompose full analysis results into granular socket events
 * that the client listens for (bias:weekly, structure:update, etc.)
 */
export function emitAnalysisResults(
  io: Server,
  instrument: string,
  data: Record<string, unknown>
): void {
  try {
    const room = `instrument:${instrument.toUpperCase()}`;
    const ts = new Date().toISOString();

    // Price update
    if (typeof data.current_price === 'number') {
      io.to(room).emit(SOCKET_EVENTS.PRICE_UPDATE, {
        price: data.current_price,
        instrument: instrument.toUpperCase(),
        timestamp: ts,
      });
    }

    // Bias updates
    const bias = data.bias as Record<string, unknown> | undefined;
    if (bias) {
      if (bias.weekly) {
        io.to(room).emit(SOCKET_EVENTS.BIAS_WEEKLY, bias.weekly);
      }
      if (bias.daily) {
        io.to(room).emit(SOCKET_EVENTS.BIAS_DAILY, bias.daily);
      }
      if (bias.po3) {
        io.to(room).emit(SOCKET_EVENTS.BIAS_PO3, bias.po3);
      }
    }

    // Structure update
    const structure = data.structure as Record<string, unknown> | undefined;
    if (structure) {
      io.to(room).emit(SOCKET_EVENTS.STRUCTURE_UPDATE, {
        structures: structure.structures || {},
        alignment: structure.alignment || {},
        timestamp: ts,
      });
    }

    // POI update
    const pois = data.pois as Record<string, unknown> | undefined;
    if (pois) {
      io.to(room).emit(SOCKET_EVENTS.POI_UPDATE, {
        pois: pois.pois || [],
        liquidityMap: pois.liquidity_map || {},
        timestamp: ts,
      });
    }

    // Session update
    const session = data.session as Record<string, unknown> | undefined;
    if (session) {
      io.to(room).emit(SOCKET_EVENTS.SESSION_UPDATE, {
        current: {
          name: session.current_session || 'NONE',
          active: session.is_active || false,
          timeRemaining: session.time_remaining || 0,
          progress: session.progress || 0,
        },
        nyTime: session.ny_time || '',
        timestamp: ts,
      });
    }

    // Confluence update
    if (data.confluence) {
      io.to(room).emit(SOCKET_EVENTS.CONFLUENCE_UPDATE, data.confluence);
    }

    // Entry signal
    if (data.entry) {
      io.to(room).emit(SOCKET_EVENTS.ENTRY_SIGNAL, data.entry);
    }

    // DXY update
    const dxy = data.dxy as Record<string, unknown> | undefined;
    if (dxy) {
      io.to(room).emit(SOCKET_EVENTS.DXY_UPDATE, {
        trend: dxy.dxy_structure,
        correlation: dxy.eurusd_confirms ? 'CONFIRMS' : 'DIVERGES',
        correlationScore: dxy.eurusd_confluence_points || 0,
        smt: dxy.smt || null,
        timestamp: ts,
      });
    }

    // News update
    const news = data.news as Record<string, unknown> | undefined;
    if (news) {
      io.to(room).emit(SOCKET_EVENTS.NEWS_UPDATE, {
        safety: news.safe_to_trade ? 'SAFE' : news.status === 'CAUTION' ? 'CAUTION' : 'DANGER',
        events: news.events || [],
        timestamp: ts,
      });
    }
  } catch (err) {
    console.error('[WS] emitAnalysisResults error:', err);
  }
}

/**
 * Emit session/killzone status to all connected clients.
 */
export function emitSessionUpdate(
  io: Server,
  sessionData: Record<string, unknown>
): void {
  try {
    io.emit(SOCKET_EVENTS.SESSION_UPDATE, {
      current: {
        name: sessionData.current_session || 'NONE',
        active: sessionData.is_active || false,
        timeRemaining: sessionData.time_remaining || 0,
        progress: sessionData.progress || 0,
      },
      nyTime: sessionData.ny_time || '',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[WS] emitSessionUpdate error:', err);
  }
}

// ── Stats ───────────────────────────────────────────────────

export function getSocketStats(): {
  connectedClients: number;
  clients: Array<{
    id: string;
    connectedAt: number;
    subscriptions: string[];
  }>;
} {
  return {
    connectedClients: connectedClients.size,
    clients: Array.from(connectedClients.values()).map((c) => ({
      id: c.id,
      connectedAt: c.connectedAt,
      subscriptions: Array.from(c.subscriptions),
    })),
  };
}

// ── Cleanup ─────────────────────────────────────────────────

export function cleanupSocket(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  connectedClients.clear();
  console.log('[WS] Socket cleanup complete');
}
