import { StateCreator } from 'zustand';

export type NewsImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type SafetyLevel = 'SAFE' | 'CAUTION' | 'DANGER';

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string;
  impact: NewsImpact;
  time: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  isUpcoming: boolean;
  minutesUntil?: number;
}

export interface NewsSlice {
  events: EconomicEvent[];
  safetyLevel: SafetyLevel;
  nextHighImpact: EconomicEvent | null;
  newsWindowActive: boolean;
  lastNewsUpdate: string;

  // Derived
  highImpactCount: number;
  upcomingCount: number;
  isTradingBlocked: boolean;

  // Actions
  setEvents: (events: EconomicEvent[]) => void;
  setSafetyLevel: (level: SafetyLevel) => void;
  setNextHighImpact: (event: EconomicEvent | null) => void;
  setNewsWindowActive: (active: boolean) => void;
  resetNews: () => void;
}

export const createNewsSlice: StateCreator<NewsSlice, [], [], NewsSlice> = (set) => ({
  events: [],
  safetyLevel: 'SAFE',
  nextHighImpact: null,
  newsWindowActive: false,
  lastNewsUpdate: '',
  highImpactCount: 0,
  upcomingCount: 0,
  isTradingBlocked: false,

  setEvents: (events) =>
    set(() => {
      const highImpact = events.filter((e) => e.impact === 'HIGH');
      const upcoming = events.filter((e) => e.isUpcoming);
      const nextHigh = highImpact
        .filter((e) => e.isUpcoming)
        .sort((a, b) => (a.minutesUntil ?? Infinity) - (b.minutesUntil ?? Infinity))[0] || null;

      return {
        events,
        highImpactCount: highImpact.length,
        upcomingCount: upcoming.length,
        nextHighImpact: nextHigh,
        lastNewsUpdate: new Date().toISOString(),
      };
    }),

  setSafetyLevel: (level) =>
    set({
      safetyLevel: level,
      isTradingBlocked: level === 'DANGER',
    }),

  setNextHighImpact: (event) => set({ nextHighImpact: event }),
  setNewsWindowActive: (active) => set({ newsWindowActive: active }),

  resetNews: () =>
    set({
      events: [],
      safetyLevel: 'SAFE',
      nextHighImpact: null,
      newsWindowActive: false,
      lastNewsUpdate: '',
      highImpactCount: 0,
      upcomingCount: 0,
      isTradingBlocked: false,
    }),
});
