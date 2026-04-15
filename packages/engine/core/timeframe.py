from __future__ import annotations

import pandas as pd
from typing import Optional, List, Dict


TIMEFRAME_MINUTES = {
    'W1': 10080, 'D1': 1440, 'H4': 240, 'H1': 60,
    'M15': 15, 'M5': 5, 'M1': 1,
}

RESAMPLE_RULES = {
    'W1': 'W-FRI', 'D1': '1D', 'H4': '4h', 'H1': '1h',
    'M15': '15min', 'M5': '5min', 'M1': '1min',
}


def candles_to_df(candles: list[dict]) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame(columns=['time', 'open', 'high', 'low', 'close', 'volume'])
    df = pd.DataFrame(candles)
    df['datetime'] = pd.to_datetime(df['time'], unit='s')
    df = df.set_index('datetime')
    return df


def resample_candles(df: pd.DataFrame, target_tf: str) -> pd.DataFrame:
    rule = RESAMPLE_RULES.get(target_tf)
    if not rule:
        return df
    resampled = df.resample(rule).agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum',
        'time': 'first',
    }).dropna()
    return resampled


def df_to_candles(df: pd.DataFrame) -> list[dict]:
    records = df.reset_index().to_dict('records')
    candles = []
    for r in records:
        candles.append({
            'time': int(r.get('time', 0)),
            'open': float(r['open']),
            'high': float(r['high']),
            'low': float(r['low']),
            'close': float(r['close']),
            'volume': float(r.get('volume', 0)),
        })
    return candles
