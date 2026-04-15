export function formatPrice(price: number, instrument?: string): string {
  if (!price && price !== 0) return '--';
  const isJpy = instrument?.includes('JPY');
  const isXau = instrument?.includes('XAU');
  const isIndex = instrument?.includes('NAS') || instrument?.includes('SPX') || instrument?.includes('US30');

  if (isXau) return price.toFixed(2);
  if (isIndex) return price.toFixed(1);
  if (isJpy) return price.toFixed(3);
  return price.toFixed(5);
}

export function formatPips(pips: number): string {
  if (!pips && pips !== 0) return '--';
  const sign = pips >= 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

export function formatPercent(value: number, decimals = 1): string {
  if (!value && value !== 0) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatCurrency(value: number, currency = 'USD'): string {
  if (!value && value !== 0) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRR(rr: number): string {
  if (!rr && rr !== 0) return '--';
  return `${rr >= 0 ? '+' : ''}${rr.toFixed(1)}R`;
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
