import { Instrument } from '../enums/index.js';
import { INSTRUMENTS } from '../constants/instruments.js';

export function getPipSize(instrument: Instrument): number {
  return INSTRUMENTS[instrument]?.pipSize ?? 0.0001;
}

export function getPipValue(instrument: Instrument): number {
  return INSTRUMENTS[instrument]?.pipValue ?? 10.0;
}

export function priceToPips(priceDistance: number, instrument: Instrument): number {
  return priceDistance / getPipSize(instrument);
}

export function pipToPrice(pips: number, instrument: Instrument): number {
  return pips * getPipSize(instrument);
}

export function calculateRR(entry: number, sl: number, tp: number): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  return risk > 0 ? reward / risk : 0;
}

export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  slPips: number,
  instrument: Instrument
): number {
  const riskAmount = accountBalance * (riskPercent / 100);
  const pipValue = getPipValue(instrument);
  if (slPips <= 0 || pipValue <= 0) return 0;
  return Math.round((riskAmount / (slPips * pipValue)) * 100) / 100;
}

export function isSpreadAcceptable(spread: number, instrument: Instrument): boolean {
  const maxSpread = INSTRUMENTS[instrument]?.maxSpread ?? 2.0;
  return spread <= maxSpread;
}

export function getEquilibrium(high: number, low: number): number {
  return low + (high - low) / 2;
}

export function isPremium(price: number, high: number, low: number): boolean {
  return price > getEquilibrium(high, low);
}

export function isDiscount(price: number, high: number, low: number): boolean {
  return price < getEquilibrium(high, low);
}

export function getFibLevel(high: number, low: number, level: number): number {
  return low + (high - low) * level;
}

export function formatPrice(price: number, instrument: Instrument): string {
  const config = INSTRUMENTS[instrument];
  if (!config) return price.toFixed(5);
  if (config.type === 'forex') return price.toFixed(5);
  if (config.type === 'commodity') return price.toFixed(2);
  return price.toFixed(2);
}
