export const CONFLUENCE_THRESHOLDS = {
  A_PLUS: 90,
  A: 80,
  B_PLUS: 75,
  B: 70,
  NO_TRADE: 70,
} as const;

export const POSITION_SIZE_MODIFIERS = {
  A_PLUS: 1.0,
  A: 0.85,
  B_PLUS: 0.7,
  B: 0.5,
  NO_TRADE: 0.0,
} as const;

export const CATEGORY_MAX_SCORES = {
  A_STRUCTURE_BIAS: 25,
  B_POI_QUALITY: 25,
  C_ENTRY_CONFIRMATION: 20,
  D_TIMING_SESSION: 15,
  E_RISK_FACTORS: 15,
} as const;

export const TRADING_RULES = {
  MAX_TRADES_PER_DAY: 2,
  MIN_RISK_REWARD: 2.0,
  BE_AT_RR: 1.0,
  MAX_DAILY_LOSS_PERCENT: 2.0,
  MAX_WEEKLY_LOSS_PERCENT: 5.0,
  DEFAULT_RISK_PERCENT: 1.0,
  NEWS_BUFFER_MINUTES: 30,
  WIN_RATE_TARGET: 0.80,
} as const;

export const HIGH_IMPACT_NEWS = [
  'NFP', 'CPI', 'PPI', 'FOMC', 'ECB_RATE', 'GDP',
  'RETAIL_SALES', 'PCE', 'BOE_RATE', 'BOJ_RATE',
] as const;

export const DOW_TENDENCY: Record<string, string> = {
  Monday: 'ACCUMULATION',
  Tuesday: 'MANIPULATION',
  Wednesday: 'DISTRIBUTION',
  Thursday: 'DISTRIBUTION',
  Friday: 'CLOSE_POSITIONS',
};
