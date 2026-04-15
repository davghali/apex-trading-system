import { create } from 'zustand';
import { createMarketSlice, type MarketSlice } from './slices/marketSlice';
import { createBiasSlice, type BiasSlice } from './slices/biasSlice';
import { createStructureSlice, type StructureSlice } from './slices/structureSlice';
import { createPOISlice, type POISlice } from './slices/poiSlice';
import { createSessionSlice, type SessionSlice } from './slices/sessionSlice';
import { createConfluenceSlice, type ConfluenceSlice } from './slices/confluenceSlice';
import { createEntrySlice, type EntrySlice } from './slices/entrySlice';
import { createTradeSlice, type TradeSlice } from './slices/tradeSlice';
import { createDXYSlice, type DXYSlice } from './slices/dxySlice';
import { createNewsSlice, type NewsSlice } from './slices/newsSlice';
import { createAlertSlice, type AlertSlice } from './slices/alertSlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';

export type AppStore = MarketSlice &
  BiasSlice &
  StructureSlice &
  POISlice &
  SessionSlice &
  ConfluenceSlice &
  EntrySlice &
  TradeSlice &
  DXYSlice &
  NewsSlice &
  AlertSlice &
  SettingsSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createMarketSlice(...a),
  ...createBiasSlice(...a),
  ...createStructureSlice(...a),
  ...createPOISlice(...a),
  ...createSessionSlice(...a),
  ...createConfluenceSlice(...a),
  ...createEntrySlice(...a),
  ...createTradeSlice(...a),
  ...createDXYSlice(...a),
  ...createNewsSlice(...a),
  ...createAlertSlice(...a),
  ...createSettingsSlice(...a),
}));

// Reset all store slices to initial state
export function resetAllSlices() {
  const state = useStore.getState();
  state.resetMarket();
  state.resetBias();
  state.resetStructure();
  state.resetPOIs();
  state.resetSession();
  state.resetConfluence();
  state.resetEntry();
  state.resetTrades();
  state.resetDXY();
  state.resetNews();
  state.resetAlerts();
  state.resetSettings();
}

export default useStore;
