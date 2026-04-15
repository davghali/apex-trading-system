import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  accent?: 'cyan' | 'bullish' | 'bearish' | 'neutral' | 'none';
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  noPadding?: boolean;
  onClick?: () => void;
}

const accentColors: Record<string, string> = {
  cyan: 'border-t-ict-accent',
  bullish: 'border-t-ict-bullish',
  bearish: 'border-t-ict-bearish',
  neutral: 'border-t-ict-neutral',
  none: '',
};

export default function Card({
  title,
  subtitle,
  accent = 'none',
  children,
  className = '',
  headerRight,
  noPadding = false,
  onClick,
}: CardProps) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ opacity: 1 }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl
        bg-ict-card/80 backdrop-blur-xl
        border border-ict-border/50
        ${accent !== 'none' ? `border-t-2 ${accentColors[accent]}` : ''}
        shadow-card
        transition-all duration-300
        hover:border-ict-border/80
        ${onClick ? 'cursor-pointer hover:shadow-glow' : ''}
        ${className}
      `}
    >
      {/* Subtle inner glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

      {title && (
        <div className={`relative flex items-center justify-between ${noPadding ? 'px-4 pt-4' : 'px-4 pt-4 pb-2'}`}>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ict-muted">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] text-ict-muted/60 mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}

      <div className={`relative ${noPadding ? '' : 'p-4'} ${title && !noPadding ? 'pt-2' : ''}`}>
        {children}
      </div>
    </motion.div>
  );
}
