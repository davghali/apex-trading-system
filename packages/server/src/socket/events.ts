export const SOCKET_EVENTS = {
  // Client -> Server
  SUBSCRIBE_INSTRUMENT: 'subscribe:instrument',
  UNSUBSCRIBE_INSTRUMENT: 'unsubscribe:instrument',
  REQUEST_ANALYSIS: 'request:analysis',
  REQUEST_KILLZONE: 'request:killzone',
  PING: 'ping',

  // Server -> Client
  ANALYSIS_RESULT: 'analysis:result',
  ANALYSIS_ERROR: 'analysis:error',
  ALERT_NEW: 'alert:new',
  TRADE_UPDATE: 'trade:update',
  TRADE_CLOSED: 'trade:closed',
  POI_UPDATE: 'poi:update',
  STRUCTURE_UPDATE: 'structure:update',
  SCAN_COMPLETE: 'scan:complete',
  CONNECTION_ACK: 'connection:ack',
  KILLZONE_UPDATE: 'killzone:update',
  BIAS_UPDATE: 'bias:update',
  NEWS_UPDATE: 'news:update',
  ENGINE_STATUS: 'engine:status',
  PONG: 'pong',
  SERVER_ERROR: 'server:error',

  // Granular updates (matching client listeners)
  BIAS_WEEKLY: 'bias:weekly',
  BIAS_DAILY: 'bias:daily',
  BIAS_PO3: 'bias:po3',
  PRICE_UPDATE: 'price:update',
  SESSION_UPDATE: 'session:update',
  CONFLUENCE_UPDATE: 'confluence:update',
  ENTRY_SIGNAL: 'entry:signal',
  TRADE_NEW: 'trade:new',
  TRADE_PNL: 'trade:pnl',
  TRADE_STATS: 'trade:stats',
  DXY_UPDATE: 'dxy:update',
  ALERT: 'alert',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
