from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 4: Killzone Session Manager (KSM)
  Gestionnaire de sessions et killzones avec:
  - Silver Bullet windows (10:00-11:00 NY, 14:00-15:00 NY, 03:00-04:00 NY)
  - ICT Macros (9:50, 10:10, 11:10 candle patterns)
  - Suivi des highs/lows de session en live
  - Volatilite et expansion de range par session
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("apex.ksm")

NY_OFFSET = -5

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  KILLZONES — Fenetres de trading haute probabilite
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KILLZONES: Dict[str, Dict[str, Any]] = {
    'ASIAN':        {'start': 20, 'end': 0,  'tradeable': False, 'desc': 'Session Asiatique — Accumulation'},
    'LONDON_KZ':    {'start': 2,  'end': 5,  'tradeable': True,  'desc': 'London Killzone — Manipulation'},
    'NY_KZ':        {'start': 7,  'end': 10, 'tradeable': True,  'desc': 'NY Killzone — Distribution'},
    'LONDON_CLOSE': {'start': 10, 'end': 12, 'tradeable': False, 'desc': 'London Close — Prudence'},
}

SILVER_BULLETS: Dict[str, Dict[str, Any]] = {
    'SB_LONDON': {'start_h': 3,  'start_m': 0,  'end_h': 4,  'end_m': 0,
                  'name': 'Silver Bullet London (03:00-04:00 NY)',
                  'desc': 'Fenetre haute probabilite pendant London'},
    'SB_NY_AM':  {'start_h': 10, 'start_m': 0,  'end_h': 11, 'end_m': 0,
                  'name': 'Silver Bullet NY AM (10:00-11:00 NY)',
                  'desc': 'Fenetre haute probabilite NY matin'},
    'SB_NY_PM':  {'start_h': 14, 'start_m': 0,  'end_h': 15, 'end_m': 0,
                  'name': 'Silver Bullet NY PM (14:00-15:00 NY)',
                  'desc': 'Fenetre haute probabilite NY apres-midi'},
}

ICT_MACROS: Dict[str, Dict[str, Any]] = {
    'MACRO_0950': {'hour': 9,  'minute': 50, 'window': 5,
                   'name': '9:50 Macro', 'desc': 'Pre-NY setup candle'},
    'MACRO_1010': {'hour': 10, 'minute': 10, 'window': 5,
                   'name': '10:10 Reversal', 'desc': 'NY open reversal pattern'},
    'MACRO_1110': {'hour': 11, 'minute': 10, 'window': 5,
                   'name': '11:10 Continuation', 'desc': 'Mid-morning continuation'},
}


