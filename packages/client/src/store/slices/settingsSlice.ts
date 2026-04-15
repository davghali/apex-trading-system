import { StateCreator } from 'zustand';

export interface TradingRules {
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  maxPositionSize: number;
  riskPerTrade: number;
  minRR: number;
  minConfluenceScore: number;
  allowedSessions: string[];
  requiredGrade: string;
  beLevel: number;
}

export interface APIKeys {
  twelveData: string;
  oanda: string;
  finnhub: string;
  alphaVantage: string;
}

export interface SettingsSlice {
  accountSize: number;
  riskPercent: number;
  defaultInstrument: string;
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramBotToken: string;
  soundAlerts: boolean;
  desktopNotifications: boolean;
  tradingRules: TradingRules;
  apiKeys: APIKeys;
  theme: 'dark' | 'light';
  lastSettingsSave: string;

  // Actions
  updateSettings: (settings: Partial<SettingsSlice>) => void;
  updateTradingRules: (rules: Partial<TradingRules>) => void;
  updateAPIKeys: (keys: Partial<APIKeys>) => void;
  setAccountSize: (size: number) => void;
  setRiskPercent: (percent: number) => void;
  resetSettings: () => void;
}

const defaultRules: TradingRules = {
  maxDailyTrades: 3,
  maxDailyLoss: 3,
  maxWeeklyLoss: 6,
  maxPositionSize: 5,
  riskPerTrade: 1,
  minRR: 2,
  minConfluenceScore: 65,
  allowedSessions: ['LONDON', 'NY_AM'],
  requiredGrade: 'B',
  beLevel: 1.5,
};

const defaultAPIKeys: APIKeys = {
  twelveData: '',
  oanda: '',
  finnhub: '',
  alphaVantage: '',
};

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set) => ({
  accountSize: 100000,
  riskPercent: 1,
  defaultInstrument: 'EURUSD',
  telegramEnabled: false,
  telegramChatId: '',
  telegramBotToken: '',
  soundAlerts: true,
  desktopNotifications: true,
  tradingRules: { ...defaultRules },
  apiKeys: { ...defaultAPIKeys },
  theme: 'dark',
  lastSettingsSave: '',

  updateSettings: (settings) =>
    set((state) => ({
      ...state,
      ...settings,
      lastSettingsSave: new Date().toISOString(),
    })),

  updateTradingRules: (rules) =>
    set((state) => ({
      tradingRules: { ...state.tradingRules, ...rules },
      lastSettingsSave: new Date().toISOString(),
    })),

  updateAPIKeys: (keys) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, ...keys },
      lastSettingsSave: new Date().toISOString(),
    })),

  setAccountSize: (size) => set({ accountSize: size }),
  setRiskPercent: (percent) => set({ riskPercent: percent }),

  resetSettings: () =>
    set({
      accountSize: 100000,
      riskPercent: 1,
      defaultInstrument: 'EURUSD',
      telegramEnabled: false,
      telegramChatId: '',
      telegramBotToken: '',
      soundAlerts: true,
      desktopNotifications: true,
      tradingRules: { ...defaultRules },
      apiKeys: { ...defaultAPIKeys },
      theme: 'dark',
      lastSettingsSave: '',
    }),
});
