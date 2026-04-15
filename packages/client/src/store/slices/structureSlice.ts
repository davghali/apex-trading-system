import { StateCreator } from 'zustand';

export type TrendDirection = 'BULLISH' | 'BEARISH' | 'RANGING';
export type StructureBreak = 'BOS' | 'CHoCH' | 'NONE';

export interface TimeframeStructure {
  timeframe: string;
  trend: TrendDirection;
  lastBreak: StructureBreak;
  lastBreakPrice: number;
  lastBreakTime: string;
  swingHigh: number;
  swingLow: number;
}

export interface StructureAlignment {
  aligned: boolean;
  direction: TrendDirection;
  score: number;
  timeframes: string[];
}

export interface StructureSlice {
  structures: Record<string, TimeframeStructure>;
  alignment: StructureAlignment;
  lastStructureUpdate: string;

  // Derived
  alignedTimeframeCount: number;
  hasRecentBreak: boolean;

  // Actions
  updateStructure: (tf: string, structure: TimeframeStructure) => void;
  updateAlignment: (alignment: StructureAlignment) => void;
  setStructures: (structures: Record<string, TimeframeStructure>) => void;
  resetStructure: () => void;
}

const defaultStructure: TimeframeStructure = {
  timeframe: '',
  trend: 'RANGING',
  lastBreak: 'NONE',
  lastBreakPrice: 0,
  lastBreakTime: '',
  swingHigh: 0,
  swingLow: 0,
};

const defaultAlignment: StructureAlignment = {
  aligned: false,
  direction: 'RANGING',
  score: 0,
  timeframes: [],
};

const initialStructures: Record<string, TimeframeStructure> = {
  D1: { ...defaultStructure, timeframe: 'D1' },
  H4: { ...defaultStructure, timeframe: 'H4' },
  H1: { ...defaultStructure, timeframe: 'H1' },
};

export const createStructureSlice: StateCreator<StructureSlice, [], [], StructureSlice> = (set) => ({
  structures: { ...initialStructures },
  alignment: { ...defaultAlignment },
  lastStructureUpdate: '',
  alignedTimeframeCount: 0,
  hasRecentBreak: false,

  updateStructure: (tf, structure) =>
    set((state) => {
      const newStructures = { ...state.structures, [tf]: structure };
      const tfs = Object.values(newStructures);
      const bullishCount = tfs.filter((s) => s.trend === 'BULLISH').length;
      const bearishCount = tfs.filter((s) => s.trend === 'BEARISH').length;
      const alignedCount = Math.max(bullishCount, bearishCount);
      const hasRecent = tfs.some((s) => {
        if (!s.lastBreakTime) return false;
        const breakAge = Date.now() - new Date(s.lastBreakTime).getTime();
        return breakAge < 3600000; // within last hour
      });

      return {
        structures: newStructures,
        alignedTimeframeCount: alignedCount,
        hasRecentBreak: hasRecent,
        lastStructureUpdate: new Date().toISOString(),
      };
    }),

  updateAlignment: (alignment) => set({ alignment }),

  setStructures: (structures) =>
    set(() => {
      const tfs = Object.values(structures);
      const bullishCount = tfs.filter((s) => s.trend === 'BULLISH').length;
      const bearishCount = tfs.filter((s) => s.trend === 'BEARISH').length;
      return {
        structures,
        alignedTimeframeCount: Math.max(bullishCount, bearishCount),
        lastStructureUpdate: new Date().toISOString(),
      };
    }),

  resetStructure: () =>
    set({
      structures: { ...initialStructures },
      alignment: { ...defaultAlignment },
      lastStructureUpdate: '',
      alignedTimeframeCount: 0,
      hasRecentBreak: false,
    }),
});
