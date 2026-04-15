import { motion } from 'framer-motion';
import { GRADE_COLORS } from '@/lib/colors';

interface GaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  grade?: string;
  label?: string;
  className?: string;
}

export default function Gauge({
  value,
  max = 100,
  size = 140,
  strokeWidth = 10,
  grade,
  label,
  className = '',
}: GaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI * 1.5; // 270 degrees arc
  const normalizedValue = Math.min(value, max) / max;
  const dashOffset = circumference * (1 - normalizedValue);
  const center = size / 2;

  // Determine color based on value
  const getColor = (): string => {
    if (grade && GRADE_COLORS[grade]) return GRADE_COLORS[grade];
    if (normalizedValue >= 0.8) return '#00C853';
    if (normalizedValue >= 0.6) return '#4CAF50';
    if (normalizedValue >= 0.4) return '#FFD600';
    if (normalizedValue >= 0.2) return '#FF9800';
    return '#FF1744';
  };

  const color = getColor();
  const startAngle = 135;

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-[0deg]"
      >
        {/* Background arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#2A2A4A"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${center} ${center})`}
          opacity={0.4}
        />

        {/* Value arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${center} ${center})`}
          style={{
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />

        {/* Glow effect */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${center} ${center})`}
          opacity={0.15}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {grade && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            className="text-3xl font-bold"
            style={{ color }}
          >
            {grade}
          </motion.span>
        )}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-lg font-mono font-semibold text-ict-text"
        >
          {Math.round(value)}
        </motion.span>
        {label && (
          <span className="text-[10px] text-ict-muted uppercase tracking-wider mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
