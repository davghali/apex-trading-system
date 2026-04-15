from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Power of Three (PO3) Detection (Production Grade)
  AMD Pattern (Accumulation, Manipulation, Distribution) avec:
  - Detection du range Asia (high/low reel)
  - Judas Swing detection (faux mouvement avant le vrai)
  - AMD phase confidence scoring
  - Tracking du deplacement de manipulation vs attendu
  - ICT time-based patterns (9:50, 10:10, Silver Bullet windows)
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("apex.po3")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTES — Heures NY (EST) pour chaque phase
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NY_TZ_OFFSET = -5  # EST

# Silver Bullet Windows — fenetres de haute probabilite ICT
SILVER_BULLET_WINDOWS = {
    'SB_LONDON':  {'start_h': 3,  'start_m': 0,  'end_h': 4,  'end_m': 0,
                   'name': 'Silver Bullet London (03:00-04:00 NY)'},
    'SB_NY_AM':   {'start_h': 10, 'start_m': 0,  'end_h': 11, 'end_m': 0,
                   'name': 'Silver Bullet NY AM (10:00-11:00 NY)'},
    'SB_NY_PM':   {'start_h': 14, 'start_m': 0,  'end_h': 15, 'end_m': 0,
                   'name': 'Silver Bullet NY PM (14:00-15:00 NY)'},
}

# ICT Macro Times — moments specifiques ou les algos institutionnels agissent
ICT_MACROS = {
    'MACRO_0950': {'hour': 9,  'minute': 50, 'name': '9:50 Macro — Pre-NY open setup',
                   'description': 'Bougie de reference avant le 10:00 move'},
    'MACRO_1010': {'hour': 10, 'minute': 10, 'name': '10:10 Reversal — NY open reversal',
                   'description': 'Reversal classique apres le fake move de 10:00'},
    'MACRO_1110': {'hour': 11, 'minute': 10, 'name': '11:10 Continuation — Mid-morning move',
                   'description': 'Continuation du vrai mouvement apres la manipulation'},
    'MACRO_1350': {'hour': 13, 'minute': 50, 'name': '13:50 PM Setup — Afternoon setup',
                   'description': 'Setup de l apres-midi avant le 14:00 Silver Bullet'},
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HEURE NY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_ny_time(timestamp: Optional[int] = None) -> datetime:
    """Retourne le datetime en heure NY."""
    try:
        if timestamp:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)
        return dt + timedelta(hours=NY_TZ_OFFSET)
    except Exception:
        return datetime.now(timezone.utc) + timedelta(hours=NY_TZ_OFFSET)


