import { Router, type Request, type Response } from 'express';
import { engineClient } from '../services/engine-client.js';

const router = Router();

// ── Currency mapping for instrument relevance ───────────────

const INSTRUMENT_CURRENCIES: Record<string, string[]> = {
  EURUSD: ['EUR', 'USD'],
  GBPUSD: ['GBP', 'USD'],
  USDJPY: ['USD', 'JPY'],
  USDCHF: ['USD', 'CHF'],
  AUDUSD: ['AUD', 'USD'],
  NZDUSD: ['NZD', 'USD'],
  USDCAD: ['USD', 'CAD'],
  EURGBP: ['EUR', 'GBP'],
  EURJPY: ['EUR', 'JPY'],
  GBPJPY: ['GBP', 'JPY'],
  AUDJPY: ['AUD', 'JPY'],
  CADJPY: ['CAD', 'JPY'],
  CHFJPY: ['CHF', 'JPY'],
  EURAUD: ['EUR', 'AUD'],
  EURNZD: ['EUR', 'NZD'],
  EURCAD: ['EUR', 'CAD'],
  EURCHF: ['EUR', 'CHF'],
  GBPAUD: ['GBP', 'AUD'],
  GBPNZD: ['GBP', 'NZD'],
  GBPCAD: ['GBP', 'CAD'],
  GBPCHF: ['GBP', 'CHF'],
  XAUUSD: ['XAU', 'USD'],
  XAGUSD: ['XAG', 'USD'],
  US30: ['USD'],
  US100: ['USD'],
  US500: ['USD'],
  NQ: ['USD'],
  ES: ['USD'],
  YM: ['USD'],
  BTCUSD: ['BTC', 'USD'],
  ETHUSD: ['ETH', 'USD'],
};

function getCurrenciesForInstrument(instrument: string): string[] {
  return INSTRUMENT_CURRENCIES[instrument.toUpperCase()] || [];
}

// ── Filter events by currency relevance ─────────────────────

interface NewsEvent {
  currency?: string;
  time?: string;
  title?: string;
  impact?: string;
  [key: string]: unknown;
}

function filterByCurrency(events: NewsEvent[], currencies: string[]): NewsEvent[] {
  if (currencies.length === 0) return events;

  const upperCurrencies = new Set(currencies.map((c) => c.toUpperCase()));
  return events.filter((event) => {
    const eventCurrency = (event.currency || '').toUpperCase();
    return upperCurrencies.has(eventCurrency);
  });
}

function filterByImpact(events: NewsEvent[], minImpact: string): NewsEvent[] {
  const impactLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const minLevel = impactLevels[minImpact.toLowerCase()] || 0;

  if (minLevel === 0) return events;

  return events.filter((event) => {
    const level = impactLevels[(event.impact || '').toLowerCase()] || 0;
    return level >= minLevel;
  });
}

// ── GET /api/news/calendar — Full economic calendar ─────────
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const { instrument, currency, impact } = req.query as {
      instrument?: string;
      currency?: string;
      impact?: string;
    };

    const result = await engineClient.getNewsCalendar();

    let events: NewsEvent[] = Array.isArray(result.data) ? result.data : [];

    // Filter by instrument currencies
    if (instrument) {
      const currencies = getCurrenciesForInstrument(instrument);
      events = filterByCurrency(events, currencies);
    }

    // Filter by explicit currency
    if (currency) {
      const currencies = currency.split(',').map((c) => c.trim());
      events = filterByCurrency(events, currencies);
    }

    // Filter by minimum impact
    if (impact) {
      events = filterByImpact(events, impact);
    }

    // Set cache headers
    res.set('Cache-Control', 'private, max-age=1800'); // 30 min
    res.json({
      events,
      count: events.length,
      cached: result.cached,
      cacheAge: result.cacheAge,
      warning: result.warning,
      filters: {
        instrument: instrument || null,
        currency: currency || null,
        impact: impact || null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NEWS] Calendar failed: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Failed to fetch news calendar',
      details: msg,
      retry_after: 60,
    });
  }
});

// ── GET /api/news/today — Today's events with time-until ────
router.get('/today', async (req: Request, res: Response) => {
  try {
    const { instrument, currency, impact } = req.query as {
      instrument?: string;
      currency?: string;
      impact?: string;
    };

    const result = await engineClient.getNewsToday();

    let events: NewsEvent[] = Array.isArray(result.data) ? result.data : [];

    // Apply filters
    if (instrument) {
      const currencies = getCurrenciesForInstrument(instrument);
      events = filterByCurrency(events, currencies);
    }
    if (currency) {
      const currencies = currency.split(',').map((c) => c.trim());
      events = filterByCurrency(events, currencies);
    }
    if (impact) {
      events = filterByImpact(events, impact);
    }

    // Add time-until calculation for each event
    const now = Date.now();
    const enrichedEvents = events.map((event) => {
      const eventTime = event.time ? new Date(event.time as string).getTime() : null;
      let timeUntil: string | null = null;
      let isPast = false;

      if (eventTime) {
        const diffMs = eventTime - now;
        isPast = diffMs < 0;

        const absDiff = Math.abs(diffMs);
        const hours = Math.floor(absDiff / (1000 * 60 * 60));
        const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          timeUntil = `${isPast ? '-' : ''}${hours}h ${minutes}m`;
        } else {
          timeUntil = `${isPast ? '-' : ''}${minutes}m`;
        }
      }

      return {
        ...event,
        time_until: timeUntil,
        is_past: isPast,
      };
    });

    // Separate upcoming and past
    const upcoming = enrichedEvents.filter((e) => !e.is_past);
    const past = enrichedEvents.filter((e) => e.is_past);

    // Next event
    const nextEvent = upcoming.length > 0 ? upcoming[0] : null;

    res.set('Cache-Control', 'private, max-age=300'); // 5 min
    res.json({
      today: enrichedEvents,
      upcoming,
      past,
      nextEvent,
      count: enrichedEvents.length,
      cached: result.cached,
      cacheAge: result.cacheAge,
      warning: result.warning,
      filters: {
        instrument: instrument || null,
        currency: currency || null,
        impact: impact || null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NEWS] Today failed: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Failed to fetch today\'s news',
      details: msg,
      retry_after: 60,
    });
  }
});

// ── GET /api/news/relevant/:instrument — News for specific instrument
router.get('/relevant/:instrument', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const currencies = getCurrenciesForInstrument(instrument);

    if (currencies.length === 0) {
      res.json({
        instrument,
        events: [],
        count: 0,
        message: `No currency mapping found for ${instrument}`,
      });
      return;
    }

    const result = await engineClient.getNewsToday();
    let events: NewsEvent[] = Array.isArray(result.data) ? result.data : [];
    events = filterByCurrency(events, currencies);

    // Only high/medium impact for instrument view
    events = filterByImpact(events, 'medium');

    // Add time-until
    const now = Date.now();
    const enriched = events.map((event) => {
      const eventTime = event.time ? new Date(event.time as string).getTime() : null;
      const diffMs = eventTime ? eventTime - now : null;
      const isPast = diffMs !== null && diffMs < 0;

      return {
        ...event,
        is_past: isPast,
        minutes_until: diffMs !== null ? Math.round(diffMs / 60000) : null,
      };
    });

    res.set('Cache-Control', 'private, max-age=300');
    res.json({
      instrument,
      currencies,
      events: enriched,
      count: enriched.length,
      cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NEWS] Relevant for ${req.params.instrument} failed: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Failed to fetch relevant news',
      details: msg,
    });
  }
});

export default router;
