import { StateCreator } from 'zustand';

export interface MarketSlice {
  currentPrice: number;
  previousPrice: number;
  instrument: string;
  spread: number;
  tickSize: number;
  connected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastPriceUpdate: string;

  // Derived
  priceDirection: 'up' | 'down' | 'flat';
  pipValue: number;

  // Actions
  setCurrentPrice: (price: number) => void;
  setInstrument: (instrument: string) => void;
  setSpread: (spread: number) => void;
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (status: MarketSlice['connectionStatus']) => void;
  resetMarket: () => void;
}

const initialState = {
  currentPrice: 0,
  previousPrice: 0,
  instrument: 'EURUSD',
  spread: 0,
  tickSize: 0.00001,
  connected: false,
  connectionStatus: 'disconnected' as const,
  lastPriceUpdate: '',
  priceDirection: 'flat' as const,
  pipValue: 0.0001,
};

export const createMarketSlice: StateCreator<MarketSlice, [], [], MarketSlice> = (set) => ({
  ...initialState,

  setCurrentPrice: (price) =>
    set((state) => ({
      previousPrice: state.currentPrice,
      currentPrice: price,
      priceDirection: price > state.currentPrice ? 'up' : price < state.currentPrice ? 'down' : 'flat',
      lastPriceUpdate: new Date().toISOString(),
    })),

  setInstrument: (instrument) =>
    set({
      instrument,
      currentPrice: 0,
      previousPrice: 0,
      priceDirection: 'flat',
      pipValue: instrument.includes('JPY') ? 0.01 : 0.0001,
      tickSize: instrument.includes('JPY') ? 0.001 : instrument.includes('XAU') ? 0.01 : 0.00001,
    }),

  setSpread: (spread) => set({ spread }),
  setConnected: (connected) => set({ connected }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  resetMarket: () => set(initialState),
});
