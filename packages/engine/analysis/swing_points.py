from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Swing Point Detection (Production Grade)
  Detection fractale des points de swing avec scoring de force,
  lookback configurable par TF, swings intermediaires et niveaux egaux
  avec tolerance dynamique basee sur l'ATR.
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("apex.swing_points")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTES — Lookback par timeframe
#  Plus le TF est eleve, plus on regarde loin pour confirmer un swing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TF_LOOKBACK: Dict[str, int] = {
    'M1': 2, 'M5': 2, 'M15': 3,
    'H1': 3, 'H4': 5,
    'D1': 5, 'W1': 5,
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ATR — Average True Range pour tolerance dynamique
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def calculate_atr(candles: List[Dict], period: int = 14) -> float:
    """Calcule l'ATR (Average True Range) pour une liste de bougies."""
    try:
        if len(candles) < period + 1:
            # Fallback: utiliser le range moyen
            if not candles:
                return 0.0
            ranges = [c['high'] - c['low'] for c in candles]
            return sum(ranges) / len(ranges) if ranges else 0.0

        trs = []
        for i in range(1, len(candles)):
            high = candles[i]['high']
            low = candles[i]['low']
            prev_close = candles[i - 1]['close']
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            trs.append(tr)

        # ATR = moyenne des 'period' derniers TR
        recent_trs = trs[-period:]
        return sum(recent_trs) / len(recent_trs) if recent_trs else 0.0

    except Exception:
        return 0.0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION DES SWING POINTS — Fractale avec scoring de force
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_swing_points(candles: List[Dict], lookback: int = 2,
                        timeframe: str = 'H1') -> Dict[str, Any]:
    """
    Detecte les swing highs et swing lows fractals avec scoring de force.

    Le lookback est adapte au timeframe: les TFs superieurs utilisent un
    lookback plus grand pour ne garder que les swings significatifs.

    Chaque swing recoit un score de force base sur:
    - Nombre de bougies qui confirment le swing
    - Ratio body/wick de la bougie de swing
    - Volume relatif au moment du swing
    """
    try:
        # Adapter le lookback au timeframe si non specifie explicitement
        effective_lookback = TF_LOOKBACK.get(timeframe, lookback)
        # Utiliser le max entre le lookback demande et celui du TF
        effective_lookback = max(lookback, effective_lookback)

        swing_highs: List[Dict] = []
        swing_lows: List[Dict] = []

        if len(candles) < effective_lookback * 2 + 1:
            return {
                'swing_highs': swing_highs,
                'swing_lows': swing_lows,
                'structure': 'undefined',
                'atr': 0.0,
            }

        # Calculer l'ATR pour le scoring
        atr = calculate_atr(candles)
        avg_volume = _average_volume(candles)

        for i in range(effective_lookback, len(candles) - effective_lookback):
            # ━━━ Swing High ━━━
            is_sh = all(
                candles[i]['high'] > candles[i - j]['high'] and
                candles[i]['high'] > candles[i + j]['high']
                for j in range(1, effective_lookback + 1)
            )
            if is_sh:
                strength = _score_swing_strength(
                    candles, i, 'high', effective_lookback, atr, avg_volume
                )
                swing_highs.append({
                    'price': candles[i]['high'],
                    'time': candles[i]['time'],
                    'index': i,
                    'type': 'swing_high',
                    'broken': False,
                    'strength': strength['score'],
                    'strength_label': strength['label'],
                    'body_ratio': strength['body_ratio'],
                    'volume_ratio': strength['volume_ratio'],
                    'confirming_candles': strength['confirming_candles'],
                    'lookback_used': effective_lookback,
                })

            # ━━━ Swing Low ━━━
            is_sl = all(
                candles[i]['low'] < candles[i - j]['low'] and
                candles[i]['low'] < candles[i + j]['low']
                for j in range(1, effective_lookback + 1)
            )
            if is_sl:
                strength = _score_swing_strength(
                    candles, i, 'low', effective_lookback, atr, avg_volume
                )
                swing_lows.append({
                    'price': candles[i]['low'],
                    'time': candles[i]['time'],
                    'index': i,
                    'type': 'swing_low',
                    'broken': False,
                    'strength': strength['score'],
                    'strength_label': strength['label'],
                    'body_ratio': strength['body_ratio'],
                    'volume_ratio': strength['volume_ratio'],
                    'confirming_candles': strength['confirming_candles'],
                    'lookback_used': effective_lookback,
                })

        return {
            'swing_highs': swing_highs,
            'swing_lows': swing_lows,
            'structure': _determine_structure(swing_highs, swing_lows),
            'atr': round(atr, 6),
        }

    except Exception as e:
        logger.error("Erreur detect_swing_points: %s", e)
        return {
            'swing_highs': [],
            'swing_lows': [],
            'structure': 'undefined',
            'atr': 0.0,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SWINGS INTERMEDIAIRES — Micro-swings dans un range majeur
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_intermediate_swings(candles: List[Dict],
                                major_swing_high_idx: int,
                                major_swing_low_idx: int) -> Dict[str, List[Dict]]:
    """
    Detecte les swings intermediaires (mineurs) entre deux swings majeurs.
    Utile pour le refinement de structure interne.
    """
    try:
        start = min(major_swing_high_idx, major_swing_low_idx)
        end = max(major_swing_high_idx, major_swing_low_idx)

        if end - start < 5 or start < 0 or end >= len(candles):
            return {'minor_highs': [], 'minor_lows': []}

        sub_candles = candles[start:end + 1]
        # Lookback reduit pour les intermediaires
        result = detect_swing_points(sub_candles, lookback=1, timeframe='M1')

        # Ajuster les indices pour correspondre au tableau original
        minor_highs = []
        for sh in result['swing_highs']:
            adjusted = dict(sh)
            adjusted['index'] = sh['index'] + start
            adjusted['is_intermediate'] = True
            minor_highs.append(adjusted)

        minor_lows = []
        for sl in result['swing_lows']:
            adjusted = dict(sl)
            adjusted['index'] = sl['index'] + start
            adjusted['is_intermediate'] = True
            minor_lows.append(adjusted)

        return {
            'minor_highs': minor_highs,
            'minor_lows': minor_lows,
        }

    except Exception as e:
        logger.error("Erreur detect_intermediate_swings: %s", e)
        return {'minor_highs': [], 'minor_lows': []}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCORING DE FORCE — Qualite du swing point
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_swing_strength(candles: List[Dict], idx: int,
                          swing_type: str, lookback: int,
                          atr: float, avg_volume: float) -> Dict[str, Any]:
    """
    Score de force d'un swing point (0-100) base sur:
    1. Nombre de bougies qui confirment (s'eloignent du swing)
    2. Ratio body/wick de la bougie de swing
    3. Volume relatif au moment du swing
    """
    try:
        score = 0.0
        candle = candles[idx]
        body = abs(candle['close'] - candle['open'])
        total_range = candle['high'] - candle['low']
        body_ratio = body / total_range if total_range > 0 else 0.5
        volume = candle.get('volume', 0)
        volume_ratio = volume / avg_volume if avg_volume > 0 else 1.0

        # 1. Confirmation par les bougies suivantes (max 30 points)
        # Combien de bougies apres le swing continuent a confirmer
        confirming = 0
        max_check = min(lookback + 3, len(candles) - idx - 1)
        for j in range(1, max_check + 1):
            if idx + j >= len(candles):
                break
            if swing_type == 'high':
                if candles[idx + j]['high'] < candle['high']:
                    confirming += 1
                else:
                    break
            else:  # low
                if candles[idx + j]['low'] > candle['low']:
                    confirming += 1
                else:
                    break
        score += min(30, confirming * 10)

        # 2. Body ratio (max 25 points)
        # Un swing avec un grand corps (bougie engulfing) est plus fort
        if body_ratio > 0.7:
            score += 25
        elif body_ratio > 0.5:
            score += 18
        elif body_ratio > 0.3:
            score += 10
        else:
            score += 5  # Doji/pin bar = swing potentiellement faible

        # 3. Wick significative dans la direction du rejet (max 25 points)
        if swing_type == 'high':
            upper_wick = candle['high'] - max(candle['open'], candle['close'])
            wick_ratio = upper_wick / total_range if total_range > 0 else 0
        else:
            lower_wick = min(candle['open'], candle['close']) - candle['low']
            wick_ratio = lower_wick / total_range if total_range > 0 else 0

        # Un long wick au point de swing = fort rejet
        if wick_ratio > 0.5:
            score += 25
        elif wick_ratio > 0.3:
            score += 18
        elif wick_ratio > 0.15:
            score += 10
        else:
            score += 3

        # 4. Volume (max 20 points)
        if volume_ratio > 2.0:
            score += 20
        elif volume_ratio > 1.5:
            score += 15
        elif volume_ratio > 1.0:
            score += 10
        elif volume_ratio > 0.5:
            score += 5

        final_score = min(100, int(score))

        # Label de force
        if final_score >= 80:
            label = 'EXTREME'
        elif final_score >= 60:
            label = 'STRONG'
        elif final_score >= 40:
            label = 'MODERATE'
        else:
            label = 'WEAK'

        return {
            'score': final_score,
            'label': label,
            'body_ratio': round(body_ratio, 3),
            'volume_ratio': round(volume_ratio, 2),
            'confirming_candles': confirming,
        }

    except Exception:
        return {
            'score': 50,
            'label': 'MODERATE',
            'body_ratio': 0.5,
            'volume_ratio': 1.0,
            'confirming_candles': 0,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  STRUCTURE — Determination de la tendance via swings
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _determine_structure(swing_highs: List[Dict], swing_lows: List[Dict]) -> str:
    """
    Determine la structure de marche (bullish/bearish/ranging)
    a partir des swings recents.
    """
    try:
        if len(swing_highs) < 2 or len(swing_lows) < 2:
            return 'undefined'

        last_highs = [sh['price'] for sh in swing_highs[-3:]]
        last_lows = [sl['price'] for sl in swing_lows[-3:]]

        hh = all(last_highs[i] > last_highs[i - 1] for i in range(1, len(last_highs)))
        hl = all(last_lows[i] > last_lows[i - 1] for i in range(1, len(last_lows)))
        lh = all(last_highs[i] < last_highs[i - 1] for i in range(1, len(last_highs)))
        ll = all(last_lows[i] < last_lows[i - 1] for i in range(1, len(last_lows)))

        if hh and hl:
            return 'bullish'
        elif lh and ll:
            return 'bearish'
        return 'ranging'

    except Exception:
        return 'undefined'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NIVEAUX EGAUX (EQH/EQL) — Detection avec tolerance dynamique ATR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_equal_levels(swing_points: List[Dict],
                        tolerance_pips: float = 3.0,
                        pip_size: float = 0.0001,
                        atr: Optional[float] = None) -> List[Dict]:
    """
    Detecte les niveaux egaux (EQH/EQL) — pools de liquidite.

    La tolerance est dynamique:
    - Si ATR est fourni, on utilise ATR * 0.15 comme tolerance
    - Sinon on utilise tolerance_pips * pip_size

    Les EQH/EQL sont des zones de liquidite cruciales car les stops
    des traders retail s'accumulent au-dessus/en-dessous.
    """
    try:
        # Tolerance dynamique basee sur l'ATR si disponible
        if atr and atr > 0:
            tolerance = atr * 0.15  # 15% de l'ATR = zone de precision
        else:
            tolerance = tolerance_pips * pip_size

        equal_levels: List[Dict] = []
        used: set = set()

        for i, sp1 in enumerate(swing_points):
            if i in used:
                continue
            cluster = [sp1]
            for j, sp2 in enumerate(swing_points):
                if i != j and j not in used and sp1['type'] == sp2['type']:
                    if abs(sp1['price'] - sp2['price']) <= tolerance:
                        cluster.append(sp2)
                        used.add(j)

            if len(cluster) >= 2:
                used.add(i)
                avg_price = sum(p['price'] for p in cluster) / len(cluster)
                level_type = 'EQH' if cluster[0]['type'] == 'swing_high' else 'EQL'

                # Score de significativite base sur le nombre de touches
                # et la force moyenne des swings du cluster
                avg_strength = 0
                strengths = [p.get('strength', 50) for p in cluster]
                if strengths:
                    avg_strength = sum(strengths) / len(strengths)

                # Plus de touches + swings forts = probabilite de sweep plus elevee
                base_prob = 55
                touch_bonus = min(30, len(cluster) * 8)
                strength_bonus = min(10, int(avg_strength * 0.1))
                sweep_prob = min(98, base_prob + touch_bonus + strength_bonus)

                if len(cluster) >= 4:
                    significance = 'EXTREME'
                elif len(cluster) >= 3:
                    significance = 'HIGH'
                else:
                    significance = 'MEDIUM'

                equal_levels.append({
                    'type': level_type,
                    'price': round(avg_price, 6),
                    'touches': len(cluster),
                    'liquidity_pool': 'BSL' if level_type == 'EQH' else 'SSL',
                    'significance': significance,
                    'sweep_probability': sweep_prob,
                    'avg_swing_strength': round(avg_strength, 1),
                    'tolerance_used': round(tolerance, 6),
                    'price_range': [
                        round(min(p['price'] for p in cluster), 6),
                        round(max(p['price'] for p in cluster), 6),
                    ],
                    'first_time': min(p['time'] for p in cluster),
                    'last_time': max(p['time'] for p in cluster),
                })

        return equal_levels

    except Exception as e:
        logger.error("Erreur detect_equal_levels: %s", e)
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UTILITAIRES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _average_volume(candles: List[Dict]) -> float:
    """Calcule le volume moyen d'une liste de bougies."""
    try:
        volumes = [c.get('volume', 0) for c in candles if c.get('volume', 0) > 0]
        return sum(volumes) / len(volumes) if volumes else 1.0
    except Exception:
        return 1.0
