import { ReactNode } from 'react';

type BadgeVariant = 'bullish' | 'bearish' | 'neutral' | 'accent' | 'muted' | 'danger' | 'info';
type BadgeSize = 'xs' | 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  bullish: 'bg-ict-bullish/15 text-ict-bullish border-ict-bullish/30',
  bearish: 'bg-ict-bearish/15 text-ict-bearish border-ict-bearish/30',
  neutral: 'bg-ict-neutral/15 text-ict-neutral border-ict-neutral/30',
  accent: 'bg-ict-accent/15 text-ict-accent border-ict-accent/30',
  muted: 'bg-ict-muted/10 text-ict-muted border-ict-muted/20',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

const dotColors: Record<BadgeVariant, string> = {
  bullish: 'bg-ict-bullish',
  bearish: 'bg-ict-bearish',
  neutral: 'bg-ict-neutral',
  accent: 'bg-ict-accent',
  muted: 'bg-ict-muted',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
};

export default function Badge({
  variant = 'muted',
  size = 'sm',
  children,
  dot = false,
  pulse = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        rounded-md border font-medium
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dotColors[variant]}`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}
