export const COLORS = {
  bg: '#0A0A0F',
  darkBg: '#050508',
  card: '#1A1A2E',
  cardHover: '#222240',
  border: '#2A2A4A',
  bullish: '#00C853',
  bearish: '#FF1744',
  neutral: '#FFD600',
  accent: '#00BCD4',
  text: '#E0E0E0',
  muted: '#6B7280',
  white: '#FFFFFF',
} as const;

export const CHART_COLORS = {
  background: '#0A0A0F',
  grid: '#1A1A2E',
  crosshair: '#6B7280',
  upColor: '#00C853',
  downColor: '#FF1744',
  wickUp: '#00C853',
  wickDown: '#FF1744',
  volume: 'rgba(0, 188, 212, 0.2)',
  priceLine: '#00BCD4',
} as const;

export const GRADE_COLORS: Record<string, string> = {
  'A+': '#00C853',
  A: '#00C853',
  'B+': '#4CAF50',
  B: '#8BC34A',
  C: '#FFD600',
  D: '#FF9800',
  F: '#FF1744',
};

export type BiasDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export function getBiasColor(bias: BiasDirection): string {
  switch (bias) {
    case 'BULLISH':
      return COLORS.bullish;
    case 'BEARISH':
      return COLORS.bearish;
    default:
      return COLORS.neutral;
  }
}

export function getBiasBgClass(bias: BiasDirection): string {
  switch (bias) {
    case 'BULLISH':
      return 'bg-ict-bullish/10 border-ict-bullish/30 text-ict-bullish';
    case 'BEARISH':
      return 'bg-ict-bearish/10 border-ict-bearish/30 text-ict-bearish';
    default:
      return 'bg-ict-neutral/10 border-ict-neutral/30 text-ict-neutral';
  }
}
