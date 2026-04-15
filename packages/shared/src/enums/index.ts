export enum Direction {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL',
}

export enum Trend {
  HH_HL = 'HH_HL',
  LH_LL = 'LH_LL',
  RANGING = 'RANGING',
  UNDEFINED = 'UNDEFINED',
}

export enum Timeframe {
  W1 = 'W1',
  D1 = 'D1',
  H4 = 'H4',
  H1 = 'H1',
  M15 = 'M15',
  M5 = 'M5',
  M1 = 'M1',
}

export enum Instrument {
  EURUSD = 'EURUSD',
  XAUUSD = 'XAUUSD',
  NAS100 = 'NAS100',
  DXY = 'DXY',
}

export enum SessionName {
  ASIAN = 'ASIAN',
  LONDON_KZ = 'LONDON_KZ',
  NY_KZ = 'NY_KZ',
  LONDON_CLOSE = 'LONDON_CLOSE',
  POST_SESSION = 'POST_SESSION',
}

export enum BiasStrength {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum POIType {
  ORDER_BLOCK = 'ORDER_BLOCK',
  FVG = 'FVG',
  BREAKER_BLOCK = 'BREAKER_BLOCK',
  INVERSE_FVG = 'INVERSE_FVG',
  LIQUIDITY_POOL = 'LIQUIDITY_POOL',
}

export enum POIStatus {
  ACTIVE = 'ACTIVE',
  MITIGATED = 'MITIGATED',
  EXPIRED = 'EXPIRED',
}

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum EntryType {
  CONTINUATION = 'CONTINUATION',
  LIQUIDITY_SWEEP = 'LIQUIDITY_SWEEP',
}

export enum AlertPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum KillzoneModel {
  LONDON_REVERSAL = 'LONDON_REVERSAL',
  LONDON_CONTINUATION = 'LONDON_CONTINUATION',
  NY_CONTINUATION = 'NY_CONTINUATION',
  NY_REVERSAL = 'NY_REVERSAL',
}

export enum PO3Phase {
  ACCUMULATION = 'ACCUMULATION',
  MANIPULATION = 'MANIPULATION',
  DISTRIBUTION = 'DISTRIBUTION',
  POST_SESSION = 'POST_SESSION',
}

export enum LiquidityType {
  BSL = 'BSL',
  SSL = 'SSL',
}

export enum StructureEvent {
  BOS = 'BOS',
  CHOCH = 'CHOCH',
  MSS = 'MSS',
  SWING_HIGH = 'SWING_HIGH',
  SWING_LOW = 'SWING_LOW',
}
