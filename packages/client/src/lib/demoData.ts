// Demo data for when the backend is not available (deployed frontend only)

export const DEMO_ANALYSIS = {
  EURUSD: {
    current_price: 1.0852,
    bias: {
      weekly: {
        bias: 'BULLISH', score: 72, conviction: 'HIGH',
        score_bullish: 72, score_bearish: 28,
        factors: [
          'W1: Bougie weekly precedente BULLISH (+15)',
          'W2: Prix en DISCOUNT weekly — achat favorise (+10 bullish)',
          'W3: PWL SWEPT (1.0785) — SSL prise, retournement bullish (+20)',
          'W4: Structure W1 BULLISH (HH+HL) (+25)',
          'W5: Fort body bullish (68%) (+10)',
        ],
        pwh: 1.0920, pwl: 1.0785,
        premium_discount: 'DISCOUNT', weekly_mid: 1.0852,
        tradeable: true,
      },
      daily: {
        bias: 'BULLISH', score: 68, conviction: 'MEDIUM',
        score_bullish: 68, score_bearish: 32,
        factors: [
          'D1: Structure D1 BULLISH (+15)',
          'D2: Prix > PDH (1.0838) — Expansion bullish (+10)',
          'D3: Prix > Midnight Open (1.0845) (+12 bullish)',
          'D4: Prix > Daily Open (1.0840) (+8 bullish)',
          'D5: Prix en DISCOUNT D1 (<0.382) — Achat favorise (+8 bullish)',
          'D6: Previous Day BULLISH candle (+5)',
          'D7: Weekly bias BULLISH confirme (+12)',
          'D8: WEDNESDAY — Jour de distribution (+5)',
        ],
        pdh: 1.0895, pdl: 1.0810,
        midnight_open: 1.0845, daily_open: 1.0840,
        premium_discount_zone: 'DISCOUNT',
        tradeable: true, dow_tendency: 'DISTRIBUTION',
      },
      po3: {
        phase: 'MANIPULATION', action: 'CHERCHER ENTREE',
        is_entry_window: true, is_tp_window: false,
        midnight_open: 1.0845, daily_open: 1.0840,
        price_vs_mo: 'ABOVE', price_vs_do: 'ABOVE',
        in_manipulation: false, optimal_entry_zone: false,
        entry_recommendation: 'ATTENDRE — Prix au-dessus du MO/DO',
      },
      weekly_confirms_daily: true,
    },
    structure: {
      structures: {
        D1: { timeframe: 'D1', trend: 'bullish', breaks: [], last_bos: null, last_choch: null },
        H4: { timeframe: 'H4', trend: 'bullish', breaks: [], last_bos: null, last_choch: null },
        H1: { timeframe: 'H1', trend: 'ranging', breaks: [], last_bos: null, last_choch: null },
      },
      alignment: {
        aligned: false, alignment_score: 66,
        bias: 'BULLISH', weekly_confirms: true,
        conflict_levels: ['H1'], tradeable: false,
        recommendation: 'PARTIAL — BULLISH bias mais H1 conflicting',
      },
    },
    pois: {
      pois: [
        { type: 'ORDER_BLOCK', direction: 'bullish', high: 1.0848, low: 1.0835, ce_50: 1.0841, timeframe: 'H4', quality_score: 82, has_fvg: true, retests: 0, status: 'ACTIVE', created_at: Date.now() / 1000 - 7200 },
        { type: 'FVG', direction: 'bullish', high: 1.0855, low: 1.0842, ce_50: 1.0848, timeframe: 'H4', quality_score: 75, gap_size_pips: 13, retests: 0, status: 'ACTIVE', created_at: Date.now() / 1000 - 3600 },
        { type: 'BREAKER_BLOCK', direction: 'bullish', high: 1.0830, low: 1.0818, ce_50: 1.0824, timeframe: 'M15', quality_score: 70, retests: 0, status: 'ACTIVE', created_at: Date.now() / 1000 - 1800 },
        { type: 'FVG', direction: 'bearish', high: 1.0905, low: 1.0892, ce_50: 1.0898, timeframe: 'H1', quality_score: 65, gap_size_pips: 13, retests: 1, status: 'ACTIVE', created_at: Date.now() / 1000 - 14400 },
      ],
      liquidity_map: {
        buy_side_liquidity: [
          { level: 1.0895, type: 'PDH', significance: 'HIGH', swept: false },
          { level: 1.0920, type: 'PWH', significance: 'VERY_HIGH', swept: false },
        ],
        sell_side_liquidity: [
          { level: 1.0810, type: 'PDL', significance: 'HIGH', swept: false },
          { level: 1.0785, type: 'PWL', significance: 'VERY_HIGH', swept: true },
        ],
      },
    },
    session: {
      current_session: 'LONDON_KZ', is_active: true,
      time_remaining: 87, progress: 42,
      next_session: 'NY_KZ', next_session_in: 300,
      ny_time: '03:15',
    },
    confluence: {
      total_score: 78, grade: 'B+',
      recommendation: 'BON — Trader normalement',
      tradeable: true, position_size_modifier: 0.7,
      categories: {
        A_STRUCTURE_BIAS: 20, B_POI_QUALITY: 19,
        C_ENTRY_CONFIRMATION: 14, D_TIMING_SESSION: 13,
        E_RISK_FACTORS: 12,
      },
      details: [
        'A1: Daily Bias HIGH conviction (+8)',
        'A2: Weekly confirme Daily (+5)',
        'A3: 2/3 TF alignes (+4)',
        'A4: BOS recent confirme (+5)',
        'B1: OB + FVG combine (+8)',
        'B2: POI en H4 (+5)',
        'B3: POI en zone discount (+5)',
        'C1: FVG en confirmation (+3)',
        'C3: Proche zone manipulation (+2)',
        'D1: Dans un Killzone actif (+5)',
        'D2: KZ model LONDON_REVERSAL HIGH (+4)',
        'D3: Jour favorable (+3)',
        'D4: Pas de news imminente (+3)',
        'E1: RR 2.5:1 bon (+4)',
        'E2: SL derriere structure (+3)',
        'E4: Spread acceptable (+3)',
      ],
    },
    dxy: {
      dxy_structure: 'bearish',
      eurusd_confirms: true,
      eurusd_confluence_points: 4,
      divergence_alert: false,
      dxy_bias_summary: 'DXY BEARISH -> Confirme EURUSD BULLISH',
      recommendation: 'CONFIRME — Trader normalement',
    },
    news: {
      safe_to_trade: true, algo_active: true,
      blocking_news: [],
      status: 'CLEAR — Algo actif, pas de news imminente',
      upcoming_high_impact: [
        { name: 'CPI m/m', time: '2026-04-16T12:30:00Z', minutes_until: 540, currency: 'USD' },
      ],
    },
    killzone_model: {
      model: 'LONDON_REVERSAL', direction: 'LONG',
      logic: 'Prix sous Asian Low avec biais bullish -> Manipulation bearish',
      entry_type: 'BB + IFVG apres sweep',
      target: 'PDH ou Asian High', confidence: 'HIGH',
    },
    trade_check: { allowed: true, trades_remaining: 2, daily_pnl: 0, weekly_pnl: 0 },
  },
};

export function getDemoData(instrument: string) {
  return (DEMO_ANALYSIS as Record<string, unknown>)[instrument] || DEMO_ANALYSIS.EURUSD;
}
