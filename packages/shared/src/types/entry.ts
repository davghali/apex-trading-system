import { Direction, EntryType, Timeframe } from '../enums/index.js';

export interface EntrySignal {
  status: 'READY' | 'WAIT' | 'NO_TRADE';
  entryType: EntryType;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  bePrice: number;
  slPips: number;
  tpPips: number;
  riskReward: number;
  direction: Direction;
  poiTimeframe: Timeframe;
  confirmationTF: Timeframe;
  logic: string;
  sweepType?: string;
  reason?: string;
}
