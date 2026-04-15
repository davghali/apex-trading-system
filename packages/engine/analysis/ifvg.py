from __future__ import annotations

"""Inverse FVG (IFVG) Detection — Entry confirmation after liquidity sweep."""

from typing import Optional, List, Dict

from analysis.fvg import detect_fvg
from config import INSTRUMENT_CONFIG


def detect_ifvg(candles: list[dict], recent_sweep: Optional[dict], bias_direction: str,
                timeframe: str, instrument: str = 'EURUSD') -> list[dict]:
    if not recent_sweep:
        return []

    all_fvgs = detect_fvg(candles, timeframe, instrument, min_gap_pips=0.5)
    ifvg_list = []
    pip_size = INSTRUMENT_CONFIG.get(instrument, {}).get('pip_size', 0.0001)

    for fvg in all_fvgs:
        # IFVG must be in the direction of our trade (same as bias)
        if fvg['direction'] != bias_direction.lower():
            continue

        # Must have formed AFTER the sweep
        sweep_time = recent_sweep.get('time', 0)
        if fvg['created_at'] <= sweep_time:
            continue

        fvg['type'] = 'INVERSE_FVG'
        fvg['usage'] = 'ENTRY_CONFIRMATION'
        fvg['associated_sweep_time'] = sweep_time
        fvg['entry_price'] = fvg['ce_50']

        if fvg['direction'] == 'bullish':
            fvg['sl_price'] = fvg['low'] - (2 * pip_size)
        else:
            fvg['sl_price'] = fvg['high'] + (2 * pip_size)

        ifvg_list.append(fvg)

    return ifvg_list
