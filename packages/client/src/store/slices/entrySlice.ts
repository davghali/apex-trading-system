import { StateCreator } from 'zustand';

export type EntryModel = 'OTE' | 'BREAKER' | 'FVG_ENTRY' | 'TURTLE_SOUP' | 'NONE';
export type SignalStatus = 'WAITING' | 'ACTIVE' | 'TRIGGERED' | 'EXPIRED' | 'CANCELLED';

export interface EntrySignal {
  id: string;
  model: EntryModel;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward: number;
  confidence: number;
  status: SignalStatus;
  timestamp: string;
  reasons: string[];
}

export interface EntrySlice {
  currentSignal: EntrySignal | null;
  signalHistory: EntrySignal[];
  lastSignalUpdate: string;

  // Derived
  hasActiveSignal: boolean;
  signalDirection: 'LONG' | 'SHORT' | null;
  signalCount: number;

  // Actions
  setSignal: (signal: EntrySignal | null) => void;
  addToHistory: (signal: EntrySignal) => void;
  clearSignal: () => void;
  resetEntry: () => void;
}

export const createEntrySlice: StateCreator<EntrySlice, [], [], EntrySlice> = (set) => ({
  currentSignal: null,
  signalHistory: [],
  lastSignalUpdate: '',
  hasActiveSignal: false,
  signalDirection: null,
  signalCount: 0,

  setSignal: (signal) =>
    set((state) => {
      // Add previous signal to history if it existed
      const newHistory =
        state.currentSignal && signal?.id !== state.currentSignal.id
          ? [state.currentSignal, ...state.signalHistory].slice(0, 50)
          : state.signalHistory;

      return {
        currentSignal: signal,
        signalHistory: newHistory,
        hasActiveSignal: signal !== null && signal.status === 'ACTIVE',
        signalDirection: signal?.direction || null,
        lastSignalUpdate: new Date().toISOString(),
      };
    }),

  addToHistory: (signal) =>
    set((state) => ({
      signalHistory: [signal, ...state.signalHistory].slice(0, 50),
      signalCount: state.signalCount + 1,
    })),

  clearSignal: () =>
    set({
      currentSignal: null,
      hasActiveSignal: false,
      signalDirection: null,
    }),

  resetEntry: () =>
    set({
      currentSignal: null,
      signalHistory: [],
      lastSignalUpdate: '',
      hasActiveSignal: false,
      signalDirection: null,
      signalCount: 0,
    }),
});
