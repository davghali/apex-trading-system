import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'accent' | 'bullish' | 'bearish' | 'neutral';
  height?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
}

const colorGradients: Record<string, string> = {
  accent: 'from-ict-accent to-cyan-300',
  bullish: 'from-ict-bullish to-green-300',
  bearish: 'from-ict-bearish to-red-300',
  neutral: 'from-ict-neutral to-yellow-300',
};

const glowColors: Record<string, string> = {
  accent: 'shadow-[0_0_10px_rgba(0,188,212,0.3)]',
  bullish: 'shadow-[0_0_10px_rgba(0,200,83,0.3)]',
  bearish: 'shadow-[0_0_10px_rgba(255,23,68,0.3)]',
  neutral: 'shadow-[0_0_10px_rgba(255,214,0,0.3)]',
};

const heights: Record<string, string> = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2.5',
};

export default function ProgressBar({
  value,
  max = 100,
  color = 'accent',
  height = 'md',
  showLabel = false,
  label,
  animated = true,
  className = '',
}: ProgressBarProps) {
  const percent = Math.min((value / max) * 100, 100);

  return (
    <div className={className}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-1">
          {label && (
            <span className="text-xs text-ict-muted">{label}</span>
          )}
          {showLabel && (
            <span className="text-xs font-mono text-ict-text">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full ${heights[height]} rounded-full bg-ict-border/30 overflow-hidden`}>
        <motion.div
          className={`
            h-full rounded-full
            bg-gradient-to-r ${colorGradients[color]}
            ${glowColors[color]}
          `}
          initial={animated ? { width: 0 } : { width: `${percent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
