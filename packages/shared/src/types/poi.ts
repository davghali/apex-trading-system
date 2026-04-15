import { Direction, Timeframe, POIType, POIStatus } from '../enums/index.js';

export interface BasePOI {
  id?: number;
  type: POIType;
  direction: Direction;
  high: number;
  low: number;
  ce50: number;
  timeframe: Timeframe;
  status: POIStatus;
  retests: number;
  createdAt: number;
  qualityScore: number;
}

export interface OrderBlock extends BasePOI {
  type: POIType.ORDER_BLOCK;
  hasFVG: boolean;
  impulseRatio: number;
  usage: 'CONTINUATION';
}

export interface FairValueGap extends BasePOI {
  type: POIType.FVG;
  gapSizePips: number;
  filled: boolean;
  partiallyFilled: boolean;
  impulseBody: number;
  usage: 'CONTINUATION';
}

export interface BreakerBlock extends BasePOI {
  type: POIType.BREAKER_BLOCK;
  originalOBDirection: Direction;
  associatedSweepType: string;
  requiresIFVGConfirm: boolean;
  usage: 'LIQUIDITY_SWEEP_ENTRY';
}

export interface InverseFVG extends BasePOI {
  type: POIType.INVERSE_FVG;
  entryPrice: number;
  slPrice: number;
  associatedSweepTime: number;
  usage: 'ENTRY_CONFIRMATION';
}

export interface LiquidityPool {
  level: number;
  type: string;
  significance: 'EXTREME' | 'VERY_HIGH' | 'HIGH' | 'MEDIUM';
  swept: boolean;
  liquidityType: 'BSL' | 'SSL';
}

export interface LiquidityMap {
  buySideLiquidity: LiquidityPool[];
  sellSideLiquidity: LiquidityPool[];
  nearestBSL: LiquidityPool | null;
  nearestSSL: LiquidityPool | null;
  recentlySweptBSL: LiquidityPool[];
  recentlySweptSSL: LiquidityPool[];
}

export type POI = OrderBlock | FairValueGap | BreakerBlock | InverseFVG;
