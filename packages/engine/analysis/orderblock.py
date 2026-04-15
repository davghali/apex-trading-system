from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Order Block Detection (Production Grade)
  Detection des blocs d'ordres ICT avec:
  - Distinction OB regulier vs OB extreme (au swing point)
  - Refinement: trouver la bougie exacte dans un OB multi-bougies
  - Detection d'OB avec FVG embarque (haute qualite)
  - Invalidation: prix qui close au travers du body = invalide
  - Propulsion Block: OB qui lance depuis un sweep de liquidite
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from config import INSTRUMENT_CONFIG

logger = logging.getLogger("apex.orderblock")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION DES ORDER BLOCKS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_order_blocks(candles: List[Dict], structure_breaks: List[Dict],
                        timeframe: str, instrument: str = 'EURUSD',
                        swing_highs: Optional[List[Dict]] = None,
                        swing_lows: Optional[List[Dict]] = None) -> List[Dict]:
    """
    Detecte les Order Blocks: la derniere bougie opposee avant un BOS.

    Un OB bullish = la derniere bougie bearish avant un mouvement impulsif
    haussier qui casse la structure (BOS bullish).

    Types:
    - ORDER_BLOCK: OB standard apres BOS
    - EXTREME_OB: OB situe exactement a un swing point (plus fort)
    - PROPULSION_BLOCK: OB qui demarre apres un sweep de liquidite
    """
    try:
        order_blocks: List[Dict] = []

        for bos in structure_breaks:
            if bos.get('type') != 'BOS':
                continue
            bos_idx = bos.get('candle_index', 0)
            if bos_idx < 2 or bos_idx >= len(candles):
                continue

            if bos['direction'] == 'bullish':
                # Chercher la derniere bougie bearish avant le BOS
                ob_candle, ob_idx = _find_last_opposing_candle(
                    candles, bos_idx, 'bearish', max_lookback=15
                )
                if ob_candle is not None:
                    ob = _create_ob_advanced(
                        candles, ob_candle, ob_idx, 'bullish', bos, timeframe,
                        instrument, swing_highs, swing_lows
                    )
                    if ob['quality_score'] >= 40:  # Seuil minimal
                        order_blocks.append(ob)

            elif bos['direction'] == 'bearish':
                ob_candle, ob_idx = _find_last_opposing_candle(
                    candles, bos_idx, 'bullish', max_lookback=15
                )
                if ob_candle is not None:
                    ob = _create_ob_advanced(
                        candles, ob_candle, ob_idx, 'bearish', bos, timeframe,
                        instrument, swing_highs, swing_lows
                    )
                    if ob['quality_score'] >= 40:
                        order_blocks.append(ob)

        return order_blocks

    except Exception as e:
        logger.error("Erreur detect_order_blocks: %s", e)
        return []


