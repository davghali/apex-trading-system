from __future__ import annotations

"""Smart Money Technique (SMT) — Inter-market divergence detection."""

from typing import List, Dict


def detect_smt_divergence(instrument1_candles: list[dict], instrument2_candles: list[dict],
                           instrument1_name: str, instrument2_name: str,
                           inverse: bool = True) -> list[dict]:
    """
    Detect SMT divergence between two instruments.
    For EURUSD vs DXY: inverse=True (they should move opposite).
    """
    divergences = []
    min_len = min(len(instrument1_candles), len(instrument2_candles))
    if min_len < 10:
        return divergences

    # Look at the last 20 candles for recent divergences
    lookback = min(20, min_len)
    c1 = instrument1_candles[-lookback:]
    c2 = instrument2_candles[-lookback:]

    for i in range(2, lookback):
        # Check if instrument1 makes a higher high but instrument2 doesn't (or vice versa with inverse)
        c1_hh = c1[i]['high'] > c1[i - 1]['high'] and c1[i]['high'] > c1[i - 2]['high']
        c2_hh = c2[i]['high'] > c2[i - 1]['high'] and c2[i]['high'] > c2[i - 2]['high']
        c1_ll = c1[i]['low'] < c1[i - 1]['low'] and c1[i]['low'] < c1[i - 2]['low']
        c2_ll = c2[i]['low'] < c2[i - 1]['low'] and c2[i]['low'] < c2[i - 2]['low']

        if inverse:
            # Bullish SMT: instrument1 makes lower low, DXY makes higher high (but instrument1 should reverse up)
            if c1_ll and c2_hh:
                divergences.append({
                    'detected': True,
                    'instrument1': instrument1_name,
                    'instrument2': instrument2_name,
                    'type': 'bullish',
                    'description': f'{instrument1_name} LL while {instrument2_name} HH - Bullish SMT',
                    'significance': 'HIGH',
                    'time': c1[i]['time'],
                })
            # Bearish SMT: instrument1 makes higher high, DXY makes lower low
            if c1_hh and c2_ll:
                divergences.append({
                    'detected': True,
                    'instrument1': instrument1_name,
                    'instrument2': instrument2_name,
                    'type': 'bearish',
                    'description': f'{instrument1_name} HH while {instrument2_name} LL - Bearish SMT',
                    'significance': 'HIGH',
                    'time': c1[i]['time'],
                })

    return divergences
