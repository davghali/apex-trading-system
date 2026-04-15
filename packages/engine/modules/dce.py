from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 8: DXY Correlation Engine (DCE)
  Analyse de correlation avec:
  - Coefficient de correlation roulant
  - SMT Divergence avec marqueurs visuels
  - Indicateur de force de correlation (strong/weak/diverging)
  - Analyse XAUUSD et NAS100 en plus du DXY
=============================================================================
"""

import math
import logging
from typing import Optional, List, Dict, Any
from analysis.smt import detect_smt_divergence

logger = logging.getLogger("apex.dce")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CORRELATIONS ATTENDUES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORRELATIONS: Dict[str, Dict[str, Any]] = {
    'EURUSD_DXY': {
        'inverse': True,
        'expected': -0.85,
        'description': 'EURUSD et DXY sont fortement inversement correles',
    },
    'XAUUSD_DXY': {
        'inverse': True,
        'expected': -0.70,
        'description': 'L or et le DXY sont inversement correles',
    },
    'NAS100_DXY': {
        'inverse': True,
        'expected': -0.50,
        'description': 'NAS100 et DXY ont une correlation inverse moderee',
    },
    'EURUSD_XAUUSD': {
        'inverse': False,
        'expected': 0.65,
        'description': 'EURUSD et XAUUSD sont positivement correles (anti-dollar)',
    },
}


class DXYCorrelationEngine:
    """
    Module 8 — DXY Correlation Engine.
    Analyse les correlations inter-marches pour confirmer le biais.
    """

    def analyze(self, dxy_candles: List[Dict], dxy_structure: str,
                eurusd_bias: str,
                eurusd_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Analyse complete de la correlation EURUSD/DXY."""
        try:
            # ━━━ Correlation inverse DXY ━━━
            eurusd_confirms = False
            if dxy_structure == 'bullish' and eurusd_bias == 'BEARISH':
                eurusd_confirms = True
            elif dxy_structure == 'bearish' and eurusd_bias == 'BULLISH':
                eurusd_confirms = True

            # ━━━ Divergence ━━━
            divergence = False
            if (dxy_structure == 'bullish' and eurusd_bias == 'BULLISH') or \
               (dxy_structure == 'bearish' and eurusd_bias == 'BEARISH'):
                divergence = True

            # ━━━ Rolling correlation coefficient ━━━
            correlation_coef = None
            correlation_strength = 'UNKNOWN'
            if eurusd_candles and dxy_candles:
                correlation_coef = self._rolling_correlation(
                    eurusd_candles, dxy_candles, period=20
                )
                correlation_strength = self._classify_correlation(
                    correlation_coef, expected_inverse=True
                )

            # ━━━ SMT divergence ━━━
            smt_divergences: List[Dict] = []
            if eurusd_candles and dxy_candles:
                smt_divergences = detect_smt_divergence(
                    eurusd_candles, dxy_candles, 'EURUSD', 'DXY', inverse=True
                )

            # ━━━ DXY at key POI? ━━━
            dxy_at_poi = self._check_dxy_poi(dxy_candles)

            # ━━━ DXY momentum ━━━
            dxy_momentum = self._dxy_momentum(dxy_candles)

            return {
                'dxy_structure': dxy_structure,
                'eurusd_confirms': eurusd_confirms,
                'eurusd_confluence_points': 4 if eurusd_confirms else -3,
                'divergence_alert': divergence,
                'dxy_at_poi': dxy_at_poi,
                'correlation_coefficient': round(correlation_coef, 4) if correlation_coef is not None else None,
                'correlation_strength': correlation_strength,
                'smt_divergences': smt_divergences[-5:] if smt_divergences else [],
                'smt_count': len(smt_divergences),
                'dxy_momentum': dxy_momentum,
                'dxy_bias_summary': (
                    f"DXY {dxy_structure.upper()} -> "
                    f"{'CONFIRME' if eurusd_confirms else 'DIVERGENCE'} "
                    f"EURUSD {eurusd_bias}"
                ),
                'recommendation': (
                    'CONFIRME — Trader normalement' if eurusd_confirms
                    else 'ATTENTION — DXY diverge, reduire taille ou eviter'
                ),
            }

        except Exception as e:
            logger.error("Erreur DCE.analyze: %s", e)
            return {
                'dxy_structure': 'unknown', 'eurusd_confirms': False,
                'divergence_alert': False, 'correlation_coefficient': None,
                'correlation_strength': 'UNKNOWN', 'smt_divergences': [],
                'dxy_bias_summary': 'Erreur analyse DXY',
                'recommendation': 'N/A',
            }

    def analyze_multi(self, candles_map: Dict[str, List[Dict]],
                      structures: Dict[str, str]) -> Dict[str, Any]:
        """
        Analyse les correlations entre TOUS les instruments:
        EURUSD, XAUUSD, NAS100 vs DXY.
        """
        try:
            results: Dict[str, Any] = {}
            dxy_candles = candles_map.get('DXY', [])
            dxy_struct = structures.get('DXY', 'unknown')

            if not dxy_candles:
                return {'error': 'Pas de donnees DXY'}

            # EURUSD vs DXY
            if 'EURUSD' in candles_map:
                results['EURUSD_DXY'] = self._analyze_pair(
                    candles_map['EURUSD'], dxy_candles,
                    'EURUSD', 'DXY',
                    structures.get('EURUSD', 'unknown'), dxy_struct,
                    inverse=True
                )

            # XAUUSD vs DXY
            if 'XAUUSD' in candles_map:
                results['XAUUSD_DXY'] = self._analyze_pair(
                    candles_map['XAUUSD'], dxy_candles,
                    'XAUUSD', 'DXY',
                    structures.get('XAUUSD', 'unknown'), dxy_struct,
                    inverse=True
                )

            # NAS100 vs DXY
            if 'NAS100' in candles_map:
                results['NAS100_DXY'] = self._analyze_pair(
                    candles_map['NAS100'], dxy_candles,
                    'NAS100', 'DXY',
                    structures.get('NAS100', 'unknown'), dxy_struct,
                    inverse=True
                )

            return results

        except Exception as e:
            logger.error("Erreur analyze_multi: %s", e)
            return {}

    def _analyze_pair(self, candles_a: List[Dict], candles_b: List[Dict],
                      name_a: str, name_b: str,
                      struct_a: str, struct_b: str,
                      inverse: bool) -> Dict[str, Any]:
        """Analyse la correlation entre deux paires."""
        try:
            corr = self._rolling_correlation(candles_a, candles_b, period=20)
            strength = self._classify_correlation(corr, inverse)

            confirms = False
            if inverse:
                confirms = (struct_a == 'bullish' and struct_b == 'bearish') or \
                           (struct_a == 'bearish' and struct_b == 'bullish')
            else:
                confirms = struct_a == struct_b and struct_a != 'undefined'

            smt = detect_smt_divergence(candles_a, candles_b, name_a, name_b, inverse)

            return {
                'pair': f'{name_a}/{name_b}',
                'correlation': round(corr, 4) if corr is not None else None,
                'strength': strength,
                'confirms': confirms,
                'smt_divergences': smt[-3:] if smt else [],
                'inverse_expected': inverse,
            }

        except Exception:
            return {'pair': f'{name_a}/{name_b}', 'correlation': None, 'strength': 'UNKNOWN'}

    # ━━━ ROLLING CORRELATION ━━━

    def _rolling_correlation(self, candles_a: List[Dict], candles_b: List[Dict],
                             period: int = 20) -> Optional[float]:
        """
        Calcule le coefficient de correlation de Pearson roulant
        entre les returns de deux instruments.
        """
        try:
            min_len = min(len(candles_a), len(candles_b))
            if min_len < period + 1:
                return None

            # Calculer les returns
            returns_a = []
            returns_b = []
            for i in range(1, min(period + 1, min_len)):
                idx_a = -min_len + i
                idx_b = -min_len + i
                r_a = (candles_a[idx_a]['close'] - candles_a[idx_a - 1]['close']) / max(candles_a[idx_a - 1]['close'], 0.0001)
                r_b = (candles_b[idx_b]['close'] - candles_b[idx_b - 1]['close']) / max(candles_b[idx_b - 1]['close'], 0.0001)
                returns_a.append(r_a)
                returns_b.append(r_b)

            if len(returns_a) < 5:
                return None

            # Pearson correlation
            n = len(returns_a)
            mean_a = sum(returns_a) / n
            mean_b = sum(returns_b) / n

            cov = sum((returns_a[i] - mean_a) * (returns_b[i] - mean_b) for i in range(n)) / n
            std_a = math.sqrt(sum((r - mean_a) ** 2 for r in returns_a) / n)
            std_b = math.sqrt(sum((r - mean_b) ** 2 for r in returns_b) / n)

            if std_a == 0 or std_b == 0:
                return 0.0

            return cov / (std_a * std_b)

        except Exception:
            return None

    def _classify_correlation(self, corr: Optional[float],
                              expected_inverse: bool) -> str:
        """Classifie la force de la correlation."""
        try:
            if corr is None:
                return 'UNKNOWN'

            abs_corr = abs(corr)

            if expected_inverse:
                if corr < -0.7:
                    return 'STRONG_INVERSE'
                elif corr < -0.4:
                    return 'MODERATE_INVERSE'
                elif corr < 0:
                    return 'WEAK_INVERSE'
                else:
                    return 'DIVERGING'
            else:
                if corr > 0.7:
                    return 'STRONG_POSITIVE'
                elif corr > 0.4:
                    return 'MODERATE_POSITIVE'
                elif corr > 0:
                    return 'WEAK_POSITIVE'
                else:
                    return 'DIVERGING'

        except Exception:
            return 'UNKNOWN'

    def _check_dxy_poi(self, candles: List[Dict]) -> bool:
        """Verifie si le DXY est pres d'un POI recent."""
        try:
            if len(candles) < 20:
                return False
            recent = candles[-20:]
            high = max(c['high'] for c in recent)
            low = min(c['low'] for c in recent)
            current = candles[-1]['close']
            rng = high - low
            if rng <= 0:
                return False
            return current > high - rng * 0.1 or current < low + rng * 0.1
        except Exception:
            return False

    def _dxy_momentum(self, candles: List[Dict]) -> Dict[str, Any]:
        """Analyse le momentum du DXY."""
        try:
            if len(candles) < 10:
                return {'direction': 'UNKNOWN', 'strength': 0}

            close_5 = candles[-1]['close'] - candles[-5]['close']
            close_10 = candles[-1]['close'] - candles[-10]['close']

            if close_5 > 0 and close_10 > 0:
                direction = 'BULLISH'
            elif close_5 < 0 and close_10 < 0:
                direction = 'BEARISH'
            else:
                direction = 'MIXED'

            avg_range = sum(c['high'] - c['low'] for c in candles[-10:]) / 10
            strength = abs(close_10) / avg_range if avg_range > 0 else 0

            return {
                'direction': direction,
                'strength': round(min(100, strength * 20), 1),
                'change_5': round(close_5, 4),
                'change_10': round(close_10, 4),
            }

        except Exception:
            return {'direction': 'UNKNOWN', 'strength': 0}
