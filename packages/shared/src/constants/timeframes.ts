import { Timeframe } from '../enums/index.js';

export const TIMEFRAME_HIERARCHY: Record<Timeframe, { weight: number; child: Timeframe | null; minutes: number }> = {
  [Timeframe.W1]: { weight: 10, child: Timeframe.D1, minutes: 10080 },
  [Timeframe.D1]: { weight: 8, child: Timeframe.H4, minutes: 1440 },
  [Timeframe.H4]: { weight: 6, child: Timeframe.H1, minutes: 240 },
  [Timeframe.H1]: { weight: 4, child: Timeframe.M15, minutes: 60 },
  [Timeframe.M15]: { weight: 3, child: Timeframe.M5, minutes: 15 },
  [Timeframe.M5]: { weight: 2, child: Timeframe.M1, minutes: 5 },
  [Timeframe.M1]: { weight: 1, child: null, minutes: 1 },
};

export const BIAS_TIMEFRAMES: Timeframe[] = [Timeframe.W1, Timeframe.D1, Timeframe.H4, Timeframe.H1];
export const ALIGNMENT_TIMEFRAMES: Timeframe[] = [Timeframe.D1, Timeframe.H4, Timeframe.H1];
export const POI_TIMEFRAMES: Timeframe[] = [Timeframe.H4, Timeframe.H1, Timeframe.M15];
export const ENTRY_TIMEFRAMES: Timeframe[] = [Timeframe.M15, Timeframe.M5, Timeframe.M1];

export const EXECUTION_MAP: Record<string, { confirmation: Timeframe; entry: Timeframe; sniper: Timeframe }> = {
  [Timeframe.H4]: { confirmation: Timeframe.M15, entry: Timeframe.M5, sniper: Timeframe.M1 },
  [Timeframe.H1]: { confirmation: Timeframe.M5, entry: Timeframe.M1, sniper: Timeframe.M1 },
  [Timeframe.M15]: { confirmation: Timeframe.M1, entry: Timeframe.M1, sniper: Timeframe.M1 },
};
