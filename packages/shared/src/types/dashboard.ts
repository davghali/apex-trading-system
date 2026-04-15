import { Instrument } from '../enums/index.js';
import { FullBias } from './bias.js';
import { MultiTFAlignment } from './structure.js';
import { POI, LiquidityMap } from './poi.js';
import { SessionStatus, KillzoneAnalysis } from './session.js';
import { ConfluenceScore } from './confluence.js';
import { EntrySignal } from './entry.js';
import { DXYCorrelation } from './dxy.js';
import { NewsSafety } from './news.js';
import { TradeCheck, JournalStats } from './trade.js';

export interface FullAnalysis {
  instrument: Instrument;
  timestamp: number;
  structure: MultiTFAlignment;
  bias: FullBias;
  pois: POI[];
  liquidityMap: LiquidityMap;
  session: SessionStatus;
  killzoneAnalysis: KillzoneAnalysis | null;
  confluence: ConfluenceScore;
  entry: EntrySignal | null;
  dxy: DXYCorrelation;
  news: NewsSafety;
  tradeCheck: TradeCheck;
}

export interface DashboardState {
  activeInstrument: Instrument;
  analysis: Record<string, FullAnalysis>;
  connected: boolean;
  engineStatus: 'online' | 'offline' | 'error';
  lastScanTime: number | null;
}
