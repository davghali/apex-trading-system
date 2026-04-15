import { StateCreator } from 'zustand';

export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AlertType =
  | 'ENTRY_SIGNAL'
  | 'POI_PROXIMITY'
  | 'STRUCTURE_BREAK'
  | 'NEWS_WARNING'
  | 'SESSION_START'
  | 'RISK_ALERT'
  | 'SYSTEM';

export interface Alert {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  sound?: string;
  data?: Record<string, unknown>;
}

export interface AlertSlice {
  alerts: Alert[];
  unreadCount: number;
  soundEnabled: boolean;
  lastAlertTime: string;

  // Derived
  criticalCount: number;
  hasUnread: boolean;

  // Actions
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (id: string) => void;
  acknowledgeAll: () => void;
  clearAlerts: () => void;
  removeAlert: (id: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  resetAlerts: () => void;
}

export const createAlertSlice: StateCreator<AlertSlice, [], [], AlertSlice> = (set) => ({
  alerts: [],
  unreadCount: 0,
  soundEnabled: true,
  lastAlertTime: '',
  criticalCount: 0,
  hasUnread: false,

  addAlert: (alert) =>
    set((state) => {
      const newAlerts = [alert, ...state.alerts].slice(0, 100);
      const criticals = newAlerts.filter((a) => !a.acknowledged && a.priority === 'CRITICAL').length;
      return {
        alerts: newAlerts,
        unreadCount: state.unreadCount + 1,
        criticalCount: criticals,
        hasUnread: true,
        lastAlertTime: alert.timestamp,
      };
    }),

  acknowledgeAlert: (id) =>
    set((state) => {
      const newAlerts = state.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      );
      const unread = newAlerts.filter((a) => !a.acknowledged).length;
      const criticals = newAlerts.filter((a) => !a.acknowledged && a.priority === 'CRITICAL').length;
      return {
        alerts: newAlerts,
        unreadCount: unread,
        criticalCount: criticals,
        hasUnread: unread > 0,
      };
    }),

  acknowledgeAll: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, acknowledged: true })),
      unreadCount: 0,
      criticalCount: 0,
      hasUnread: false,
    })),

  clearAlerts: () =>
    set({
      alerts: [],
      unreadCount: 0,
      criticalCount: 0,
      hasUnread: false,
    }),

  removeAlert: (id) =>
    set((state) => {
      const newAlerts = state.alerts.filter((a) => a.id !== id);
      const unread = newAlerts.filter((a) => !a.acknowledged).length;
      return {
        alerts: newAlerts,
        unreadCount: unread,
        hasUnread: unread > 0,
      };
    }),

  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

  resetAlerts: () =>
    set({
      alerts: [],
      unreadCount: 0,
      soundEnabled: true,
      lastAlertTime: '',
      criticalCount: 0,
      hasUnread: false,
    }),
});
