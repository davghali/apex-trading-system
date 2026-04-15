import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  Shield,
  Filter,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import StatusDot from '@/components/common/StatusDot';
import ProgressBar from '@/components/common/ProgressBar';
import { useStore } from '@/store';
import type { EconomicEvent, NewsImpact } from '@/store/slices/newsSlice';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const currencies = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

function getImpactVariant(impact: NewsImpact): 'bearish' | 'neutral' | 'muted' {
  if (impact === 'HIGH') return 'bearish';
  if (impact === 'MEDIUM') return 'neutral';
  return 'muted';
}

function getImpactDots(impact: NewsImpact): number {
  if (impact === 'HIGH') return 3;
  if (impact === 'MEDIUM') return 2;
  return 1;
}

function formatTimeUntil(minutes: number | undefined): string {
  if (typeof minutes !== 'number' || isNaN(minutes)) return '--';
  if (minutes < 1) return 'NOW';
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function EventRow({ event }: { event: EconomicEvent }) {
  const dots = getImpactDots(event.impact);
  const safeMinutes = typeof event.minutesUntil === 'number' ? event.minutesUntil : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`
        flex items-center justify-between p-3 rounded-lg
        ${event.impact === 'HIGH' ? 'bg-ict-bearish/[0.03] border border-ict-bearish/10' :
          event.impact === 'MEDIUM' ? 'bg-ict-neutral/[0.03] border border-ict-neutral/10' :
          'bg-white/[0.02] border border-ict-border/10'}
        hover:bg-white/[0.04] transition-colors
      `}
    >
      {/* Time */}
      <div className="flex items-center gap-3 min-w-[120px]">
        <span className="text-xs font-mono text-ict-muted w-14">
          {(() => {
            try {
              return new Date(event.time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/New_York',
              });
            } catch {
              return '--:--';
            }
          })()}
        </span>

        {/* Impact dots */}
        <div className="flex gap-0.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i < dots
                  ? event.impact === 'HIGH' ? 'bg-ict-bearish shadow-[0_0_4px_rgba(255,23,68,0.5)]' :
                    event.impact === 'MEDIUM' ? 'bg-ict-neutral' : 'bg-ict-muted'
                  : 'bg-ict-border/30'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Currency */}
      <div className="min-w-[50px]">
        <Badge variant={getImpactVariant(event.impact)} size="xs">
          {event.currency || '--'}
        </Badge>
      </div>

      {/* Title */}
      <div className="flex-1 px-3">
        <span className="text-xs text-ict-text">{event.title || 'Unknown Event'}</span>
      </div>

      {/* Forecast / Previous / Actual */}
      <div className="flex items-center gap-4 min-w-[200px]">
        <div className="text-center">
          <span className="text-[9px] text-ict-muted block">Forecast</span>
          <span className="text-xs font-mono text-ict-text">{event.forecast || '--'}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] text-ict-muted block">Previous</span>
          <span className="text-xs font-mono text-ict-text">{event.previous || '--'}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] text-ict-muted block">Actual</span>
          <span className="text-xs font-mono text-ict-accent font-semibold">{event.actual || '--'}</span>
        </div>
      </div>

      {/* Timer / Countdown */}
      {event.isUpcoming && safeMinutes !== undefined && (
        <div className="ml-3">
          <Badge
            variant={safeMinutes < 15 ? 'bearish' : safeMinutes < 60 ? 'neutral' : 'muted'}
            size="xs"
            dot
            pulse={safeMinutes < 15}
          >
            {formatTimeUntil(safeMinutes)}
          </Badge>
        </div>
      )}
    </motion.div>
  );
}

