import { SessionName, KillzoneModel } from '../enums/index.js';
import { KillzoneDefinition } from '../types/session.js';

export const KILLZONES: Record<string, KillzoneDefinition> = {
  ASIAN: {
    name: SessionName.ASIAN,
    startNY: '20:00',
    endNY: '00:00',
    instruments: ['EURUSD', 'XAUUSD', 'NAS100'],
    preferredSetups: [],
    maxTrades: 0,
  },
  LONDON_KZ: {
    name: SessionName.LONDON_KZ,
    startNY: '02:00',
    endNY: '05:00',
    instruments: ['EURUSD', 'XAUUSD', 'NAS100'],
    preferredSetups: [KillzoneModel.LONDON_REVERSAL, KillzoneModel.LONDON_CONTINUATION],
    maxTrades: 1,
  },
  NY_KZ: {
    name: SessionName.NY_KZ,
    startNY: '07:00',
    endNY: '10:00',
    instruments: ['EURUSD', 'XAUUSD', 'NAS100'],
    preferredSetups: [KillzoneModel.NY_CONTINUATION, KillzoneModel.NY_REVERSAL],
    maxTrades: 1,
  },
  LONDON_CLOSE: {
    name: SessionName.LONDON_CLOSE,
    startNY: '10:00',
    endNY: '12:00',
    instruments: ['EURUSD', 'XAUUSD'],
    preferredSetups: [],
    maxTrades: 0,
  },
};

export const PREPARATION_WINDOWS = {
  PRE_LONDON: { start: '01:00', end: '02:00', label: 'Pre-London Analysis' },
  PRE_NY: { start: '06:00', end: '07:00', label: 'Pre-NY Analysis' },
};

export const KEY_TIMES = {
  MIDNIGHT_OPEN_NY: '00:00',
  DAILY_OPEN_NY: '09:30',
};
