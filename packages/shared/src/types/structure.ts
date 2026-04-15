import { Direction, Trend, Timeframe, StructureEvent } from '../enums/index.js';

export interface SwingPoint {
  price: number;
  time: number;
  index: number;
  type: 'swing_high' | 'swing_low';
  broken: boolean;
}

export interface StructureBreak {
  type: StructureEvent;
  direction: Direction;
  level: number;
  time: number;
  strength: 'strong' | 'weak';
  candleIndex: number;
  timeframe: Timeframe;
}

export interface MarketStructure {
  timeframe: Timeframe;
  trend: Trend;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  breaks: StructureBreak[];
  lastBOS: StructureBreak | null;
  lastCHoCH: StructureBreak | null;
}

export interface MultiTFAlignment {
  aligned: boolean;
  alignmentScore: number;
  bias: Direction;
  weeklyConfirms: boolean;
  conflictLevels: Timeframe[];
  tradeable: boolean;
  recommendation: string;
  structures: Record<string, MarketStructure>;
}

export interface EqualLevel {
  type: 'EQH' | 'EQL';
  price: number;
  touches: number;
  liquidityPool: 'BSL' | 'SSL';
  significance: 'HIGH' | 'MEDIUM';
  sweepProbability: number;
}
