import { StateCreator } from 'zustand';

export type TradeStatus = 'OPEN' | 'CLOSED' | 'PENDING' | 'CANCELLED';

export interface Trade {
  id: string;
  instrument: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  pnl: number;
  pnlPercent: number;
  rr: number;
  status: TradeStatus;
  openTime: string;
  closeTime?: string;
  model: string;
  setupType?: string;
  notes?: string;
  score?: number;
}

export interface TradeStats {
  totalTrades: number;
  winRate: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  totalPnl: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface TradeSlice {
  trades: Trade[];
  openTrades: Trade[];
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  todayTrades: number;
  stats: TradeStats;
  lastTradeUpdate: string;

  // Derived
  closedTrades: Trade[];
  winCount: number;
  lossCount: number;
  openPositionCount: number;

  // Actions
  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, update: Partial<Trade>) => void;
  closeTrade: (id: string, exitPrice: number) => void;
  setDailyPnl: (pnl: number) => void;
  setWeeklyPnl: (pnl: number) => void;
  setMonthlyPnl: (pnl: number) => void;
  setStats: (stats: TradeStats) => void;
  resetTrades: () => void;
}

const defaultStats: TradeStats = {
  totalTrades: 0,
  winRate: 0,
  avgRR: 0,
  profitFactor: 0,
  expectancy: 0,
  maxDrawdown: 0,
  bestTrade: 0,
  worstTrade: 0,
  totalPnl: 0,
  consecutiveWins: 0,
  consecutiveLosses: 0,
};

function computeDerived(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const open = trades.filter((t) => t.status === 'OPEN');
  const wins = closed.filter((t) => t.pnl >= 0);
  const losses = closed.filter((t) => t.pnl < 0);

  return {
    closedTrades: closed,
    openTrades: open,
    winCount: wins.length,
    lossCount: losses.length,
    openPositionCount: open.length,
  };
}

export const createTradeSlice: StateCreator<TradeSlice, [], [], TradeSlice> = (set) => ({
  trades: [],
  openTrades: [],
  closedTrades: [],
  dailyPnl: 0,
  weeklyPnl: 0,
  monthlyPnl: 0,
  todayTrades: 0,
  stats: { ...defaultStats },
  lastTradeUpdate: '',
  winCount: 0,
  lossCount: 0,
  openPositionCount: 0,

  setTrades: (trades) =>
    set(() => ({
      trades,
      ...computeDerived(trades),
      lastTradeUpdate: new Date().toISOString(),
    })),

  addTrade: (trade) =>
    set((state) => {
      const newTrades = [trade, ...state.trades];
      return {
        trades: newTrades,
        ...computeDerived(newTrades),
        todayTrades: state.todayTrades + 1,
        lastTradeUpdate: new Date().toISOString(),
      };
    }),

  updateTrade: (id, update) =>
    set((state) => {
      const newTrades = state.trades.map((t) => (t.id === id ? { ...t, ...update } : t));
      return {
        trades: newTrades,
        ...computeDerived(newTrades),
        lastTradeUpdate: new Date().toISOString(),
      };
    }),

  closeTrade: (id, exitPrice) =>
    set((state) => {
      const newTrades = state.trades.map((t) => {
        if (t.id !== id) return t;
        const pnl =
          t.direction === 'LONG'
            ? (exitPrice - t.entryPrice) * t.lotSize * 100000
            : (t.entryPrice - exitPrice) * t.lotSize * 100000;
        const slDistance = Math.abs(t.entryPrice - t.stopLoss);
        const rr = slDistance > 0 ? (exitPrice - t.entryPrice) / slDistance : 0;
        return {
          ...t,
          exitPrice,
          pnl,
          rr: t.direction === 'LONG' ? rr : -rr,
          status: 'CLOSED' as TradeStatus,
          closeTime: new Date().toISOString(),
        };
      });
      return {
        trades: newTrades,
        ...computeDerived(newTrades),
        lastTradeUpdate: new Date().toISOString(),
      };
    }),

  setDailyPnl: (pnl) => set({ dailyPnl: pnl }),
  setWeeklyPnl: (pnl) => set({ weeklyPnl: pnl }),
  setMonthlyPnl: (pnl) => set({ monthlyPnl: pnl }),
  setStats: (stats) => set({ stats }),

  resetTrades: () =>
    set({
      trades: [],
      openTrades: [],
      closedTrades: [],
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      todayTrades: 0,
      stats: { ...defaultStats },
      lastTradeUpdate: '',
      winCount: 0,
      lossCount: 0,
      openPositionCount: 0,
    }),
});
