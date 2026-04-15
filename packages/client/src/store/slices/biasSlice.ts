import { StateCreator } from 'zustand';

export type BiasDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface BiasLevel {
  price: number;
  type: string;
  label: string;
}

export interface BiasData {
  direction: BiasDirection;
  score: number;
  conviction: 'HIGH' | 'MEDIUM' | 'LOW';
  factors: string[];
  moLevel?: BiasLevel;
  doLevel?: BiasLevel;
}

export interface PO3Phase {
  current: 'ACCUMULATION' | 'MANIPULATION' | 'DISTRIBUTION' | 'NONE';
  phase_start?: number;
  expected_direction?: BiasDirection;
  confidence: number;
}

export interface BiasSlice {
  weeklyBias: BiasData;
  dailyBias: BiasData;
  po3: PO3Phase;
  lastBiasUpdate: string;

  // Derived
  biasAligned: boolean;
  overallDirection: BiasDirection;

  // Actions
  updateWeeklyBias: (bias: BiasData) => void;
  updateDailyBias: (bias: BiasData) => void;
  updatePO3: (po3: PO3Phase) => void;
  resetBias: () => void;
}

const defaultBias: BiasData = {
  direction: 'NEUTRAL',
  score: 0,
  conviction: 'LOW',
  factors: [],
};

const defaultPO3: PO3Phase = {
  current: 'NONE',
  confidence: 0,
};

export const createBiasSlice: StateCreator<BiasSlice, [], [], BiasSlice> = (set) => ({
  weeklyBias: { ...defaultBias },
  dailyBias: { ...defaultBias },
  po3: { ...defaultPO3 },
  lastBiasUpdate: '',
  biasAligned: false,
  overallDirection: 'NEUTRAL',

  updateWeeklyBias: (bias) =>
    set((state) => {
      const aligned = bias.direction === state.dailyBias.direction && bias.direction !== 'NEUTRAL';
      return {
        weeklyBias: bias,
        biasAligned: aligned,
        overallDirection: aligned ? bias.direction : 'NEUTRAL',
        lastBiasUpdate: new Date().toISOString(),
      };
    }),

  updateDailyBias: (bias) =>
    set((state) => {
      const aligned = bias.direction === state.weeklyBias.direction && bias.direction !== 'NEUTRAL';
      return {
        dailyBias: bias,
        biasAligned: aligned,
        overallDirection: aligned ? bias.direction : 'NEUTRAL',
        lastBiasUpdate: new Date().toISOString(),
      };
    }),

  updatePO3: (po3) => set({ po3 }),

  resetBias: () =>
    set({
      weeklyBias: { ...defaultBias },
      dailyBias: { ...defaultBias },
      po3: { ...defaultPO3 },
      lastBiasUpdate: '',
      biasAligned: false,
      overallDirection: 'NEUTRAL',
    }),
});