class KillzoneSessionManager:
    """
    Module 4 — Killzone Session Manager.
    Gere les sessions de trading et identifie les fenetres
    de haute probabilite.
    """

    def __init__(self):
        self.session_highs: Dict[str, float] = {}
        self.session_lows: Dict[str, float] = {}
        self.session_volatility: Dict[str, float] = {}

    def get_current_session(self) -> Dict[str, Any]:
        """Retourne l'etat complet de la session actuelle."""
        try:
            ny = self._ny_now()
            h = ny.hour
            m = ny.minute

            # ━━━ Trouver la session actuelle ━━━
            current = None
            for name, times in KILLZONES.items():
                s, e = times['start'], times['end']
                if e < s:  # Overnight (Asian)
                    if h >= s or h < e:
                        current = name
                        break
                else:
                    if s <= h < e:
                        current = name
                        break

            if not current:
                current = 'POST_SESSION'

            is_active = current in ('LONDON_KZ', 'NY_KZ')

            # ━━━ Progression de la session ━━━
            time_remaining = 0
            progress = 0

            if current in KILLZONES:
                kz = KILLZONES[current]
                end_h = kz['end'] if kz['end'] > kz['start'] else kz['end'] + 24
                current_h = h if h >= kz['start'] else h + 24
                duration = (end_h - kz['start']) * 60
                elapsed = (current_h - kz['start']) * 60 + m
                time_remaining = max(0, duration - elapsed)
                progress = min(100, (elapsed / max(duration, 1)) * 100)

            # ━━━ Silver Bullet ━━━
            active_sb = self._check_silver_bullet(h, m)

            # ━━━ ICT Macro ━━━
            active_macro = self._check_ict_macro(h, m)

            # ━━━ Next session ━━━
            next_session, next_in = self._next_session(h)

            # ━━━ Session description ━━━
            session_desc = KILLZONES.get(current, {}).get('desc', 'Hors session')

            return {
                'current_session': current,
                'is_active': is_active,
                'time_remaining': time_remaining,
                'progress': round(progress),
                'next_session': next_session,
                'next_session_in': next_in,
                'ny_time': ny.strftime('%H:%M'),
                'ny_date': ny.strftime('%Y-%m-%d'),
                'session_description': session_desc,
                'silver_bullet': active_sb,
                'ict_macro': active_macro,
                'session_highs': dict(self.session_highs),
                'session_lows': dict(self.session_lows),
                'session_volatility': dict(self.session_volatility),
            }

        except Exception as e:
            logger.error("Erreur get_current_session: %s", e)
            return {
                'current_session': 'UNKNOWN', 'is_active': False,
                'time_remaining': 0, 'progress': 0,
                'next_session': 'UNKNOWN', 'next_session_in': 0,
                'ny_time': '00:00', 'ny_date': '',
                'session_description': 'Erreur', 'silver_bullet': None,
                'ict_macro': None,
            }

    def update_session_levels(self, session_name: str, candles: List[Dict]):
        """Met a jour les highs/lows d'une session en live."""
        try:
            if not candles:
                return
            self.session_highs[session_name] = max(c['high'] for c in candles)
            self.session_lows[session_name] = min(c['low'] for c in candles)

            # Volatilite = range moyen des bougies
            ranges = [c['high'] - c['low'] for c in candles]
            self.session_volatility[session_name] = sum(ranges) / len(ranges) if ranges else 0
        except Exception:
            pass

    def identify_model(self, session: str, daily_bias: str, current_price: float,
                       asian_high: Optional[float] = None, asian_low: Optional[float] = None,
                       london_high: Optional[float] = None, london_low: Optional[float] = None) -> Dict[str, Any]:
        """
        Identifie le modele ICT pour la session actuelle.
        Retourne le type de trade attendu avec la logique complete.
        """
        try:
            # Utiliser les niveaux stockes si non fournis
            if asian_high is None:
                asian_high = self.session_highs.get('ASIAN')
            if asian_low is None:
                asian_low = self.session_lows.get('ASIAN')
            if london_high is None:
                london_high = self.session_highs.get('LONDON_KZ')
            if london_low is None:
                london_low = self.session_lows.get('LONDON_KZ')

            if session == 'LONDON_KZ':
                return self._london_model(daily_bias, current_price, asian_high, asian_low)
            elif session == 'NY_KZ':
                return self._ny_model(daily_bias, current_price, asian_high, asian_low,
                                      london_high, london_low)
            elif session == 'ASIAN':
                return {
                    'model': 'ASIAN_RANGE', 'direction': 'NONE',
                    'logic': 'Session Asia — Formation du range. Ne pas trader.',
                    'entry_type': '', 'target': '',
                    'confidence': 'LOW', 'tradeable': False,
                }
            elif session == 'LONDON_CLOSE':
                return {
                    'model': 'LONDON_CLOSE', 'direction': 'NONE',
                    'logic': 'London Close — Volatilite de cloture. Prudence.',
                    'entry_type': '', 'target': '',
                    'confidence': 'LOW', 'tradeable': False,
                }

            return {
                'model': 'NONE', 'direction': 'NONE',
                'logic': 'Hors KZ — Ne pas trader',
                'entry_type': '', 'target': '',
                'confidence': 'LOW', 'tradeable': False,
            }

        except Exception as e:
            logger.error("Erreur identify_model: %s", e)
            return {
                'model': 'ERROR', 'direction': 'NONE',
                'logic': 'Erreur identification modele',
                'entry_type': '', 'target': '',
                'confidence': 'LOW', 'tradeable': False,
            }

    def _london_model(self, daily_bias: str, price: float,
                      asian_high: Optional[float], asian_low: Optional[float]) -> Dict[str, Any]:
        """Modele ICT pour London Killzone."""
        try:
            if daily_bias == 'BULLISH' and asian_low and price < asian_low:
                return {
                    'model': 'LONDON_REVERSAL', 'direction': 'LONG',
                    'logic': 'Prix sous Asian Low avec biais bullish -> Judas Swing bearish -> Reversal LONG',
                    'entry_type': 'BB + IFVG apres sweep de l Asia Low',
                    'target': 'PDH ou Asian High',
                    'confidence': 'HIGH', 'tradeable': True,
                }
            elif daily_bias == 'BEARISH' and asian_high and price > asian_high:
                return {
                    'model': 'LONDON_REVERSAL', 'direction': 'SHORT',
                    'logic': 'Prix au-dessus Asian High avec biais bearish -> Judas Swing bullish -> Reversal SHORT',
                    'entry_type': 'BB + IFVG apres sweep de l Asia High',
                    'target': 'PDL ou Asian Low',
                    'confidence': 'HIGH', 'tradeable': True,
                }
            else:
                direction = 'LONG' if daily_bias == 'BULLISH' else 'SHORT'
                return {
                    'model': 'LONDON_CONTINUATION', 'direction': direction,
                    'logic': f'Continuation {daily_bias} pendant London',
                    'entry_type': 'OB + FVG en pullback',
                    'target': 'PDH' if direction == 'LONG' else 'PDL',
                    'confidence': 'MEDIUM', 'tradeable': True,
                }
        except Exception:
            return {'model': 'NONE', 'direction': 'NONE', 'logic': 'Erreur',
                    'entry_type': '', 'target': '', 'confidence': 'LOW', 'tradeable': False}

    def _ny_model(self, daily_bias: str, price: float,
                  asian_high: Optional[float], asian_low: Optional[float],
                  london_high: Optional[float], london_low: Optional[float]) -> Dict[str, Any]:
        """Modele ICT pour NY Killzone."""
        try:
            if daily_bias == 'BULLISH':
                if london_low and price > london_low:
                    return {
                        'model': 'NY_CONTINUATION', 'direction': 'LONG',
                        'logic': 'Biais bullish maintenu — London a defini la direction haussiere',
                        'entry_type': 'OB + FVG en pullback vers London Range',
                        'target': 'PDH ou BSL suivant',
                        'confidence': 'HIGH', 'tradeable': True,
                    }
                else:
                    return {
                        'model': 'NY_REVERSAL', 'direction': 'LONG',
                        'logic': 'NY reverse le move bearish de London -> Continuation bullish',
                        'entry_type': 'BB + IFVG apres sweep London Low',
                        'target': 'Retest London Range',
                        'confidence': 'MEDIUM', 'tradeable': True,
                    }
            elif daily_bias == 'BEARISH':
                if london_high and price < london_high:
                    return {
                        'model': 'NY_CONTINUATION', 'direction': 'SHORT',
                        'logic': 'Biais bearish maintenu — London a defini la direction baissiere',
                        'entry_type': 'OB + FVG en pullback vers London Range',
                        'target': 'PDL ou SSL suivant',
                        'confidence': 'HIGH', 'tradeable': True,
                    }
                else:
                    return {
                        'model': 'NY_REVERSAL', 'direction': 'SHORT',
                        'logic': 'NY reverse le move bullish de London -> Continuation bearish',
                        'entry_type': 'BB + IFVG apres sweep London High',
                        'target': 'Retest London Range',
                        'confidence': 'MEDIUM', 'tradeable': True,
                    }

            return {'model': 'NY_NEUTRAL', 'direction': 'NONE',
                    'logic': 'Biais neutre', 'entry_type': '', 'target': '',
                    'confidence': 'LOW', 'tradeable': False}
        except Exception:
            return {'model': 'NONE', 'direction': 'NONE', 'logic': 'Erreur',
                    'entry_type': '', 'target': '', 'confidence': 'LOW', 'tradeable': False}

    # ━━━ SILVER BULLET ━━━

    def _check_silver_bullet(self, h: int, m: int) -> Optional[Dict[str, Any]]:
        """Verifie si on est dans une fenetre Silver Bullet."""
        try:
            current_min = h * 60 + m
            for key, sb in SILVER_BULLETS.items():
                start = sb['start_h'] * 60 + sb['start_m']
                end = sb['end_h'] * 60 + sb['end_m']
                if start <= current_min < end:
                    elapsed = current_min - start
                    total = end - start
                    return {
                        'active': True, 'window': key, 'name': sb['name'],
                        'description': sb['desc'],
                        'progress': round((elapsed / max(total, 1)) * 100),
                        'minutes_remaining': total - elapsed,
                    }
            return None
        except Exception:
            return None

    # ━━━ ICT MACROS ━━━

    def _check_ict_macro(self, h: int, m: int) -> Optional[Dict[str, Any]]:
        """Verifie si on est a un ICT Macro Time."""
        try:
            current_min = h * 60 + m
            for key, macro in ICT_MACROS.items():
                macro_min = macro['hour'] * 60 + macro['minute']
                diff = abs(current_min - macro_min)
                if diff <= macro.get('window', 5):
                    return {
                        'active': True, 'macro': key,
                        'name': macro['name'], 'description': macro['desc'],
                        'minutes_away': diff, 'exact': diff == 0,
                    }
            return None
        except Exception:
            return None

    def _ny_now(self) -> datetime:
        try:
            return datetime.now(timezone.utc) + timedelta(hours=NY_OFFSET)
        except Exception:
            return datetime.now(timezone.utc)

    def _next_session(self, current_h: int) -> Tuple[str, int]:
        try:
            order = [('LONDON_KZ', 2), ('NY_KZ', 7), ('LONDON_CLOSE', 10), ('ASIAN', 20)]
            for name, start in order:
                if current_h < start:
                    return name, (start - current_h) * 60
            return 'LONDON_KZ', (24 - current_h + 2) * 60
        except Exception:
            return 'UNKNOWN', 0
