interface StatusDotProps {
  status: 'online' | 'offline' | 'warning' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  online: 'bg-ict-bullish',
  offline: 'bg-ict-bearish',
  warning: 'bg-ict-neutral',
  idle: 'bg-ict-muted',
};

const glowColors: Record<string, string> = {
  online: 'shadow-[0_0_8px_rgba(0,200,83,0.6)]',
  offline: 'shadow-[0_0_8px_rgba(255,23,68,0.6)]',
  warning: 'shadow-[0_0_8px_rgba(255,214,0,0.6)]',
  idle: 'shadow-none',
};

const sizes: Record<string, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

export default function StatusDot({
  status,
  size = 'md',
  label,
  className = '',
}: StatusDotProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex">
        {status !== 'idle' && (
          <span
            className={`
              absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping
              ${statusColors[status]}
            `}
          />
        )}
        <span
          className={`
            relative inline-flex rounded-full
            ${sizes[size]}
            ${statusColors[status]}
            ${glowColors[status]}
          `}
        />
      </span>
      {label && (
        <span className="text-xs text-ict-muted">{label}</span>
      )}
    </div>
  );
}
