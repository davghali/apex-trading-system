import { Instrument, AlertPriority } from '../enums/index.js';

export interface Alert {
  id?: number;
  instrument: Instrument;
  alertType: string;
  priority: AlertPriority;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  sentTelegram: boolean;
  sentWeb: boolean;
  acknowledged: boolean;
  createdAt: string;
}
