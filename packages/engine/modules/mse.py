from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 1: Market Structure Engine (MSE)
  Analyse multi-TF de la structure avec:
  - Drill-down logique sur TOUS les timeframes simultanement
  - Score de qualite de structure
  - Indicateur de force de tendance (BOS count + displacement)
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

from analysis.swing_points import detect_swing_points, detect_equal_levels, calculate_atr
from analysis.structure import get_all_structure_events, classify_structure
from config import INSTRUMENT_CONFIG

logger = logging.getLogger("apex.mse")

# Ordre hierarchique des TFs pour le drill-down
TF_HIERARCHY = ['W1', 'D1', 'H4', 'H1', 'M15', 'M5', 'M1']


class MarketStructureEngine:
    """
    Module 1 — Market Structure Engine.
    Analyse la structure de marche sur tous les timeframes et
    determine l'alignement pour le trading.
    """

    def analyze(self, candles: List[Dict], timeframe: str,
                instrument: str = 'EURUSD') -> Dict[str, Any]:
        """Analyse la structure sur un seul timeframe."""
        try:
            if not candles or len(candles) < 10:
                return self._empty_structure(timeframe)

            pip_size = INSTRUMENT_CONFIG.get(instrument, {}).get('pip_size', 0.0001)

            # Detection des swing points avec lookback adapte au TF
            sp = detect_swing_points(candles, lookback=2, timeframe=timeframe)
            atr = sp.get('atr', calculate_atr(candles))

            # Evenements de structure (BOS + CHoCH)
            events = get_all_structure_events(
                candles, sp['swing_highs'], sp['swing_lows'], sp['structure']
            )

            # Classification de la structure
            structure_class = classify_structure(events, timeframe)

            # Niveaux egaux avec tolerance ATR
            all_swings = sp['swing_highs'] + sp['swing_lows']
            eq_levels = detect_equal_levels(all_swings, tolerance_pips=3.0,
                                            pip_size=pip_size, atr=atr)

            # Separation BOS / CHoCH
            bos_list = [e for e in events if e.get('type') == 'BOS']
            choch_list = [e for e in events if e.get('type') == 'CHoCH']

            # Score de qualite et force de tendance
            quality_score = self._score_structure_quality(
                sp['structure'], bos_list, choch_list, events, candles
            )
            trend_strength = self._calculate_trend_strength(
                bos_list, choch_list, sp['structure']
            )

            return {
                'timeframe': timeframe,
                'trend': sp['structure'],
                'swing_highs': sp['swing_highs'],
                'swing_lows': sp['swing_lows'],
                'breaks': events,
                'last_bos': bos_list[-1] if bos_list else None,
                'last_choch': choch_list[-1] if choch_list else None,
                'equal_levels': eq_levels,
                'atr': round(atr, 6),
                'structure_classification': structure_class,
                'quality_score': quality_score,
                'trend_strength': trend_strength,
                'bos_count': len(bos_list),
                'choch_count': len(choch_list),
                'displacement_count': sum(
                    1 for e in events if e.get('is_displacement')
                ),
            }

        except Exception as e:
            logger.error("Erreur MSE.analyze(%s): %s", timeframe, e)
            return self._empty_structure(timeframe)

    def analyze_multi_tf(self, candles_map: Dict[str, List[Dict]],
                         instrument: str = 'EURUSD') -> Dict[str, Any]:
        """
        Analyse la structure sur TOUS les timeframes simultanement.
        Drill-down du plus grand au plus petit TF.
        """
        try:
            structures: Dict[str, Dict] = {}

            # Analyser chaque TF dans l'ordre hierarchique
            for tf in TF_HIERARCHY:
                candles = candles_map.get(tf)
                if candles and len(candles) >= 10:
                    structures[tf] = self.analyze(candles, tf, instrument)

            # Verifier l'alignement
            alignment = self._check_alignment(structures)

            # Drill-down: propager la structure des TF superieurs aux inferieurs
            drill_down = self._drill_down(structures)

            return {
                'structures': structures,
                'alignment': alignment,
                'drill_down': drill_down,
            }

        except Exception as e:
            logger.error("Erreur MSE.analyze_multi_tf: %s", e)
            return {
                'structures': {},
                'alignment': self._empty_alignment(),
                'drill_down': {},
            }

    def _check_alignment(self, structures: Dict[str, Dict]) -> Dict[str, Any]:
        """Verifie l'alignement de la structure sur tous les TFs."""
        try:
            required_tfs = ['D1', 'H4', 'H1']
            d1_bias = structures.get('D1', {}).get('trend', 'undefined')
            w1_bias = structures.get('W1', {}).get('trend', 'undefined')

            aligned_count = 0
            conflicts: List[str] = []
            tf_details: Dict[str, str] = {}

            for tf in required_tfs:
                tf_trend = structures.get(tf, {}).get('trend', 'undefined')
                tf_details[tf] = tf_trend
                if tf_trend == d1_bias and d1_bias != 'undefined':
                    aligned_count += 1
                elif tf_trend != 'undefined':
                    conflicts.append(tf)

            # Calculer le score d'alignement
            total_tfs = max(len(required_tfs), 1)
            score = (aligned_count / total_tfs) * 100
            if w1_bias == d1_bias and w1_bias != 'undefined':
                score = min(100, score + 15)

            # Bonus pour les TF inferieurs alignes
            for sub_tf in ['M15', 'M5']:
                sub_trend = structures.get(sub_tf, {}).get('trend', 'undefined')
                if sub_trend == d1_bias and d1_bias != 'undefined':
                    score = min(100, score + 5)
                    tf_details[sub_tf] = sub_trend

            bias = d1_bias.upper() if d1_bias != 'undefined' else 'NEUTRAL'

            return {
                'aligned': score >= 100,
                'alignment_score': round(score),
                'bias': bias,
                'weekly_confirms': w1_bias == d1_bias and w1_bias != 'undefined',
                'conflict_levels': conflicts,
                'tf_details': tf_details,
                'tradeable': score >= 80,
                'recommendation': self._rec(score, bias, conflicts),
            }

        except Exception:
            return self._empty_alignment()

    def _drill_down(self, structures: Dict[str, Dict]) -> Dict[str, Any]:
        """
        Drill-down: analyse la coherence du plus grand au plus petit TF.
        Le TF superieur donne la direction, les TFs inferieurs confirment.
        """
        try:
            result: Dict[str, Any] = {
                'macro_direction': 'NEUTRAL',
                'micro_confirmation': False,
                'entry_tf': None,
                'conflicts': [],
            }

            # Direction macro (W1/D1)
            w1_trend = structures.get('W1', {}).get('trend', 'undefined')
            d1_trend = structures.get('D1', {}).get('trend', 'undefined')

            if d1_trend != 'undefined':
                result['macro_direction'] = d1_trend.upper()
            elif w1_trend != 'undefined':
                result['macro_direction'] = w1_trend.upper()

            macro = result['macro_direction'].lower()

            # Confirmation micro (H1/M15/M5)
            for tf in ['H1', 'M15', 'M5']:
                tf_trend = structures.get(tf, {}).get('trend', 'undefined')
                if tf_trend == macro:
                    result['micro_confirmation'] = True
                    result['entry_tf'] = tf
                    break
                elif tf_trend != 'undefined' and tf_trend != macro:
                    result['conflicts'].append({
                        'tf': tf,
                        'trend': tf_trend,
                        'expected': macro,
                    })

            return result

        except Exception:
            return {
                'macro_direction': 'NEUTRAL',
                'micro_confirmation': False,
                'entry_tf': None,
                'conflicts': [],
            }

    def _score_structure_quality(self, trend: str, bos_list: List[Dict],
                                  choch_list: List[Dict], events: List[Dict],
                                  candles: List[Dict]) -> int:
        """Score de qualite de la structure (0-100)."""
        try:
            score = 0

            # Tendance definie
            if trend in ('bullish', 'bearish'):
                score += 20
            elif trend == 'ranging':
                score += 5

            # BOS recents (max 30)
            score += min(30, len(bos_list) * 8)

            # Displacements (max 20)
            disp_count = sum(1 for e in events if e.get('is_displacement'))
            score += min(20, disp_count * 10)

            # Pas de CHoCH recent = tendance propre (max 15)
            if not choch_list:
                score += 15
            elif len(choch_list) == 1:
                score += 5

            # Consistance de la direction (max 15)
            if bos_list:
                same_dir = sum(
                    1 for b in bos_list
                    if b.get('direction', '') == trend
                )
                consistency = same_dir / len(bos_list)
                score += int(consistency * 15)

            return max(0, min(100, score))

        except Exception:
            return 50

    def _calculate_trend_strength(self, bos_list: List[Dict],
                                   choch_list: List[Dict],
                                   trend: str) -> Dict[str, Any]:
        """Indicateur de force de la tendance."""
        try:
            if trend == 'undefined':
                return {'strength': 'NONE', 'score': 0, 'bos_momentum': 0}

            # Momentum base sur les BOS dans la meme direction
            bos_same_dir = [
                b for b in bos_list if b.get('direction', '') == trend
            ]
            disp_count = sum(1 for b in bos_same_dir if b.get('is_displacement'))

            momentum = len(bos_same_dir) * 15 + disp_count * 20
            # Penalite pour CHoCH (retournements)
            momentum -= len(choch_list) * 25

            momentum = max(0, min(100, momentum))

            if momentum >= 80:
                strength = 'VERY_STRONG'
            elif momentum >= 60:
                strength = 'STRONG'
            elif momentum >= 40:
                strength = 'MODERATE'
            elif momentum >= 20:
                strength = 'WEAK'
            else:
                strength = 'VERY_WEAK'

            return {
                'strength': strength,
                'score': momentum,
                'bos_momentum': len(bos_same_dir),
                'displacement_count': disp_count,
                'choch_penalty': len(choch_list),
            }

        except Exception:
            return {'strength': 'UNKNOWN', 'score': 0, 'bos_momentum': 0}

    def _rec(self, score: float, bias: str, conflicts: List[str]) -> str:
        """Recommandation basee sur l'alignement."""
        try:
            if score >= 100:
                return f'ALIGNED — {bias} sur tous les TFs, pret a trader'
            elif score >= 80:
                return f'QUASI-ALIGNE — {bias} dominant, conflits mineurs sur {", ".join(conflicts)}'
            elif score >= 66:
                return f'PARTIAL — {bias} mais {", ".join(conflicts)} en conflit'
            return 'NO ALIGNMENT — Attendre le developpement de la structure'
        except Exception:
            return 'Erreur recommendation'

    def _empty_structure(self, timeframe: str) -> Dict[str, Any]:
        """Structure vide par defaut."""
        return {
            'timeframe': timeframe,
            'trend': 'undefined',
            'swing_highs': [],
            'swing_lows': [],
            'breaks': [],
            'last_bos': None,
            'last_choch': None,
            'equal_levels': [],
            'atr': 0.0,
            'structure_classification': {},
            'quality_score': 0,
            'trend_strength': {'strength': 'NONE', 'score': 0},
            'bos_count': 0,
            'choch_count': 0,
            'displacement_count': 0,
        }

    def _empty_alignment(self) -> Dict[str, Any]:
        """Alignement vide par defaut."""
        return {
            'aligned': False,
            'alignment_score': 0,
            'bias': 'NEUTRAL',
            'weekly_confirms': False,
            'conflict_levels': [],
            'tf_details': {},
            'tradeable': False,
            'recommendation': 'Donnees insuffisantes',
        }
