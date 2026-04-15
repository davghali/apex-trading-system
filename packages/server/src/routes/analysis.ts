import { Router, type Request, type Response } from 'express';
import { engineClient } from '../services/engine-client.js';

const router = Router();

// ── Validation helper ───────────────────────────────────────

const VALID_INSTRUMENTS = new Set([
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY',
  'EURAUD', 'EURNZD', 'EURCAD', 'EURCHF',
  'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPCHF',
  'AUDNZD', 'AUDCAD', 'AUDCHF',
  'NZDCAD', 'NZDCHF', 'CADCHF',
  'XAUUSD', 'XAGUSD', 'US30', 'US100', 'US500', 'BTCUSD', 'ETHUSD',
  'NQ', 'ES', 'YM', 'RTY', 'GC', 'SI', 'CL', 'NG',
]);

function validateInstrument(instrument: string): string | null {
  const normalized = instrument.toUpperCase().trim();
  // Accept any instrument but log a warning for unknown ones
  if (!VALID_INSTRUMENTS.has(normalized)) {
    console.warn(`[ANALYSIS] Unknown instrument requested: ${normalized}`);
  }
  if (normalized.length < 2 || normalized.length > 10) {
    return 'Invalid instrument format';
  }
  return null;
}

// ── Cache headers helper ────────────────────────────────────

function setCacheHeaders(res: Response, maxAgeSeconds: number): void {
  res.set('Cache-Control', `private, max-age=${maxAgeSeconds}`);
  res.set('X-Cache-Max-Age', String(maxAgeSeconds));
}

// ── GET /api/analysis/engine/status — Engine health status ──
// IMPORTANT: This route MUST be defined BEFORE /:instrument
// because Express matches routes top-down and 'engine' would
// be captured by /:instrument otherwise.
router.get('/engine/status', async (_req: Request, res: Response) => {
  try {
    const healthy = await engineClient.healthCheck();
    const status = engineClient.getHealthStatus();
    const cacheStats = engineClient.getCacheStats();

    res.json({
      engine: {
        ...status,
        connected: healthy,
      },
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: true, message: msg });
  }
});

// ── POST /api/analysis/scan — Scan all instruments ──────────
// Also must be before /:instrument to avoid being caught
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { instruments } = req.body as { instruments?: string[] };

    // Validate instrument list if provided
    if (instruments) {
      if (!Array.isArray(instruments)) {
        res.status(400).json({ error: true, message: 'instruments must be an array' });
        return;
      }
      if (instruments.length > 30) {
        res.status(400).json({ error: true, message: 'Maximum 30 instruments per scan' });
        return;
      }
    }

    const result = await engineClient.scanAll(
      instruments?.map((i) => i.toUpperCase())
    );

    setCacheHeaders(res, 120); // 2 min
    res.json({
      ...(result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {}), cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ANALYSIS] Scan failed: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

// ── GET /api/analysis/:instrument — Full analysis ───────────
router.get('/:instrument', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const error = validateInstrument(instrument);
    if (error) {
      res.status(400).json({ error: true, message: error });
      return;
    }

    const result = await engineClient.analyze(instrument);

    setCacheHeaders(res, 120); // 2 min
    const payload = result.data && typeof result.data === 'object' ? result.data : {};
    res.json({
      ...(payload as Record<string, unknown>),
      instrument,
      cached: result.cached,
      ...(result.warning ? { warning: result.warning } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Analysis engine unavailable';
    console.error(`[ANALYSIS] Full analysis failed for ${req.params.instrument}: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

// ── GET /api/analysis/:instrument/structure — Market structure
router.get('/:instrument/structure', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const error = validateInstrument(instrument);
    if (error) {
      res.status(400).json({ error: true, message: error });
      return;
    }

    const result = await engineClient.analyzeStructure(instrument);

    setCacheHeaders(res, 180); // 3 min
    res.json({
      instrument,
      ...(result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {}), cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ANALYSIS] Structure analysis failed for ${req.params.instrument}: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

// ── GET /api/analysis/:instrument/bias — Directional bias ───
router.get('/:instrument/bias', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const error = validateInstrument(instrument);
    if (error) {
      res.status(400).json({ error: true, message: error });
      return;
    }

    const result = await engineClient.analyzeBias(instrument);

    setCacheHeaders(res, 300); // 5 min (bias changes slowly)
    res.json({
      instrument,
      ...(result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {}), cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ANALYSIS] Bias analysis failed for ${req.params.instrument}: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

// ── GET /api/analysis/:instrument/poi — Points of interest ──
router.get('/:instrument/poi', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const error = validateInstrument(instrument);
    if (error) {
      res.status(400).json({ error: true, message: error });
      return;
    }

    const result = await engineClient.analyzePOI(instrument);

    setCacheHeaders(res, 180); // 3 min
    res.json({
      instrument,
      ...(result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {}), cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ANALYSIS] POI analysis failed for ${req.params.instrument}: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

// ── GET /api/analysis/:instrument/confluence — Confluence score
router.get('/:instrument/confluence', async (req: Request, res: Response) => {
  try {
    const instrument = String(req.params.instrument).toUpperCase();
    const error = validateInstrument(instrument);
    if (error) {
      res.status(400).json({ error: true, message: error });
      return;
    }

    const result = await engineClient.analyzeConfluence(instrument);

    setCacheHeaders(res, 180); // 3 min
    res.json({
      instrument,
      ...(result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {}), cached: result.cached,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ANALYSIS] Confluence analysis failed for ${req.params.instrument}: ${msg}`);
    res.status(503).json({
      error: true,
      message: 'Analysis engine is currently unavailable',
      details: msg,
      retry_after: 30,
    });
  }
});

export default router;