def _find_last_opposing_candle(candles: List[Dict], bos_idx: int,
                                candle_direction: str,
                                max_lookback: int = 15) -> tuple:
    """
    Trouve la derniere bougie dans la direction opposee avant le BOS.
    candle_direction = direction de la bougie qu'on cherche
    """
    try:
        for i in range(bos_idx - 1, max(0, bos_idx - max_lookback), -1):
            c = candles[i]
            is_bearish = c['close'] < c['open']
            is_bullish = c['close'] > c['open']

            if candle_direction == 'bearish' and is_bearish:
                return c, i
            elif candle_direction == 'bullish' and is_bullish:
                return c, i

        return None, -1
    except Exception:
        return None, -1


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATION D'UN OB AVANCE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _create_ob_advanced(candles: List[Dict], ob_candle: Dict, ob_idx: int,
                        direction: str, bos: Dict, timeframe: str,
                        instrument: str,
                        swing_highs: Optional[List[Dict]],
                        swing_lows: Optional[List[Dict]]) -> Dict[str, Any]:
    """Cree un Order Block complet avec toutes les proprietes avancees."""
    try:
        bos_idx = bos.get('candle_index', 0)

        # ━━━ Zone de l'OB ━━━
        if direction == 'bullish':
            # OB bullish: on utilise l'open (haut du body) et le low de la bougie
            ob_high = ob_candle['open']  # Haut du body bearish
            ob_low = ob_candle['low']
        else:
            # OB bearish: on utilise le high et l'open (bas du body) de la bougie
            ob_high = ob_candle['high']
            ob_low = ob_candle['open']  # Bas du body bullish

        ob_50 = ob_low + (ob_high - ob_low) * 0.5
        ob_size = ob_high - ob_low

        # ━━━ Impulse ratio ━━━
        impulse_candles = candles[ob_idx + 1:min(bos_idx + 1, len(candles))]
        impulse_size = 0
        if impulse_candles:
            impulse_size = abs(impulse_candles[-1]['close'] - ob_candle['close'])
        impulse_ratio = impulse_size / ob_size if ob_size > 0 else 0

        # ━━━ FVG embarque ━━━
        has_fvg = _check_fvg_in_impulse(impulse_candles)

        # ━━━ OB Extreme: est-ce a un swing point? ━━━
        is_extreme = _check_extreme_ob(ob_idx, ob_candle, direction, swing_highs, swing_lows)

        # ━━━ Propulsion Block: vient d'un sweep? ━━━
        is_propulsion = bos.get('is_displacement', False) and impulse_ratio > 2.5

        # ━━━ Refinement: trouver la bougie exacte dans l'OB multi-bougies ━━━
        refined = _refine_ob(candles, ob_idx, direction, max_lookback=3)

        # ━━━ Classification ━━━
        if is_extreme:
            ob_type = 'EXTREME_OB'
        elif is_propulsion:
            ob_type = 'PROPULSION_BLOCK'
        else:
            ob_type = 'ORDER_BLOCK'

        # ━━━ Score de qualite avance ━━━
        quality = _score_ob_quality(
            impulse_ratio, has_fvg, bos, timeframe,
            is_extreme, is_propulsion, ob_candle, candles, ob_idx
        )

        return {
            'type': ob_type,
            'direction': direction,
            'high': round(ob_high, 6),
            'low': round(ob_low, 6),
            'ce_50': round(ob_50, 6),
            'timeframe': timeframe,
            'quality_score': quality,
            'has_fvg': has_fvg,
            'is_extreme': is_extreme,
            'is_propulsion': is_propulsion,
            'impulse_ratio': round(impulse_ratio, 2),
            'mitigated': False,
            'invalidated': False,
            'retests': 0,
            'usage': 'CONTINUATION',
            'created_at': ob_candle['time'],
            'status': 'ACTIVE',
            'refined_high': round(refined.get('high', ob_high), 6),
            'refined_low': round(refined.get('low', ob_low), 6),
            'ob_body_ratio': round(_candle_body_ratio(ob_candle), 3),
            'ob_index': ob_idx,
            'bos_strength': bos.get('strength', 'weak'),
        }

    except Exception as e:
        logger.error("Erreur _create_ob_advanced: %s", e)
        return {
            'type': 'ORDER_BLOCK', 'direction': direction,
            'high': ob_candle.get('high', 0), 'low': ob_candle.get('low', 0),
            'ce_50': 0, 'timeframe': timeframe, 'quality_score': 40,
            'has_fvg': False, 'is_extreme': False, 'is_propulsion': False,
            'impulse_ratio': 0, 'mitigated': False, 'invalidated': False,
            'retests': 0, 'usage': 'CONTINUATION',
            'created_at': ob_candle.get('time', 0), 'status': 'ACTIVE',
            'refined_high': 0, 'refined_low': 0,
            'ob_body_ratio': 0.5, 'ob_index': ob_idx,
            'bos_strength': 'weak',
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OB EXTREME — OB situe a un swing point
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_extreme_ob(ob_idx: int, ob_candle: Dict, direction: str,
                      swing_highs: Optional[List[Dict]],
                      swing_lows: Optional[List[Dict]]) -> bool:
    """
    Verifie si l'OB est situe a un swing point.
    Un OB extreme (a un swing) est beaucoup plus fort car il
    represente un point de retournement institutionnel.
    """
    try:
        if direction == 'bullish' and swing_lows:
            for sl in swing_lows:
                # L'OB est proche du swing low (meme zone)
                if abs(sl.get('index', -100) - ob_idx) <= 2:
                    return True
                if abs(sl.get('price', 0) - ob_candle['low']) < (ob_candle['high'] - ob_candle['low']) * 0.3:
                    return True

        elif direction == 'bearish' and swing_highs:
            for sh in swing_highs:
                if abs(sh.get('index', -100) - ob_idx) <= 2:
                    return True
                if abs(sh.get('price', 0) - ob_candle['high']) < (ob_candle['high'] - ob_candle['low']) * 0.3:
                    return True

        return False
    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  REFINEMENT — Trouver la bougie exacte dans un OB multi-bougies
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _refine_ob(candles: List[Dict], ob_idx: int, direction: str,
               max_lookback: int = 3) -> Dict[str, float]:
    """
    Raffine l'OB en cherchant la bougie avec le plus grand body
    dans la zone de l'OB. Cela donne un point d'entree plus precis.
    """
    try:
        best_candle = candles[ob_idx]
        best_body = abs(best_candle['close'] - best_candle['open'])

        for i in range(1, min(max_lookback + 1, ob_idx + 1)):
            idx = ob_idx - i
            if idx < 0:
                break
            c = candles[idx]
            body = abs(c['close'] - c['open'])

            # Verifier que la bougie est dans la meme direction
            if direction == 'bullish' and c['close'] >= c['open']:
                continue  # On cherche des bougies bearish pour OB bullish
            if direction == 'bearish' and c['close'] <= c['open']:
                continue

            if body > best_body:
                best_candle = c
                best_body = body

        if direction == 'bullish':
            return {'high': best_candle['open'], 'low': best_candle['low']}
        else:
            return {'high': best_candle['high'], 'low': best_candle['open']}

    except Exception:
        return {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  FVG EMBARQUE — OB avec FVG = haute qualite
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_fvg_in_impulse(impulse_candles: List[Dict]) -> bool:
    """Verifie si un FVG a ete cree dans le mouvement impulsif."""
    try:
        if len(impulse_candles) < 3:
            return False
        for i in range(2, len(impulse_candles)):
            c1 = impulse_candles[i - 2]
            c3 = impulse_candles[i]
            # FVG bullish ou bearish
            if c3['low'] > c1['high'] or c1['low'] > c3['high']:
                return True
        return False
    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MITIGATION & INVALIDATION DES OB
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def check_ob_mitigation(ob: Dict, candles: List[Dict]) -> Dict:
    """
    Verifie la mitigation et l'invalidation d'un OB.

    Regle ICT: si le prix CLOSE au travers du body de l'OB,
    l'OB est INVALIDE (pas juste un wick).
    """
    try:
        for c in candles:
            if c['time'] <= ob['created_at']:
                continue

            if ob['direction'] == 'bullish':
                # Mitigation: le prix touche l'OB
                if c['low'] <= ob['ce_50']:
                    ob['retests'] += 1

                # Invalidation: le BODY close sous le low de l'OB
                if c['close'] < ob['low']:
                    ob['invalidated'] = True
                    ob['mitigated'] = True
                    ob['status'] = 'INVALIDATED'
                    break

                # Simple mitigation (wick touche le low)
                if c['low'] <= ob['low']:
                    ob['mitigated'] = True
                    ob['status'] = 'MITIGATED'
                    break

            else:  # bearish
                if c['high'] >= ob['ce_50']:
                    ob['retests'] += 1

                # Invalidation: le BODY close au-dessus du high de l'OB
                if c['close'] > ob['high']:
                    ob['invalidated'] = True
                    ob['mitigated'] = True
                    ob['status'] = 'INVALIDATED'
                    break

                if c['high'] >= ob['high']:
                    ob['mitigated'] = True
                    ob['status'] = 'MITIGATED'
                    break

        return ob

    except Exception as e:
        logger.error("Erreur check_ob_mitigation: %s", e)
        return ob


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCORING DE QUALITE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_ob_quality(impulse_ratio: float, has_fvg: bool, bos: Dict,
                      timeframe: str, is_extreme: bool, is_propulsion: bool,
                      ob_candle: Dict, candles: List[Dict], ob_idx: int) -> int:
    """Score de qualite avance pour un OB (0-100)."""
    try:
        quality = 0

        # 1. Impulse ratio (max 25)
        if impulse_ratio > 3:
            quality += 25
        elif impulse_ratio > 2:
            quality += 20
        elif impulse_ratio > 1.5:
            quality += 15
        elif impulse_ratio > 1:
            quality += 10
        else:
            quality += 5

        # 2. FVG embarque (max 15)
        if has_fvg:
            quality += 15

        # 3. Force du BOS (max 15)
        strength = bos.get('strength', 'weak')
        if strength == 'strong_displacement':
            quality += 15
        elif strength == 'strong':
            quality += 12
        elif strength == 'moderate':
            quality += 8
        else:
            quality += 3

        # 4. Timeframe (max 15)
        tf_weights = {'W1': 15, 'D1': 15, 'H4': 13, 'H1': 11, 'M15': 9, 'M5': 6, 'M1': 3}
        quality += tf_weights.get(timeframe, 6)

        # 5. OB Extreme bonus (max 15)
        if is_extreme:
            quality += 15
        elif is_propulsion:
            quality += 12

        # 6. Body ratio de l'OB (max 15)
        body_ratio = _candle_body_ratio(ob_candle)
        if body_ratio > 0.7:
            quality += 15
        elif body_ratio > 0.5:
            quality += 10
        elif body_ratio > 0.3:
            quality += 5
        else:
            quality += 2

        return max(0, min(100, quality))

    except Exception:
        return 50


def _candle_body_ratio(candle: Dict) -> float:
    """Ratio body/range d'une bougie."""
    try:
        body = abs(candle['close'] - candle['open'])
        total = candle['high'] - candle['low']
        return body / total if total > 0 else 0.5
    except Exception:
        return 0.5
