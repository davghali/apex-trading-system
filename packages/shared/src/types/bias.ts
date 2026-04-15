import { Direction, BiasStrength, PO3Phase } from '../enums/index.js';

export interface BiasResult {
  bias: Direction;
  score: number;
  conviction: BiasStrength;
  scoreBullish: number;
  scoreBearish: number;
  factors: string[];
  tradeable: boolean;
}

export interface WeeklyBias extends BiasResult {
  pwh: number;
  pwl: number;
  premiumDiscount: 'PREMIUM' | 'DISCOUNT';
  weeklyMid: number;
}

export interface DailyBias extends BiasResult {
  pdh: number;
  pdl: number;
  midnightOpen: number;
  dailyOpen: number | null;
  premiumDiscountZone: 'PREMIUM' | 'DISCOUNT';
  dowTendency: string;
}

export interface PO3Analysis {
  phase: PO3Phase;
  action: string;
  isEntryWindow: boolean;
  isTPWindow: boolean;
  midnightOpen: number;
  dailyOpen: number | null;
  priceVsMO: 'ABOVE' | 'BELOW';
  priceVsDO: 'ABOVE' | 'BELOW' | null;
  inManipulation: boolean;
  optimalEntryZone: boolean;
  entryRecommendation: string;
}

export interface FullBias {
  weekly: WeeklyBias;
  daily: DailyBias;
  po3: PO3Analysis;
  weeklyConfirmsDaily: boolean;
}
