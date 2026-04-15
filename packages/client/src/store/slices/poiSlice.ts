import { StateCreator } from 'zustand';

export type POIType = 'OB' | 'FVG' | 'BB' | 'LIQUIDITY' | 'MITIGATION';
export type POISide = 'BUY' | 'SELL';

export interface POI {
  id: string;
  type: POIType;
  side: POISide;
  priceHigh: number;
  priceLow: number;
  timeframe: string;
  strength: number;
  mitigated: boolean;
  distance?: number;
  label?: string;
}

export interface LiquidityLevel {
  price: number;
  type: 'BSL' | 'SSL' | 'EQH' | 'EQL';
  strength: number;
  swept: boolean;
}

export interface POISlice {
  pois: POI[];
  liquidityMap: {
    bsl: LiquidityLevel[];
    ssl: LiquidityLevel[];
  };
  lastPOIUpdate: string;

  // Derived
  activePOICount: number;
  nearestPOI: POI | null;

  // Actions
  setPOIs: (pois: POI[]) => void;
  updateLiquidityMap: (map: POISlice['liquidityMap']) => void;
  removePOI: (id: string) => void;
  mitigatePOI: (id: string) => void;
  resetPOIs: () => void;
}

export const createPOISlice: StateCreator<POISlice, [], [], POISlice> = (set) => ({
  pois: [],
  liquidityMap: {
    bsl: [],
    ssl: [],
  },
  lastPOIUpdate: '',
  activePOICount: 0,
  nearestPOI: null,

  setPOIs: (pois) =>
    set(() => {
      const active = pois.filter((p) => !p.mitigated);
      const sorted = [...active].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      return {
        pois,
        activePOICount: active.length,
        nearestPOI: sorted[0] || null,
        lastPOIUpdate: new Date().toISOString(),
      };
    }),

  updateLiquidityMap: (liquidityMap) => set({ liquidityMap }),

  removePOI: (id) =>
    set((state) => {
      const newPois = state.pois.filter((p) => p.id !== id);
      const active = newPois.filter((p) => !p.mitigated);
      return {
        pois: newPois,
        activePOICount: active.length,
      };
    }),

  mitigatePOI: (id) =>
    set((state) => {
      const newPois = state.pois.map((p) => (p.id === id ? { ...p, mitigated: true } : p));
      const active = newPois.filter((p) => !p.mitigated);
      return {
        pois: newPois,
        activePOICount: active.length,
      };
    }),

  resetPOIs: () =>
    set({
      pois: [],
      liquidityMap: { bsl: [], ssl: [] },
      lastPOIUpdate: '',
      activePOICount: 0,
      nearestPOI: null,
    }),
});