export default function CalendarPage() {
  try {
    const events = useStore((s) => s.events);
    const safetyLevel = useStore((s) => s.safetyLevel);
    const nextHighImpact = useStore((s) => s.nextHighImpact);

    const [currencyFilter, setCurrencyFilter] = useState('ALL');
    const [impactFilter, setImpactFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

    const safeEvents = Array.isArray(events) ? events : [];
    const safeSafety = safetyLevel || 'SAFE';

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    // Filtered events
    const filteredEvents = useMemo(() => {
      return safeEvents.filter((e) => {
        if (currencyFilter !== 'ALL' && e.currency !== currencyFilter) return false;
        if (impactFilter !== 'ALL' && e.impact !== impactFilter) return false;
        return true;
      });
    }, [safeEvents, currencyFilter, impactFilter]);

    const highImpact = safeEvents.filter((e) => e.impact === 'HIGH');
    const upcoming = safeEvents.filter((e) => e.isUpcoming);

    // Algo Shield countdown
    const nextHighMinutes = nextHighImpact?.minutesUntil;
    const [countdown, setCountdown] = useState(typeof nextHighMinutes === 'number' ? nextHighMinutes * 60 : 0);

    useEffect(() => {
      if (typeof nextHighMinutes === 'number') {
        setCountdown(nextHighMinutes * 60);
      }
    }, [nextHighMinutes]);

    useEffect(() => {
      if (countdown <= 0) return;
      const timer = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }, [countdown]);

    const countdownMinutes = Math.floor(countdown / 60);
    const countdownSeconds = Math.floor(countdown % 60);

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-ict-text">Economic Calendar</h1>
            <p className="text-xs text-ict-muted mt-0.5">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusDot
              status={safeSafety === 'SAFE' ? 'online' : safeSafety === 'CAUTION' ? 'warning' : 'offline'}
              label={`Trading: ${safeSafety}`}
            />
          </div>
        </motion.div>

        {/* Algo Shield Status Bar */}
        <motion.div variants={itemVariants}>
          <div className={`p-4 rounded-xl border ${
            safeSafety === 'SAFE' ? 'bg-ict-bullish/5 border-ict-bullish/15' :
            safeSafety === 'CAUTION' ? 'bg-ict-neutral/5 border-ict-neutral/15' :
            'bg-ict-bearish/5 border-ict-bearish/15'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield size={18} className={
                  safeSafety === 'SAFE' ? 'text-ict-bullish' :
                  safeSafety === 'CAUTION' ? 'text-ict-neutral' :
                  'text-ict-bearish'
                } />
                <div>
                  <span className="text-xs font-semibold text-ict-text">Algo Shield</span>
                  <span className={`text-lg font-bold block ${
                    safeSafety === 'SAFE' ? 'text-ict-bullish' :
                    safeSafety === 'CAUTION' ? 'text-ict-neutral' :
                    'text-ict-bearish'
                  }`}>
                    {safeSafety === 'SAFE' ? 'SAFE TO TRADE' :
                     safeSafety === 'CAUTION' ? 'USE CAUTION' :
                     'TRADING BLOCKED'}
                  </span>
                </div>
              </div>

              {/* Countdown to next high-impact */}
              {nextHighImpact && countdown > 0 && (
                <div className="text-right">
                  <span className="text-[10px] text-ict-muted block">Next high-impact in</span>
                  <span className="text-xl font-mono font-bold text-ict-text tabular-nums">
                    {countdownMinutes.toString().padStart(2, '0')}:{countdownSeconds.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-ict-muted block mt-0.5">
                    {nextHighImpact.currency} - {nextHighImpact.title}
                  </span>
                </div>
              )}
            </div>

            {/* Safety progress bar */}
            {nextHighImpact && countdown > 0 && (
              <div className="mt-3">
                <ProgressBar
                  value={Math.max(0, 100 - (countdown / (30 * 60)) * 100)}
                  color={safeSafety === 'DANGER' ? 'bearish' : safeSafety === 'CAUTION' ? 'neutral' : 'bullish'}
                  height="sm"
                  animated
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* Summary cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-ict-card/80 border border-ict-border/30">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-ict-bearish" />
              <span className="text-xs font-semibold text-ict-text">High Impact</span>
            </div>
            <span className="text-lg font-bold text-ict-bearish">{highImpact.length}</span>
            <span className="text-xs text-ict-muted ml-1">events today</span>
          </div>

          <div className="p-4 rounded-xl bg-ict-card/80 border border-ict-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-ict-accent" />
              <span className="text-xs font-semibold text-ict-text">Upcoming</span>
            </div>
            <span className="text-lg font-bold text-ict-accent">{upcoming.length}</span>
            <span className="text-xs text-ict-muted ml-1">remaining</span>
          </div>

          <div className="p-4 rounded-xl bg-ict-card/80 border border-ict-border/30">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={14} className="text-ict-accent" />
              <span className="text-xs font-semibold text-ict-text">Total Events</span>
            </div>
            <span className="text-lg font-bold text-ict-text">{safeEvents.length}</span>
          </div>
        </motion.div>

        {/* Currency Filter */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-ict-muted" />
            <span className="text-[10px] text-ict-muted uppercase">Currency:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {currencies.map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrencyFilter(cur)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  currencyFilter === cur
                    ? 'bg-ict-accent/15 text-ict-accent border border-ict-accent/30'
                    : 'text-ict-muted hover:text-ict-text bg-ict-card/50 border border-ict-border/20'
                }`}
              >
                {cur}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-ict-muted uppercase">Impact:</span>
            {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((imp) => (
              <button
                key={imp}
                onClick={() => setImpactFilter(imp)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  impactFilter === imp
                    ? imp === 'HIGH' ? 'bg-ict-bearish/15 text-ict-bearish border border-ict-bearish/30' :
                      imp === 'MEDIUM' ? 'bg-ict-neutral/15 text-ict-neutral border border-ict-neutral/30' :
                      'bg-ict-accent/15 text-ict-accent border border-ict-accent/30'
                    : 'text-ict-muted hover:text-ict-text bg-ict-card/50 border border-ict-border/20'
                }`}
              >
                {imp}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Events list */}
        <motion.div variants={itemVariants}>
          <Card
            title="Events"
            headerRight={<span className="text-[10px] font-mono text-ict-muted">{filteredEvents.length} events</span>}
          >
            <div className="space-y-2">
              {/* Highlight upcoming high-impact events */}
              {filteredEvents.filter((e) => e.impact === 'HIGH' && e.isUpcoming).length > 0 && (
                <div className="mb-3">
                  <span className="text-[10px] text-ict-bearish uppercase font-semibold mb-1 block">
                    Upcoming High Impact
                  </span>
                  {filteredEvents
                    .filter((e) => e.impact === 'HIGH' && e.isUpcoming)
                    .map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                </div>
              )}

              {/* All events */}
              {filteredEvents.length > 0 ? filteredEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              )) : (
                <div className="text-center py-12">
                  <CalendarDays size={28} className="text-ict-muted/20 mx-auto mb-2" />
                  <span className="text-sm text-ict-muted">No events match your filters</span>
                  <p className="text-xs text-ict-muted/60 mt-1">
                    {safeEvents.length === 0 ? 'Events will appear when the server is connected' : 'Try adjusting your filters'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    );
  } catch {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={24} className="text-ict-bearish mx-auto mb-2" />
        <span className="text-sm text-ict-muted">Calendar page encountered an error. Please refresh.</span>
      </div>
    );
  }
}
