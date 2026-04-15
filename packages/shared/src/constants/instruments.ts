import { Instrument } from '../enums/index.js';
import { InstrumentConfig } from '../types/market.js';

export const INSTRUMENTS: Record<Instrument, InstrumentConfig> = {
  [Instrument.EURUSD]: {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    type: 'forex',
    pipSize: 0.0001,
    pipValue: 10.0,
    maxSpread: 1.2,
    correlation: 'Inverse DXY',
    sessions: ['LONDON_KZ', 'NY_KZ'],
  },
  [Instrument.XAUUSD]: {
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    type: 'commodity',
    pipSize: 0.1,
    pipValue: 10.0,
    maxSpread: 3.0,
    correlation: 'Inverse USD',
    sessions: ['LONDON_KZ', 'NY_KZ'],
  },
  [Instrument.NAS100]: {
    symbol: 'NAS100',
    name: 'Nasdaq 100',
    type: 'index',
    pipSize: 1.0,
    pipValue: 1.0,
    maxSpread: 2.0,
    correlation: 'Risk-on/off',
    sessions: ['NY_KZ'],
  },
  [Instrument.DXY]: {
    symbol: 'DXY',
    name: 'US Dollar Index',
    type: 'index',
    pipSize: 0.01,
    pipValue: 0,
    maxSpread: 0,
    correlation: 'Reference',
    sessions: ['LONDON_KZ', 'NY_KZ'],
  },
};
