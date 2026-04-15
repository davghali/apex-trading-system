import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Timer, Zap } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';

const kzLabels: Record<string, { label: string; color: string; gradient: string }> = {
  ASIAN: { label: 'Asian Session', color: 'text-purple-400', gradient: 'from-purple-500 to-purple-300' },
  LONDON: { label: 'London Killzone', color: 'text-ict-bullish', gradient: 'from-ict-bullish to-green-300' },
  NY_AM: { label: 'NY AM Killzone', color: 'text-ict-accent', gradient: 'from-ict-accent to-cyan-300' },
  NY_PM: { label: 'NY PM Session', color: 'text-orange-400', gradient: 'from-orange-500 to-orange-300' },
  NONE: { label: 'Off Session', color: 'text-ict-muted', gradient: 'from-ict-muted to-gray-500' },
};

const modelDescriptions: Record<string, string> = {
  CLASSIC: 'Classic ICT model: liquidity sweep into POI',
  SILVER_BULLET: 'Silver Bullet: 10:00-11:00 / 14:00-15:00 window',
  MACRO: 'Macro timing: :50-:10 window',
  NONE: 'No active model',
};

function formatMmSs(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function KillzoneWidget() {
  try {
    const currentKillzone = useStore((s) => s.currentKillzone);
    const nextKillzone = useStore((s) => s.nextKillzone);

    const kzName = currentKillzone?.name || 'NONE';
    const kzInfo = kzLabels[kzName] || kzLabels.NONE;
    const isActive = currentKillzone?.active || false;
    const progress = typeof currentKillzone?.progress === 'number' ? currentKillzone.progress : 0;
    const remaining = typeof currentKillzone?.remainingSeconds === 'number' ? currentKillzone.remainingSeconds : 0;
    const model = currentKillzone?.model || 'NONE';
    const characteristics = Array.isArray(currentKillzone?.characteristics) ? currentKillzone.characteristics : [];

    // Local countdown timer for smooth display
    const [displaySeconds, setDisplaySeconds] = useState(remaining);

    useEffect(() => {
      setDisplaySeconds(remaining);
    }, [remaining]);

    useEffect(() => {
      if (!isActive || displaySeconds <= 0) return;
      const timer = setInterval(() => {
        setDisplaySeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }, [isActive, displaySeconds]);

    return (
      <Card
        title="Session & Timing"
        accent={isActive ? 'bullish' : 'neutral'}
        headerRight={
          <Badge
            variant={isActive ? 'bullish' : 'muted'}
            size="xs"
            dot
            pulse={isActive}
          >
            {isActive ? 'LIVE' : 'WAITING'}
          </Badge>
        }
      >
        <div className="space-y-4">
          {/* Current KZ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className={kzInfo.color} />
                <span className={`text-sm font-semibold ${kzInfo.color}`}>
                  {kzInfo.label}
                </span>
              </div>
              {isActive && (
                <motion.span
                  className="text-xl font-mono font-bold text-ict-text tabular-nums"
                  key={displaySeconds}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {formatMmSs(displaySeconds)}
                </motion.span>
              )}
            </div>

            {/* Animated gradient progress bar */}
            {isActive && (
              <div className="h-2 rounded-full bg-ict-border/30 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${kzInfo.gradient}`}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{
                    boxShadow: '0 0 12px rgba(0,188,212,0.4)',
                  }}
                />
              </div>
            )}

            {/* Time range */}
            {currentKillzone?.start && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-ict-muted">
                  {currentKillzone.start}
                </span>
                <span className="text-[10px] font-mono text-ict-muted">
                  {currentKillzone.end || '--'}
                </span>
              </div>
            )}
          </div>

          {/* Model with direction */}
          {model !== 'NONE' && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-2 rounded-lg bg-ict-accent/5 border border-ict-accent/10"
            >
              <div className="flex items-center gap-2 mb-1">
                <Timer size={12} className="text-ict-accent" />
                <span className="text-xs font-semibold text-ict-accent">
                  {model}
                </span>
              </div>
              <p className="text-[10px] text-ict-muted leading-relaxed">
                {modelDescriptions[model] || 'Active model'}
              </p>
            </motion.div>
          )}

          {/* Characteristics */}
          {characteristics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {characteristics.map((char, i) => (
                <Badge key={i} variant="muted" size="xs">
                  {char}
                </Badge>
              ))}
            </div>
          )}

          {/* Next KZ preview */}
          {nextKillzone && (
            <div className="border-t border-ict-border/20 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-ict-muted" />
                  <span className="text-[11px] text-ict-muted">Next:</span>
                  <span className="text-[11px] font-medium text-ict-text">
                    {nextKillzone.label || '--'}
                  </span>
                </div>
                <span className="text-xs font-mono text-ict-muted">
                  in {typeof nextKillzone.startsIn === 'number' ? formatMmSs(nextKillzone.startsIn) : '--'}
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Session & Timing" accent="neutral">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load session data</span>
        </div>
      </Card>
    );
  }
}
