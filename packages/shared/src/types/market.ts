import { Instrument, Timeframe } from '../enums/index.js';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceUpdate {
  instrument: Instrument;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number;
}

export interface CandleRequest {
  instrument: Instrument;
  timeframe: Timeframe;
  bars: number;
}

export interface InstrumentConfig {
  symbol: string;
  name: string;
  type: 'forex' | 'commodity' | 'index';
  pipSize: number;
  pipValue: number;
  maxSpread: number;
  correlation: string;
  sessions: string[];
}

export interface MarketData {
  instrument: Instrument;
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  lastUpdate: number;
}
