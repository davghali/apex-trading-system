import { Direction, Instrument, TradeStatus, EntryType } from '../enums/index.js';

export interface Trade {
  id?: number;
  instrument: Instrument;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  exitPrice: number | null;
  positionSize: number;
  riskAmount: number;
  pnl: number | null;
  rrAchieved: number | null;
  status: TradeStatus;
  entryTime: string;
  exitTime: string | null;
  killzone: string;
  setupType: EntryType;
  confluenceScore: number;
  notes: string;
  tags: string[];
  biasAtEntry: string;
}

export interface PositionSize {
  lots: number;
  riskAmount: number;
  riskPercent: number;
  slPips: number;
  tpPips: number;
  potentialProfit: number;
  beLevel: number;
  sizeModifier: number;
  maxDailyLossRemaining: number;
}

export interface TradeCheck {
  allowed: boolean;
  reasons: string[];
  tradesRemaining: number;
  dailyPnl: number;
  weeklyPnl: number;
}

export interface JournalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  avgRR: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  consecutiveLosses: number;
}
