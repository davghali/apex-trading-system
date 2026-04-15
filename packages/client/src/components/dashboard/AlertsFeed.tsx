import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Crosshair,
  Shield,
  Newspaper,
  Clock,
  Cpu,
  Target,
  Check,
  Bell,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import { timeAgo } from '@/lib/formatters';
import type { Alert, AlertPriority, AlertType } from '@/store/slices/alertSlice';

const priorityVariant: Record<AlertPriority, 'bearish' | 'danger' | 'neutral' | 'accent' | 'muted'> = {
  CRITICAL: 'danger',
  HIGH: 'bearish',
  MEDIUM: 'neutral',
  LOW: 'accent',
  INFO: 'muted',
};

const priorityBorderColors: Record<AlertPriority, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-ict-bearish',
  MEDIUM: 'border-l-ict-neutral',
  LOW: 'border-l-ict-accent',
  INFO: 'border-l-ict-muted',
};

const typeIcons: Record<AlertType, typeof AlertTriangle> = {
  ENTRY_SIGNAL: Crosshair,
  POI_PROXIMITY: Target,
  STRUCTURE_BREAK: AlertTriangle,
  NEWS_WARNING: Newspaper,
  SESSION_START: Clock,
  RISK_ALERT: Shield,
  SYSTEM: Cpu,
};

function AlertItem({ alert, onAck }: { alert: Alert; onAck: (id: string) => void }) {
  const Icon = typeIcons[alert.type] || Bell;
  const borderColor = priorityBorderColors[alert.priority] || 'border-l-ict-muted';
  const safeTimestamp = alert.timestamp || new Date().toISOString();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: alert.acknowledged ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        flex items-start gap-3 p-2.5 rounded-lg transition-colors
        border-l-2 ${borderColor}
        ${alert.acknowledged ? 'opacity-40' : 'bg-white/[0.02]'}
        hover:bg-white/[0.04]
      `}
    >
      {/* Icon */}
      <div className={`
        mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
        ${alert.priority === 'CRITICAL' ? 'bg-red-500/15' :
          alert.priority === 'HIGH' ? 'bg-ict-bearish/10' :
          alert.priority === 'MEDIUM' ? 'bg-ict-neutral/10' :
          'bg-ict-accent/10'}
      `}>
        <Icon size={12} className={
          alert.priority === 'CRITICAL' ? 'text-red-400' :
          alert.priority === 'HIGH' ? 'text-ict-bearish' :
          alert.priority === 'MEDIUM' ? 'text-ict-neutral' :
          'text-ict-accent'
        } />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ict-text truncate">
            {alert.title || 'Alert'}
          </span>
          <Badge variant={priorityVariant[alert.priority]} size="xs">
            {alert.priority || 'INFO'}
          </Badge>
        </div>
        <p className="text-[10px] text-ict-muted mt-0.5 line-clamp-2">
          {alert.message || ''}
        </p>
        <span className="text-[9px] text-ict-muted/60 mt-1 block">
          {timeAgo(safeTimestamp)}
        </span>
      </div>

      {/* Acknowledge button with fade */}
      {!alert.acknowledged && (
        <motion.button
          onClick={() => onAck(alert.id)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex-shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
          title="Acknowledge"
        >
          <Check size={12} className="text-ict-muted hover:text-ict-bullish transition-colors" />
        </motion.button>
      )}
    </motion.div>
  );
}

export default function AlertsFeed() {
  try {
    const alerts = useStore((s) => s.alerts);
    const unreadCount = useStore((s) => s.unreadCount);
    const acknowledgeAlert = useStore((s) => s.acknowledgeAlert);
    const acknowledgeAll = useStore((s) => s.acknowledgeAll);

    const scrollRef = useRef<HTMLDivElement>(null);
    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    const safeUnread = typeof unreadCount === 'number' ? unreadCount : 0;

    // Auto-scroll to newest alerts when new ones arrive
    useEffect(() => {
      if (scrollRef.current && safeUnread > 0) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, [safeAlerts.length, safeUnread]);

    return (
      <Card
        title="Alerts"
        accent={safeUnread > 0 ? 'bearish' : 'none'}
        headerRight={
          <div className="flex items-center gap-2">
            {safeUnread > 0 && (
              <>
                <Badge variant="bearish" size="xs" dot pulse>
                  {safeUnread} new
                </Badge>
                <motion.button
                  onClick={acknowledgeAll}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-[10px] text-ict-muted hover:text-ict-accent transition-colors"
                >
                  Clear all
                </motion.button>
              </>
            )}
          </div>
        }
      >
        <div
          ref={scrollRef}
          className="space-y-1 max-h-[280px] overflow-y-auto no-scrollbar"
        >
          <AnimatePresence mode="popLayout">
            {safeAlerts.length > 0 ? (
              safeAlerts.slice(0, 15).map((alert) => (
                <AlertItem key={alert.id} alert={alert} onAck={acknowledgeAlert} />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8"
              >
                <Bell size={20} className="text-ict-muted/30 mx-auto mb-2" />
                <span className="text-xs text-ict-muted">No alerts yet</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Alerts" accent="none">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load alerts</span>
        </div>
      </Card>
    );
  }
}