def get_ny_hour(timestamp: Optional[int] = None) -> int:
    """Retourne l'heure NY pour un timestamp."""
    try:
        return get_ny_time(timestamp).hour
    except Exception:
        return 12


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  IDENTIFICATION DE PHASE AMD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def identify_phase(timestamp: Optional[int] = None) -> Dict[str, Any]:
    """
    Identifie la phase AMD (Accumulation-Manipulation-Distribution)
    basee sur l'heure NY.

    Accumulation (Asia) : 20:00 - 02:00 NY -> Le range se forme
    Manipulation (London): 02:00 - 08:00 NY -> Le faux mouvement
    Distribution (NY)    : 08:00 - 16:00 NY -> Le vrai mouvement
    Post-Session         : 16:00 - 20:00 NY -> Ne pas trader
    """
    try:
        ny = get_ny_time(timestamp)
        hour = ny.hour
        minute = ny.minute

        if 20 <= hour or hour < 2:
            phase = 'ACCUMULATION'
            action = 'OBSERVER — Identifier le range Asia'
            confidence = 80  # Haute confiance: c'est toujours l'accumulation
        elif 2 <= hour < 5:
            phase = 'MANIPULATION'
            sub_phase = 'EARLY_MANIPULATION'
            action = 'PREPARER — Manipulation commence (London Open)'
            confidence = 75
        elif 5 <= hour < 8:
            phase = 'MANIPULATION'
            sub_phase = 'LATE_MANIPULATION'
            action = 'CHERCHER ENTREE — Manipulation en cours'
            confidence = 85
        elif 8 <= hour < 12:
            phase = 'DISTRIBUTION'
            sub_phase = 'DISTRIBUTION_AM'
            action = 'GERER TRADES — Distribution AM en cours'
            confidence = 90
        elif 12 <= hour < 16:
            phase = 'DISTRIBUTION'
            sub_phase = 'DISTRIBUTION_PM'
            action = 'GERER TRADES — Distribution PM, TP partiel'
            confidence = 70
        else:
            phase = 'POST_SESSION'
            action = 'NE PAS TRADER — Apres la session'
            confidence = 95

        # Silver Bullet detection
        active_sb = _check_silver_bullet(hour, minute)

        # ICT Macro detection
        active_macro = _check_ict_macro(hour, minute)

        return {
            'phase': phase,
            'action': action,
            'confidence': confidence,
            'is_entry_window': phase == 'MANIPULATION',
            'is_tp_window': phase == 'DISTRIBUTION',
            'silver_bullet': active_sb,
            'ict_macro': active_macro,
            'ny_time': ny.strftime('%H:%M'),
            'ny_hour': hour,
            'ny_minute': minute,
        }

    except Exception as e:
        logger.error("Erreur identify_phase: %s", e)
        return {
            'phase': 'UNKNOWN', 'action': 'ERREUR', 'confidence': 0,
            'is_entry_window': False, 'is_tp_window': False,
            'silver_bullet': None, 'ict_macro': None,
            'ny_time': '00:00', 'ny_hour': 0, 'ny_minute': 0,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SILVER BULLET WINDOWS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_silver_bullet(hour: int, minute: int) -> Optional[Dict[str, Any]]:
    """Verifie si on est dans une fenetre Silver Bullet."""
    try:
        for sb_key, sb in SILVER_BULLET_WINDOWS.items():
            sh, sm = sb['start_h'], sb['start_m']
            eh, em = sb['end_h'], sb['end_m']
            current_minutes = hour * 60 + minute
            start_minutes = sh * 60 + sm
            end_minutes = eh * 60 + em

            if start_minutes <= current_minutes < end_minutes:
                elapsed = current_minutes - start_minutes
                total = end_minutes - start_minutes
                return {
                    'active': True,
                    'window': sb_key,
                    'name': sb['name'],
                    'progress': round((elapsed / total) * 100) if total > 0 else 0,
                    'minutes_remaining': total - elapsed,
                }
        return None
    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ICT MACRO TIMES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_ict_macro(hour: int, minute: int) -> Optional[Dict[str, Any]]:
    """Verifie si on est proche d'un ICT Macro Time (+-5 minutes)."""
    try:
        current_minutes = hour * 60 + minute
        for macro_key, macro in ICT_MACROS.items():
            macro_minutes = macro['hour'] * 60 + macro['minute']
            diff = abs(current_minutes - macro_minutes)
            if diff <= 5:
                return {
                    'active': True,
                    'macro': macro_key,
                    'name': macro['name'],
                    'description': macro['description'],
                    'minutes_away': diff,
                    'exact': diff == 0,
                }
        return None
    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION DU RANGE ASIA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_asian_range(candles: List[Dict]) -> Dict[str, Any]:
    """
    Detecte le range de la session asiatique (20:00 - 00:00 NY).
    C'est la zone d'accumulation du PO3.

    Le prix tend a sortir de ce range pendant la manipulation
    (London open) puis a distribuer dans la direction opposee.
    """
    try:
        asia_candles = []
        for c in candles:
            ny_hour = get_ny_hour(c['time'])
            # Asia = 20:00 - 00:00 NY
            if 20 <= ny_hour or ny_hour < 0:
                asia_candles.append(c)
            # Aussi inclure 00:00-02:00 comme extension
            elif 0 <= ny_hour < 2:
                asia_candles.append(c)

        if not asia_candles:
            return {
                'detected': False,
                'high': None, 'low': None, 'mid': None,
                'range_size': 0, 'candle_count': 0,
            }

        high = max(c['high'] for c in asia_candles)
        low = min(c['low'] for c in asia_candles)
        mid = (high + low) / 2
        range_size = high - low

        return {
            'detected': True,
            'high': round(high, 6),
            'low': round(low, 6),
            'mid': round(mid, 6),
            'range_size': round(range_size, 6),
            'candle_count': len(asia_candles),
            'open': asia_candles[0]['open'],
            'close': asia_candles[-1]['close'],
        }

    except Exception as e:
        logger.error("Erreur detect_asian_range: %s", e)
        return {
            'detected': False,
            'high': None, 'low': None, 'mid': None,
            'range_size': 0, 'candle_count': 0,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  JUDAS SWING — Faux mouvement avant le vrai
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_judas_swing(candles: List[Dict], asian_range: Dict,
                       daily_bias: str) -> Dict[str, Any]:
    """
    Detecte le Judas Swing — le faux mouvement qui trompe les traders
    pendant la manipulation (London open).

    Si le daily bias est BULLISH:
    -> Le Judas Swing est un faux mouvement BEARISH (sweep de l'Asia low)
    -> Puis le prix reverse vers le haut

    Si le daily bias est BEARISH:
    -> Le Judas Swing est un faux mouvement BULLISH (sweep de l'Asia high)
    -> Puis le prix reverse vers le bas
    """
    try:
        if not asian_range.get('detected') or not candles:
            return {
                'detected': False, 'direction': 'NONE',
                'sweep_price': None, 'reversal_confirmed': False,
            }

        asia_high = asian_range['high']
        asia_low = asian_range['low']

        # Chercher les bougies de London (02:00-08:00 NY)
        london_candles = []
        for c in candles:
            ny_hour = get_ny_hour(c['time'])
            if 2 <= ny_hour < 8:
                london_candles.append(c)

        if not london_candles:
            return {
                'detected': False, 'direction': 'NONE',
                'sweep_price': None, 'reversal_confirmed': False,
            }

        judas_detected = False
        judas_direction = 'NONE'
        sweep_price = None
        reversal_confirmed = False

        if daily_bias == 'BULLISH':
            # Judas = faux mouvement bearish sous Asia low
            for i, c in enumerate(london_candles):
                if c['low'] < asia_low:
                    judas_detected = True
                    judas_direction = 'BEARISH_FAKE'
                    sweep_price = c['low']
                    # Verifier le reversal
                    for j in range(i + 1, min(i + 5, len(london_candles))):
                        if london_candles[j]['close'] > asia_low:
                            reversal_confirmed = True
                            break
                    break

        elif daily_bias == 'BEARISH':
            for i, c in enumerate(london_candles):
                if c['high'] > asia_high:
                    judas_detected = True
                    judas_direction = 'BULLISH_FAKE'
                    sweep_price = c['high']
                    for j in range(i + 1, min(i + 5, len(london_candles))):
                        if london_candles[j]['close'] < asia_high:
                            reversal_confirmed = True
                            break
                    break

        return {
            'detected': judas_detected,
            'direction': judas_direction,
            'sweep_price': round(sweep_price, 6) if sweep_price else None,
            'reversal_confirmed': reversal_confirmed,
            'confidence': 90 if reversal_confirmed else (60 if judas_detected else 0),
            'description': (
                f"Judas Swing {judas_direction} detecte"
                + (" — CONFIRME par reversal" if reversal_confirmed else " — En attente de confirmation")
                if judas_detected else "Pas de Judas Swing detecte"
            ),
        }

    except Exception as e:
        logger.error("Erreur detect_judas_swing: %s", e)
        return {
            'detected': False, 'direction': 'NONE',
            'sweep_price': None, 'reversal_confirmed': False,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ANALYSE PO3 COMPLETE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def analyze_po3(midnight_open: float, daily_open: Optional[float],
                current_price: float, daily_bias: str,
                timestamp: Optional[int] = None,
                intraday_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
    """
    Analyse PO3 complete: phase AMD + position par rapport aux references.

    Le PO3 (Power of Three) est le pattern fondamental ICT:
    1. Accumulation (Asia): le range se forme
    2. Manipulation: faux mouvement pour capturer la liquidite
    3. Distribution: le vrai mouvement dans la direction du bias
    """
    try:
        phase_info = identify_phase(timestamp)

        mo_relative = 'ABOVE' if current_price > midnight_open else 'BELOW'
        do_relative = None
        if daily_open is not None:
            do_relative = 'ABOVE' if current_price > daily_open else 'BELOW'

        # Detection du range Asia
        asian_range = {'detected': False}
        judas = {'detected': False}
        manipulation_distance = 0.0
        expected_manipulation = 0.0

        if intraday_candles:
            asian_range = detect_asian_range(intraday_candles)
            if asian_range.get('detected'):
                judas = detect_judas_swing(intraday_candles, asian_range, daily_bias)

                # Calcul de la distance de manipulation
                if daily_bias == 'BULLISH' and asian_range.get('low'):
                    manipulation_distance = max(0, asian_range['low'] - current_price)
                    expected_manipulation = asian_range.get('range_size', 0) * 0.5
                elif daily_bias == 'BEARISH' and asian_range.get('high'):
                    manipulation_distance = max(0, current_price - asian_range['high'])
                    expected_manipulation = asian_range.get('range_size', 0) * 0.5

        # ━━━ Evaluation de la manipulation ━━━
        in_manipulation = False
        optimal_entry_zone = False

        if daily_bias == 'BULLISH':
            in_manipulation = mo_relative == 'BELOW'
            optimal_entry_zone = mo_relative == 'BELOW' and (do_relative == 'BELOW' or do_relative is None)
        elif daily_bias == 'BEARISH':
            in_manipulation = mo_relative == 'ABOVE'
            optimal_entry_zone = mo_relative == 'ABOVE' and (do_relative == 'ABOVE' or do_relative is None)

        # ━━━ Confidence scoring ━━━
        confidence = _score_amd_confidence(
            phase_info, in_manipulation, optimal_entry_zone,
            judas, daily_bias, asian_range
        )

        below_or_above = 'en-dessous' if daily_bias == 'BULLISH' else 'au-dessus'
        zone_status = 'ZONE OPTIMALE' if optimal_entry_zone else 'ATTENDRE'

        # Manipulation tracking
        manip_pct = 0.0
        if expected_manipulation > 0:
            manip_pct = min(100, (manipulation_distance / expected_manipulation) * 100)

        return {
            **phase_info,
            'midnight_open': midnight_open,
            'daily_open': daily_open,
            'price_vs_mo': mo_relative,
            'price_vs_do': do_relative,
            'in_manipulation': in_manipulation,
            'optimal_entry_zone': optimal_entry_zone,
            'asian_range': asian_range,
            'judas_swing': judas,
            'manipulation_distance': round(manipulation_distance, 6),
            'manipulation_percentage': round(manip_pct, 1),
            'amd_confidence': confidence,
            'entry_recommendation': f"{zone_status} — Prix {below_or_above} du MO/DO pendant la manip",
        }

    except Exception as e:
        logger.error("Erreur analyze_po3: %s", e)
        return {
            'phase': 'UNKNOWN', 'action': 'ERREUR', 'confidence': 0,
            'is_entry_window': False, 'is_tp_window': False,
            'midnight_open': midnight_open, 'daily_open': daily_open,
            'price_vs_mo': 'UNKNOWN', 'price_vs_do': None,
            'in_manipulation': False, 'optimal_entry_zone': False,
            'asian_range': {'detected': False},
            'judas_swing': {'detected': False},
            'manipulation_distance': 0, 'manipulation_percentage': 0,
            'amd_confidence': 0,
            'entry_recommendation': 'ERREUR — Impossible de determiner',
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AMD CONFIDENCE SCORING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_amd_confidence(phase_info: Dict, in_manipulation: bool,
                          optimal_entry: bool, judas: Dict,
                          daily_bias: str, asian_range: Dict) -> int:
    """Score de confiance pour le pattern AMD (0-100)."""
    try:
        score = 0

        # Phase correcte pour l'entree
        phase = phase_info.get('phase', '')
        if phase == 'MANIPULATION':
            score += 25
        elif phase == 'DISTRIBUTION':
            score += 15
        elif phase == 'ACCUMULATION':
            score += 5

        # Prix en zone de manipulation
        if optimal_entry:
            score += 25
        elif in_manipulation:
            score += 15

        # Judas Swing confirme
        if judas.get('reversal_confirmed'):
            score += 25
        elif judas.get('detected'):
            score += 10

        # Bias quotidien clair
        if daily_bias in ('BULLISH', 'BEARISH'):
            score += 10

        # Range Asia detecte
        if asian_range.get('detected'):
            score += 10

        # Silver Bullet active
        if phase_info.get('silver_bullet'):
            score += 5

        return min(100, score)

    except Exception:
        return 0
