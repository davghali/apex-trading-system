import { StateCreator } from 'zustand';

export type DXYCorrelation = 'CONFIRMING' | 'DIVERGING' | 'NEUTRAL';

export interface SMTDivergence {
  detected: boolean;
  pair1: string;
  pair2: string;
  direction: 'BULLISH' | 'BEARISH';
  description: string;
  timestamp: string;
}

export interface DXYSlice {
  dxyPrice: number;
  dxyTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
  correlation: DXYCorrelation;
  correlationScore: number;
  smtDivergence: SMTDivergence | null;
  lastUpdate: string;

  // Derived
  hasSMT: boolean;
  correlationStrength: 'strong' | 'moderate' | 'weak';

  // Actions
  setDXYPrice: (price: number) => void;
  setDXYTrend: (trend: DXYSlice['dxyTrend']) => void;
  setCorrelation: (correlation: DXYCorrelation, score: number) => void;
  setSMTDivergence: (smt: SMTDivergence | null) => void;
  resetDXY: () => void;
}

export const createDXYSlice: StateCreator<DXYSlice, [], [], DXYSlice> = (set) => ({
  dxyPrice: 0,
  dxyTrend: 'RANGING',
  correlation: 'NEUTRAL',
  correlationScore: 0,
  smtDivergence: null,
  lastUpdate: '',
  hasSMT: false,
  correlationStrength: 'weak',

  setDXYPrice: (price) => set({ dxyPrice: price }),
  setDXYTrend: (trend) => set({ dxyTrend: trend }),

  setCorrelation: (correlation, score) =>
    set({
      correlation,
      correlationScore: score,
      lastUpdate: new Date().toISOString(),
      correlationStrength: score > 70 ? 'strong' : score > 40 ? 'moderate' : 'weak',
    }),

  setSMTDivergence: (smt) =>
    set({
      smtDivergence: smt,
      hasSMT: smt?.detected || false,
    }),

  resetDXY: () =>
    set({
      dxyPrice: 0,
      dxyTrend: 'RANGING',
      correlation: 'NEUTRAL',
      correlationScore: 0,
      smtDivergence: null,
      lastUpdate: '',
      hasSMT: false,
      correlationStrength: 'weak',
    }),
});
