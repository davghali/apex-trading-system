from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — BOS & CHoCH Detection (Production Grade)
  Detection de Break of Structure et Change of Character avec:
  - Verification par BODY CLOSE (pas juste le wick)
  - Displacement detection (impulsion forte)
  - Structure interne vs externe
  - Confirmation de shift par pullback
  - Sequencage ordonne des evenements
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("apex.structure")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BOS DETECTION — Break of Structure
#  Un vrai BOS = le BODY (close) casse le niveau, pas juste le wick
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_bos(candles: List[Dict], swing_highs: List[Dict],
               swing_lows: List[Dict], current_structure: str) -> List[Dict]:
    """
    Detecte les Break of Structure (BOS).

    Regle ICT cruciale: le BOS est confirme par le BODY CLOSE
    au-dessus/en-dessous du niveau, pas juste un wick qui depasse.
    Cela filtre les faux breakouts (sweeps de liquidite).
    """
    try:
        signals: List[Dict] = []
        if not candles or len(candles) < 3:
            return signals

        # Scanner les dernieres bougies pour les BOS (pas juste la derniere)
        scan_range = min(20, len(candles))

        if current_structure == 'bullish':
            for sh in reversed(swing_highs):
                if sh['broken']:
                    continue
                # Chercher une bougie dont le BODY close au-dessus du swing high
                for ci in range(len(candles) - scan_range, len(candles)):
                    if ci < 0:
                        continue
                    c = candles[ci]
                    # Regle: le CLOSE doit etre au-dessus du niveau
                    if c['close'] > sh['price'] and c['time'] > sh['time']:
                        displacement = _detect_displacement(candles, ci, 'bullish')
                        signals.append({
                            'type': 'BOS',
                            'direction': 'bullish',
                            'level': sh['price'],
                            'break_price': c['close'],
                            'time': c['time'],
                            'candle_index': ci,
                            'strength': _assess_strength(candles, ci, sh['price'], 'bullish'),
                            'body_closed_through': True,
                            'displacement': displacement,
                            'is_displacement': displacement['is_displacement'],
                            'sequence_order': len(signals),
                        })
                        sh['broken'] = True
                        break

        elif current_structure == 'bearish':
            for sl in reversed(swing_lows):
                if sl['broken']:
                    continue
                for ci in range(len(candles) - scan_range, len(candles)):
                    if ci < 0:
                        continue
                    c = candles[ci]
                    # Regle: le CLOSE doit etre en-dessous du niveau
                    if c['close'] < sl['price'] and c['time'] > sl['time']:
                        displacement = _detect_displacement(candles, ci, 'bearish')
                        signals.append({
                            'type': 'BOS',
                            'direction': 'bearish',
                            'level': sl['price'],
                            'break_price': c['close'],
                            'time': c['time'],
                            'candle_index': ci,
                            'strength': _assess_strength(candles, ci, sl['price'], 'bearish'),
                            'body_closed_through': True,
                            'displacement': displacement,
                            'is_displacement': displacement['is_displacement'],
                            'sequence_order': len(signals),
                        })
                        sl['broken'] = True
                        break

        return signals

    except Exception as e:
        logger.error("Erreur detect_bos: %s", e)
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CHoCH DETECTION — Change of Character
#  Signal de retournement potentiel quand la structure casse
#  dans la direction opposee
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_choch(candles: List[Dict], swing_highs: List[Dict],
                 swing_lows: List[Dict], current_structure: str) -> List[Dict]:
    """
    Detecte les Change of Character (CHoCH).

    Un CHoCH = la structure change de direction.
    Ex: en tendance bearish, le prix casse un swing high -> CHoCH bullish.
    Verification par BODY CLOSE obligatoire.
    """
    try:
        signals: List[Dict] = []
        if not candles or len(candles) < 3:
            return signals

        scan_range = min(20, len(candles))

        if current_structure == 'bearish' and swing_highs:
            # En bearish, on cherche une cassure au-dessus d'un lower high -> retournement
            for sh in reversed(swing_highs):
                if sh['broken']:
                    continue
                for ci in range(len(candles) - scan_range, len(candles)):
                    if ci < 0:
                        continue
                    c = candles[ci]
                    if c['close'] > sh['price'] and c['time'] > sh['time']:
                        displacement = _detect_displacement(candles, ci, 'bullish')
                        # Verifier si un pullback a confirme le shift
                        pullback_confirmed = _check_pullback_confirmation(
                            candles, ci, sh['price'], 'bullish'
                        )
                        signals.append({
                            'type': 'CHoCH',
                            'direction': 'bullish',
                            'level': sh['price'],
                            'break_price': c['close'],
                            'time': c['time'],
                            'candle_index': ci,
                            'significance': 'HIGH',
                            'implication': 'POTENTIAL_REVERSAL_TO_BULLISH',
                            'body_closed_through': True,
                            'displacement': displacement,
                            'is_displacement': displacement['is_displacement'],
                            'pullback_confirmed': pullback_confirmed,
                            'confirmed': pullback_confirmed,
                            'sequence_order': len(signals),
                        })
                        sh['broken'] = True
                        break

        elif current_structure == 'bullish' and swing_lows:
            for sl in reversed(swing_lows):
                if sl['broken']:
                    continue
                for ci in range(len(candles) - scan_range, len(candles)):
                    if ci < 0:
                        continue
                    c = candles[ci]
                    if c['close'] < sl['price'] and c['time'] > sl['time']:
                        displacement = _detect_displacement(candles, ci, 'bearish')
                        pullback_confirmed = _check_pullback_confirmation(
                            candles, ci, sl['price'], 'bearish'
                        )
                        signals.append({
                            'type': 'CHoCH',
                            'direction': 'bearish',
                            'level': sl['price'],
                            'break_price': c['close'],
                            'time': c['time'],
                            'candle_index': ci,
                            'significance': 'HIGH',
                            'implication': 'POTENTIAL_REVERSAL_TO_BEARISH',
                            'body_closed_through': True,
                            'displacement': displacement,
                            'is_displacement': displacement['is_displacement'],
                            'pullback_confirmed': pullback_confirmed,
                            'confirmed': pullback_confirmed,
                            'sequence_order': len(signals),
                        })
                        sl['broken'] = True
                        break

        return signals

    except Exception as e:
        logger.error("Erreur detect_choch: %s", e)
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DISPLACEMENT DETECTION — Bougie impulsive forte
#  Une bougie de displacement a un grand body, peu de wick,
#  et traverse le niveau avec conviction
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _detect_displacement(candles: List[Dict], break_idx: int,
                         direction: str) -> Dict[str, Any]:
    """
    Detecte si la bougie de cassure est un displacement (impulsion forte).

    Criteres:
    - Ratio body/range >= 0.65 (peu de wick = conviction)
    - Taille de la bougie >= 1.5x la taille moyenne recente
    - La bougie close fortement au-dela du niveau
    """
    try:
        if break_idx < 0 or break_idx >= len(candles):
            return {'is_displacement': False, 'body_ratio': 0, 'size_ratio': 0}

        c = candles[break_idx]
        body = abs(c['close'] - c['open'])
        total = c['high'] - c['low']

        if total <= 0:
            return {'is_displacement': False, 'body_ratio': 0, 'size_ratio': 0}

        body_ratio = body / total

        # Taille relative aux bougies recentes
        lookback = min(20, break_idx)
        if lookback > 0:
            avg_range = sum(
                candles[break_idx - i]['high'] - candles[break_idx - i]['low']
                for i in range(1, lookback + 1)
            ) / lookback
        else:
            avg_range = total

        size_ratio = total / avg_range if avg_range > 0 else 1.0

        # Verification de la direction
        is_bullish_disp = direction == 'bullish' and c['close'] > c['open']
        is_bearish_disp = direction == 'bearish' and c['close'] < c['open']
        correct_direction = is_bullish_disp or is_bearish_disp

        is_displacement = body_ratio >= 0.65 and size_ratio >= 1.5 and correct_direction

        return {
            'is_displacement': is_displacement,
            'body_ratio': round(body_ratio, 3),
            'size_ratio': round(size_ratio, 2),
            'candle_range': round(total, 6),
            'body_size': round(body, 6),
        }

    except Exception:
        return {'is_displacement': False, 'body_ratio': 0, 'size_ratio': 0}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PULLBACK CONFIRMATION — Le prix revient tester le niveau casse
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_pullback_confirmation(candles: List[Dict], break_idx: int,
                                  level: float, direction: str) -> bool:
    """
    Verifie si un pullback vers le niveau casse a confirme le shift.

    Apres un CHoCH, on attend que le prix revienne tester le niveau
    puis rebondisse dans la nouvelle direction. Cela confirme le shift.
    """
    try:
        max_check = min(10, len(candles) - break_idx - 1)
        if max_check <= 0:
            return False

        for i in range(1, max_check + 1):
            idx = break_idx + i
            if idx >= len(candles):
                break
            c = candles[idx]

            if direction == 'bullish':
                # Le prix est revenu tester le niveau par le haut puis a rebondi
                if c['low'] <= level * 1.001 and c['close'] > level:
                    return True
            else:
                # Le prix est revenu tester le niveau par le bas puis a rebondi
                if c['high'] >= level * 0.999 and c['close'] < level:
                    return True

        return False

    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  STRUCTURE INTERNE vs EXTERNE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def classify_structure(events: List[Dict], timeframe: str) -> Dict[str, Any]:
    """
    Classifie la structure en interne (micro) vs externe (macro).

    Structure externe = TF superieurs (H4, D1, W1) = direction principale
    Structure interne = TF inferieurs (M1, M5, M15) = timing d'entree
    """
    try:
        external_tfs = {'H4', 'D1', 'W1'}
        internal_tfs = {'M1', 'M5', 'M15', 'H1'}

        is_external = timeframe in external_tfs
        structure_type = 'EXTERNAL' if is_external else 'INTERNAL'

        return {
            'structure_type': structure_type,
            'timeframe': timeframe,
            'total_events': len(events),
            'bos_count': sum(1 for e in events if e.get('type') == 'BOS'),
            'choch_count': sum(1 for e in events if e.get('type') == 'CHoCH'),
            'displacement_count': sum(1 for e in events if e.get('is_displacement')),
            'confirmed_shifts': sum(1 for e in events if e.get('confirmed')),
            'priority': 'HIGH' if is_external else 'MEDIUM',
            'description': (
                f"Structure {'externe (directionnelle)' if is_external else 'interne (timing)'} "
                f"sur {timeframe}"
            ),
        }

    except Exception:
        return {
            'structure_type': 'UNKNOWN',
            'timeframe': timeframe,
            'total_events': 0,
            'bos_count': 0,
            'choch_count': 0,
            'displacement_count': 0,
            'confirmed_shifts': 0,
            'priority': 'LOW',
            'description': 'Erreur classification',
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCORING DE FORCE D'UN BOS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _assess_strength(candles: List[Dict], break_idx: int,
                     level: float, direction: str) -> str:
    """
    Evalue la force d'un break (BOS).
    Utilise le body ratio, le displacement au-dela du niveau,
    et la taille relative de la bougie.
    """
    try:
        if break_idx < 0 or break_idx >= len(candles):
            return 'weak'

        last = candles[break_idx]
        body = abs(last['close'] - last['open'])
        total = last['high'] - last['low']
        if total == 0:
            return 'weak'

        body_ratio = body / total

        if direction == 'bullish':
            displacement = last['close'] - level
        else:
            displacement = level - last['close']

        # Taille relative
        lookback = min(10, break_idx)
        if lookback > 0:
            avg_body = sum(
                abs(candles[break_idx - i]['close'] - candles[break_idx - i]['open'])
                for i in range(1, lookback + 1)
            ) / lookback
        else:
            avg_body = body

        body_mult = body / avg_body if avg_body > 0 else 1.0

        if body_ratio > 0.7 and displacement > 0 and body_mult > 1.5:
            return 'strong_displacement'
        elif body_ratio > 0.6 and displacement > 0:
            return 'strong'
        elif body_ratio > 0.4 and displacement > 0:
            return 'moderate'
        return 'weak'

    except Exception:
        return 'weak'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AGGREGATEUR — Tous les evenements de structure, ordonnes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_all_structure_events(candles: List[Dict], swing_highs: List[Dict],
                             swing_lows: List[Dict], structure: str) -> List[Dict]:
    """
    Retourne TOUS les evenements de structure (BOS + CHoCH),
    tries par ordre chronologique (sequence_order).
    """
    try:
        bos_events = detect_bos(candles, swing_highs, swing_lows, structure)
        choch_events = detect_choch(candles, swing_highs, swing_lows, structure)

        all_events = bos_events + choch_events

        # Trier par temps puis par ordre de sequence
        all_events.sort(key=lambda e: (e.get('time', 0), e.get('sequence_order', 0)))

        # Re-numeroter les sequences
        for idx, event in enumerate(all_events):
            event['sequence_order'] = idx

        return all_events

    except Exception as e:
        logger.error("Erreur get_all_structure_events: %s", e)
        return []
