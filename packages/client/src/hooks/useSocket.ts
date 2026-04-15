import { useEffect, useRef, useCallback } from 'react';
import { socket, connectSocket, disconnectSocket, getConnectionStatus } from '@/services/socket';
import { useStore } from '@/store';

export function useSocket() {
  const initialized = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCurrentPrice = useStore((s) => s.setCurrentPrice);
  const setConnected = useStore((s) => s.setConnected);
  const setConnectionStatus = useStore((s) => s.setConnectionStatus);
  const updateWeeklyBias = useStore((s) => s.updateWeeklyBias);
  const updateDailyBias = useStore((s) => s.updateDailyBias);
  const updatePO3 = useStore((s) => s.updatePO3);
  const setStructures = useStore((s) => s.setStructures);
  const updateAlignment = useStore((s) => s.updateAlignment);
  const setPOIs = useStore((s) => s.setPOIs);
  const updateLiquidityMap = useStore((s) => s.updateLiquidityMap);
  const setCurrentKillzone = useStore((s) => s.setCurrentKillzone);
  const setNextKillzone = useStore((s) => s.setNextKillzone);
  const setNYTime = useStore((s) => s.setNYTime);
  const updateConfluence = useStore((s) => s.updateConfluence);
  const setSignal = useStore((s) => s.setSignal);
  const addTrade = useStore((s) => s.addTrade);
  const updateTrade = useStore((s) => s.updateTrade);
  const setDailyPnl = useStore((s) => s.setDailyPnl);
  const setWeeklyPnl = useStore((s) => s.setWeeklyPnl);
  const setMonthlyPnl = useStore((s) => s.setMonthlyPnl);
  const setDXYPrice = useStore((s) => s.setDXYPrice);
  const setDXYTrend = useStore((s) => s.setDXYTrend);
  const setCorrelation = useStore((s) => s.setCorrelation);
  const setSMTDivergence = useStore((s) => s.setSMTDivergence);
  const setEvents = useStore((s) => s.setEvents);
  const setSafetyLevel = useStore((s) => s.setSafetyLevel);
  const addAlert = useStore((s) => s.addAlert);
  const setSpread = useStore((s) => s.setSpread);
  const setStats = useStore((s) => s.setStats);

  const handleReconnect = useCallback(() => {
    setConnectionStatus('reconnecting');
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
  }, [setConnectionStatus]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    connectSocket();

    // Connection lifecycle
    socket.on('connect', () => {
      setConnected(true);
      setConnectionStatus('connected');

      // Request current instrument data on reconnect
      const instrument = useStore.getState().instrument;
      socket.emit('subscribe:instrument', instrument);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setConnectionStatus('disconnected');

      // Don't clear data on disconnect -- show last known state
      if (reason === 'io server disconnect') {
        handleReconnect();
      }
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionStatus('error');
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setConnected(true);
      setConnectionStatus('connected');
      // Re-subscribe on reconnect
      const instrument = useStore.getState().instrument;
      socket.emit('subscribe:instrument', instrument);
    });

    // Price updates
    socket.on('price:update', (data: { price: number; spread?: number }) => {
      if (typeof data.price === 'number' && !isNaN(data.price)) {
        setCurrentPrice(data.price);
      }
      if (typeof data.spread === 'number') {
        setSpread(data.spread);
      }
    });

    // Bias updates
    socket.on('bias:weekly', (data) => {
      try { updateWeeklyBias(data); } catch (e) { console.error('[Socket] Error processing weekly bias:', e); }
    });
    socket.on('bias:daily', (data) => {
      try { updateDailyBias(data); } catch (e) { console.error('[Socket] Error processing daily bias:', e); }
    });
    socket.on('bias:po3', (data) => {
      try { updatePO3(data); } catch (e) { console.error('[Socket] Error processing PO3:', e); }
    });

    // Structure updates
    socket.on('structure:update', (data) => {
      try {
        if (data.structures) setStructures(data.structures);
        if (data.alignment) updateAlignment(data.alignment);
      } catch (e) { console.error('[Socket] Error processing structure:', e); }
    });

    // POI updates
    socket.on('poi:update', (data) => {
      try {
        if (data.pois) setPOIs(data.pois);
        if (data.liquidityMap) updateLiquidityMap(data.liquidityMap);
      } catch (e) { console.error('[Socket] Error processing POIs:', e); }
    });

    // Session updates
    socket.on('session:update', (data) => {
      try {
        if (data.current) setCurrentKillzone(data.current);
        if (data.next) setNextKillzone(data.next);
        if (data.nyTime) setNYTime(data.nyTime);
      } catch (e) { console.error('[Socket] Error processing session:', e); }
    });

    // Confluence updates
    socket.on('confluence:update', (data) => {
      try { updateConfluence(data); } catch (e) { console.error('[Socket] Error processing confluence:', e); }
    });

    // Entry signal
    socket.on('entry:signal', (data) => {
      try { setSignal(data); } catch (e) { console.error('[Socket] Error processing signal:', e); }
    });

    // Trade updates
    socket.on('trade:new', (data) => {
      try { addTrade(data); } catch (e) { console.error('[Socket] Error processing new trade:', e); }
    });
    socket.on('trade:update', (data) => {
      try { updateTrade(data.id, data); } catch (e) { console.error('[Socket] Error processing trade update:', e); }
    });
    socket.on('trade:pnl', (data) => {
      try {
        if (typeof data.daily === 'number') setDailyPnl(data.daily);
        if (typeof data.weekly === 'number') setWeeklyPnl(data.weekly);
        if (typeof data.monthly === 'number') setMonthlyPnl(data.monthly);
      } catch (e) { console.error('[Socket] Error processing PnL:', e); }
    });
    socket.on('trade:stats', (data) => {
      try { setStats(data); } catch (e) { console.error('[Socket] Error processing stats:', e); }
    });

    // DXY updates
    socket.on('dxy:update', (data) => {
      try {
        if (typeof data.price === 'number') setDXYPrice(data.price);
        if (data.trend) setDXYTrend(data.trend);
        if (data.correlation) setCorrelation(data.correlation, data.correlationScore ?? 0);
        if (data.smt) setSMTDivergence(data.smt);
      } catch (e) { console.error('[Socket] Error processing DXY:', e); }
    });

    // News updates
    socket.on('news:update', (data) => {
      try {
        if (data.events) setEvents(data.events);
        if (data.safety) setSafetyLevel(data.safety);
      } catch (e) { console.error('[Socket] Error processing news:', e); }
    });

    // Alerts
    socket.on('alert', (data) => {
      try { addAlert(data); } catch (e) { console.error('[Socket] Error processing alert:', e); }
    });

    return () => {
      disconnectSocket();
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      initialized.current = false;
    };
  }, []);

  return {
    socket,
    connected: useStore((s) => s.connected),
    connectionStatus: useStore((s) => s.connectionStatus),
  };
}
