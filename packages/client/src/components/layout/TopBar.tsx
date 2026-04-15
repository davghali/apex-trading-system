import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Wifi,
  WifiOff,
  ChevronDown,
  Bell,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '@/store';
import StatusDot from '@/components/common/StatusDot';
import Badge from '@/components/common/Badge';
import { formatCountdown } from '@/lib/formatters';
import { socket } from '@/services/socket';

const instruments = [
  'EURUSD',
  'GBPUSD',
  'XAUUSD',
  'NAS100',
  'US30',
  'SPX500',
  'USDJPY',
  'AUDUSD',
];

export default function TopBar() {
  const [nyTime, setNyTime] = useState('');
  const [showInstruments, setShowInstruments] = useState(false);

  const instrument = useStore((s) => s.instrument);
  const setInstrument = useStore((s) => s.setInstrument);
  const connected = useStore((s) => s.connected);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const currentKillzone = useStore((s) => s.currentKillzone);
  const unreadCount = useStore((s) => s.unreadCount);

  // Update NY time every second with requestAnimationFrame fallback
  useEffect(() => {
    let frameId: number;
    let lastUpdate = 0;

    const updateTime = (timestamp: number) => {
      if (timestamp - lastUpdate >= 1000 || lastUpdate === 0) {
        lastUpdate = timestamp;
        try {
          const now = new Date();
          setNyTime(
            now.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
              timeZone: 'America/New_York',
            })
          );
        } catch {
          setNyTime('--:--:--');
        }
      }
      frameId = requestAnimationFrame(updateTime);
    };

    frameId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleInstrumentChange = useCallback((inst: string) => {
    setInstrument(inst);
    setShowInstruments(false);
    // Notify server of instrument change
    if (socket.connected) {
      socket.emit('subscribe:instrument', { instrument: inst });
    }
  }, [setInstrument]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showInstruments) return;
    const handleClick = () => setShowInstruments(false);
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showInstruments]);

  const isActive = currentKillzone?.active || false;
  const kzLabel = currentKillzone?.label || 'Off Session';
  const kzName = currentKillzone?.name || 'NONE';
  const remaining = typeof currentKillzone?.remainingSeconds === 'number' ? currentKillzone.remainingSeconds : 0;

  const kzVariant = isActive
    ? kzName === 'NY_AM' || kzName === 'LONDON'
      ? 'bullish'
      : 'accent'
    : 'muted';

  const connectionStatusDot = connected ? 'online' :
    connectionStatus === 'reconnecting' ? 'warning' : 'offline';
  const connectionLabel = connected ? 'Algo Active' :
    connectionStatus === 'reconnecting' ? 'Reconnecting...' :
    connectionStatus === 'error' ? 'Connection Error' : 'Disconnected';

  const safeUnread = typeof unreadCount === 'number' ? unreadCount : 0;

  return (
    <header className="h-12 bg-ict-dark-bg/60 backdrop-blur-xl border-b border-ict-border/20 flex items-center justify-between px-5 z-40">
      {/* Left section */}
      <div className="flex items-center gap-6">
        {/* NY Time */}
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-ict-muted" />
          <span className="text-sm font-mono font-medium text-ict-text tracking-wider tabular-nums">
            {nyTime || '--:--:--'}
          </span>
          <span className="text-[10px] text-ict-muted">NY</span>
        </div>

        <div className="h-5 w-px bg-ict-border/30" />

        {/* Killzone indicator */}
        <div className="flex items-center gap-2">
          <Badge
            variant={kzVariant}
            size="xs"
            dot
            pulse={isActive}
          >
            {kzLabel}
          </Badge>
          {isActive && remaining > 0 && (
            <span className="text-xs font-mono text-ict-muted tabular-nums">
              {formatCountdown(remaining)}
            </span>
          )}
        </div>
      </div>

      {/* Center - Instrument selector */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowInstruments(!showInstruments);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ict-card/50 border border-ict-border/30 hover:border-ict-accent/30 transition-all"
        >
          <Activity size={14} className="text-ict-accent" />
          <span className="text-sm font-semibold text-ict-text">{instrument}</span>
          <ChevronDown
            size={14}
            className={`text-ict-muted transition-transform ${showInstruments ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence>
          {showInstruments && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full mt-1 left-1/2 -translate-x-1/2 min-w-[160px] bg-ict-card border border-ict-border/50 rounded-xl overflow-hidden shadow-2xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              {instruments.map((inst) => (
                <button
                  key={inst}
                  onClick={() => handleInstrumentChange(inst)}
                  className={`
                    w-full px-4 py-2 text-left text-sm transition-colors
                    ${
                      inst === instrument
                        ? 'bg-ict-accent/10 text-ict-accent font-semibold'
                        : 'text-ict-text hover:bg-white/5'
                    }
                  `}
                >
                  {inst}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <StatusDot
            status={connectionStatusDot}
            size="sm"
          />
          <span className="text-xs text-ict-muted">
            {connectionLabel}
          </span>
        </div>

        <div className="h-5 w-px bg-ict-border/30" />

        {/* Connection icon */}
        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi size={14} className="text-ict-bullish" />
          ) : connectionStatus === 'reconnecting' ? (
            <RefreshCw size={14} className="text-ict-neutral animate-spin" />
          ) : (
            <WifiOff size={14} className="text-ict-bearish" />
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <Bell size={16} className="text-ict-muted" />
          {safeUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-ict-bearish text-[9px] font-bold text-white flex items-center justify-center"
            >
              {safeUnread > 9 ? '9+' : safeUnread}
            </motion.span>
          )}
        </button>
      </div>
    </header>
  );
}
