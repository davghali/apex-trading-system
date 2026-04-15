import { SessionName } from '../enums/index.js';
import { KILLZONES } from '../constants/killzones.js';

export function getNYTime(date: Date = new Date()): { hours: number; minutes: number; formatted: string } {
  const nyStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nyDate = new Date(nyStr);
  return {
    hours: nyDate.getHours(),
    minutes: nyDate.getMinutes(),
    formatted: `${String(nyDate.getHours()).padStart(2, '0')}:${String(nyDate.getMinutes()).padStart(2, '0')}`,
  };
}

export function getParisTime(date: Date = new Date()): string {
  return date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function getCurrentKillzone(date: Date = new Date()): SessionName | null {
  const ny = getNYTime(date);
  const nowMinutes = ny.hours * 60 + ny.minutes;

  for (const [key, kz] of Object.entries(KILLZONES)) {
    const start = parseTimeToMinutes(kz.startNY);
    let end = parseTimeToMinutes(kz.endNY);

    if (end < start) {
      if (nowMinutes >= start || nowMinutes < end) return kz.name;
    } else {
      if (nowMinutes >= start && nowMinutes < end) return kz.name;
    }
  }
  return null;
}

export function getTimeUntilNextKZ(date: Date = new Date()): { session: SessionName; minutesUntil: number } | null {
  const ny = getNYTime(date);
  const nowMinutes = ny.hours * 60 + ny.minutes;

  const kzStarts = [
    { session: SessionName.LONDON_KZ, start: parseTimeToMinutes(KILLZONES.LONDON_KZ.startNY) },
    { session: SessionName.NY_KZ, start: parseTimeToMinutes(KILLZONES.NY_KZ.startNY) },
  ];

  let nearest: { session: SessionName; minutesUntil: number } | null = null;

  for (const kz of kzStarts) {
    let diff = kz.start - nowMinutes;
    if (diff < 0) diff += 1440;
    if (!nearest || diff < nearest.minutesUntil) {
      nearest = { session: kz.session, minutesUntil: diff };
    }
  }

  return nearest;
}

export function getMidnightOpenTime(date: Date = new Date()): Date {
  const nyStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nyDate = new Date(nyStr);
  nyDate.setHours(0, 0, 0, 0);
  return nyDate;
}

export function getDayOfWeek(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
}

export function isFridayAfternoon(date: Date = new Date()): boolean {
  const ny = getNYTime(date);
  const dow = getDayOfWeek(date);
  return dow === 'Friday' && ny.hours >= 12;
}
