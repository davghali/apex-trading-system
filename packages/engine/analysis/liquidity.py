from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Liquidity Detection (Production Grade)
  Cartographie complete de la liquidite avec:
  - Asia/London/NY AM/NY PM session high/low tracking
  - Previous session high/low pour chaque session
  - NDOG (New Day Opening Gap) et NWOG (New Week Opening Gap)
  - Liquidity Void detection (zones sans stops)
  - Draw On Liquidity (DOL) — quel pool le marche vise
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("apex.liquidity")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTES — Horaires des sessions en heure NY (EST)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NY_OFFSET = -5

SESSIONS = {
    'ASIA':    {'start': 20, 'end': 0},    # 20:00 - 00:00 NY
    'LONDON':  {'start': 2, 'end': 5},     # 02:00 - 05:00 NY
    'NY_AM':   {'start': 8, 'end': 12},    # 08:00 - 12:00 NY
    'NY_PM':   {'start': 12, 'end': 16},   # 12:00 - 16:00 NY
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CARTOGRAPHIE PRINCIPALE DE LA LIQUIDITE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def map_liquidity(daily_candles: List[Dict], weekly_candles: List[Dict],
                  current_price: float,
                  session_data: Optional[List[Dict]] = None,
                  intraday_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
    """
    Cartographie complete de la liquidite Buy-Side (BSL) et Sell-Side (SSL).

    Niveaux mappes:
    - PDH/PDL (Previous Day High/Low)
    - PWH/PWL (Previous Week High/Low)
    - PMH/PML (Previous Month High/Low)
    - Session Highs/Lows (Asia, London, NY AM, NY PM)
    - NDOG (New Day Opening Gap)
    - NWOG (New Week Opening Gap)
    """
    try:
        bsl: List[Dict] = []  # Buy-Side Liquidity (au-dessus du prix)
        ssl: List[Dict] = []  # Sell-Side Liquidity (en-dessous du prix)

        # ━━━ PDH/PDL — Previous Day High/Low ━━━
        if len(daily_candles) >= 2:
            pdh = daily_candles[-2]['high']
            pdl = daily_candles[-2]['low']
            bsl.append({
                'level': pdh, 'type': 'PDH',
                'significance': 'HIGH',
                'swept': current_price > pdh,
                'description': 'Previous Day High — BSL majeur',
            })
            ssl.append({
                'level': pdl, 'type': 'PDL',
                'significance': 'HIGH',
                'swept': current_price < pdl,
                'description': 'Previous Day Low — SSL majeur',
            })

        # ━━━ PWH/PWL — Previous Week High/Low ━━━
        if len(weekly_candles) >= 2:
            pwh = weekly_candles[-2]['high']
            pwl = weekly_candles[-2]['low']
            bsl.append({
                'level': pwh, 'type': 'PWH',
                'significance': 'VERY_HIGH',
                'swept': current_price > pwh,
                'description': 'Previous Week High — Liquidite institutionnelle',
            })
            ssl.append({
                'level': pwl, 'type': 'PWL',
                'significance': 'VERY_HIGH',
                'swept': current_price < pwl,
                'description': 'Previous Week Low — Liquidite institutionnelle',
            })

        # ━━━ PMH/PML — Previous Month High/Low (approxime sur 22 jours de trading) ━━━
        if len(daily_candles) >= 25:
            month_candles = daily_candles[-25:-1]  # Exclure le jour courant
            pmh = max(c['high'] for c in month_candles)
            pml = min(c['low'] for c in month_candles)
            bsl.append({
                'level': pmh, 'type': 'PMH',
                'significance': 'EXTREME',
                'swept': current_price > pmh,
                'description': 'Previous Month High — Cible majeure',
            })
            ssl.append({
                'level': pml, 'type': 'PML',
                'significance': 'EXTREME',
                'swept': current_price < pml,
                'description': 'Previous Month Low — Cible majeure',
            })

        # ━━━ Session Highs/Lows depuis les donnees intraday ━━━
        if intraday_candles:
            session_levels = _extract_session_levels(intraday_candles)
            for sess_name, levels in session_levels.items():
                if levels.get('high') is not None:
                    bsl.append({
                        'level': levels['high'],
                        'type': f"{sess_name}_HIGH",
                        'significance': 'MEDIUM' if sess_name == 'ASIA' else 'HIGH',
                        'swept': current_price > levels['high'],
                        'description': f"{sess_name} Session High",
                    })
                if levels.get('low') is not None:
                    ssl.append({
                        'level': levels['low'],
                        'type': f"{sess_name}_LOW",
                        'significance': 'MEDIUM' if sess_name == 'ASIA' else 'HIGH',
                        'swept': current_price < levels['low'],
                        'description': f"{sess_name} Session Low",
                    })

                # Previous session levels
                if levels.get('prev_high') is not None:
                    bsl.append({
                        'level': levels['prev_high'],
                        'type': f"P{sess_name}_HIGH",
                        'significance': 'MEDIUM',
                        'swept': current_price > levels['prev_high'],
                        'description': f"Previous {sess_name} Session High",
                    })
                if levels.get('prev_low') is not None:
                    ssl.append({
                        'level': levels['prev_low'],
                        'type': f"P{sess_name}_LOW",
                        'significance': 'MEDIUM',
                        'swept': current_price < levels['prev_low'],
                        'description': f"Previous {sess_name} Session Low",
                    })

        # ━━━ Session data legacy (compatibilite) ━━━
        if session_data:
            for session in session_data:
                bsl.append({
                    'level': session['high'],
                    'type': f"P{session['name']}_HIGH",
                    'significance': 'MEDIUM',
                    'swept': current_price > session['high'],
                })
                ssl.append({
                    'level': session['low'],
                    'type': f"P{session['name']}_LOW",
                    'significance': 'MEDIUM',
                    'swept': current_price < session['low'],
                })

        # ━━━ NDOG & NWOG ━━━
        ndog = _calculate_ndog(daily_candles)
        nwog = _calculate_nwog(weekly_candles)

        if ndog:
            mid = (ndog['high'] + ndog['low']) / 2
            if ndog['high'] > current_price:
                bsl.append({
                    'level': ndog['high'], 'type': 'NDOG_HIGH',
                    'significance': 'HIGH', 'swept': False,
                    'description': 'NDOG — New Day Opening Gap High',
                })
            if ndog['low'] < current_price:
                ssl.append({
                    'level': ndog['low'], 'type': 'NDOG_LOW',
                    'significance': 'HIGH', 'swept': False,
                    'description': 'NDOG — New Day Opening Gap Low',
                })

        if nwog:
            if nwog['high'] > current_price:
                bsl.append({
                    'level': nwog['high'], 'type': 'NWOG_HIGH',
                    'significance': 'VERY_HIGH', 'swept': False,
                    'description': 'NWOG — New Week Opening Gap High',
                })
            if nwog['low'] < current_price:
                ssl.append({
                    'level': nwog['low'], 'type': 'NWOG_LOW',
                    'significance': 'VERY_HIGH', 'swept': False,
                    'description': 'NWOG — New Week Opening Gap Low',
                })

        # ━━━ Liquidity Voids ━━━
        voids = _detect_liquidity_voids(daily_candles, current_price)

        # ━━━ Draw On Liquidity (DOL) ━━━
        dol = _determine_draw_on_liquidity(bsl, ssl, current_price, daily_candles)

        # ━━━ Filtrage et tri ━━━
        bsl_above = sorted(
            [l for l in bsl if l['level'] > current_price],
            key=lambda x: x['level']
        )
        ssl_below = sorted(
            [l for l in ssl if l['level'] < current_price],
            key=lambda x: -x['level']
        )

        return {
            'buy_side_liquidity': bsl_above,
            'sell_side_liquidity': ssl_below,
            'nearest_bsl': bsl_above[0] if bsl_above else None,
            'nearest_ssl': ssl_below[0] if ssl_below else None,
            'recently_swept_bsl': [l for l in bsl if l.get('swept')],
            'recently_swept_ssl': [l for l in ssl if l.get('swept')],
            'ndog': ndog,
            'nwog': nwog,
            'liquidity_voids': voids,
            'draw_on_liquidity': dol,
            'total_bsl_levels': len(bsl_above),
            'total_ssl_levels': len(ssl_below),
        }

    except Exception as e:
        logger.error("Erreur map_liquidity: %s", e)
        return {
            'buy_side_liquidity': [], 'sell_side_liquidity': [],
            'nearest_bsl': None, 'nearest_ssl': None,
            'recently_swept_bsl': [], 'recently_swept_ssl': [],
            'ndog': None, 'nwog': None,
            'liquidity_voids': [], 'draw_on_liquidity': None,
            'total_bsl_levels': 0, 'total_ssl_levels': 0,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SESSION LEVELS — Extraction des highs/lows par session
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _extract_session_levels(candles: List[Dict]) -> Dict[str, Dict[str, Any]]:
    """
    Extrait les highs/lows de chaque session (Asia, London, NY AM, NY PM)
    depuis les bougies intraday.

    Retourne les niveaux actuels ET les niveaux de la session precedente.
    """
    try:
        sessions: Dict[str, Dict[str, Any]] = {}

        for sess_name, times in SESSIONS.items():
            current_high = None
            current_low = None
            prev_high = None
            prev_low = None

            # Candles de la session actuelle et precedente
            current_candles = []
            prev_candles = []

            for c in candles:
                ny_hour = _get_ny_hour(c['time'])
                if ny_hour is None:
                    continue

                s, e = times['start'], times['end']
                in_session = False
                if e < s:  # Session overnight (Asia)
                    in_session = ny_hour >= s or ny_hour < e
                else:
                    in_session = s <= ny_hour < e

                if in_session:
                    current_candles.append(c)

            # Separer en sessions actuelles et precedentes
            # (les dernieres bougies = session actuelle, les precedentes = session d'avant)
            if len(current_candles) >= 2:
                # Heuristique: si l'ecart de temps entre deux bougies consecutives
                # est > 4h, c'est une nouvelle session
                session_groups: List[List[Dict]] = [[current_candles[0]]]
                for i in range(1, len(current_candles)):
                    time_diff = current_candles[i]['time'] - current_candles[i - 1]['time']
                    if time_diff > 14400:  # 4h
                        session_groups.append([current_candles[i]])
                    else:
                        session_groups[-1].append(current_candles[i])

                if len(session_groups) >= 2:
                    prev_group = session_groups[-2]
                    curr_group = session_groups[-1]
                    prev_high = max(c['high'] for c in prev_group)
                    prev_low = min(c['low'] for c in prev_group)
                    current_high = max(c['high'] for c in curr_group)
                    current_low = min(c['low'] for c in curr_group)
                elif session_groups:
                    curr_group = session_groups[-1]
                    current_high = max(c['high'] for c in curr_group)
                    current_low = min(c['low'] for c in curr_group)

            sessions[sess_name] = {
                'high': current_high,
                'low': current_low,
                'prev_high': prev_high,
                'prev_low': prev_low,
            }

        return sessions

    except Exception:
        return {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NDOG — New Day Opening Gap (gap entre le close de la veille et l'open du jour)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _calculate_ndog(daily_candles: List[Dict]) -> Optional[Dict[str, Any]]:
    """
    NDOG = New Day Opening Gap.
    C'est le gap entre le close du jour precedent et l'open du jour actuel.
    Zone de fair value tres importante pour le daily bias.
    """
    try:
        if len(daily_candles) < 2:
            return None

        prev_close = daily_candles[-2]['close']
        today_open = daily_candles[-1]['open']

        if prev_close == today_open:
            return None

        high = max(prev_close, today_open)
        low = min(prev_close, today_open)
        mid = (high + low) / 2
        gap_size = high - low

        return {
            'type': 'NDOG',
            'high': round(high, 6),
            'low': round(low, 6),
            'mid': round(mid, 6),
            'gap_size': round(gap_size, 6),
            'direction': 'GAP_UP' if today_open > prev_close else 'GAP_DOWN',
            'filled': False,
            'description': 'New Day Opening Gap — Zone de fair value daily',
        }
    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NWOG — New Week Opening Gap
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _calculate_nwog(weekly_candles: List[Dict]) -> Optional[Dict[str, Any]]:
    """
    NWOG = New Week Opening Gap.
    Gap entre le close de la semaine precedente et l'open de la semaine actuelle.
    Zone de reference majeure pour le weekly bias.
    """
    try:
        if len(weekly_candles) < 2:
            return None

        prev_close = weekly_candles[-2]['close']
        this_open = weekly_candles[-1]['open']

        if prev_close == this_open:
            return None

        high = max(prev_close, this_open)
        low = min(prev_close, this_open)
        mid = (high + low) / 2

        return {
            'type': 'NWOG',
            'high': round(high, 6),
            'low': round(low, 6),
            'mid': round(mid, 6),
            'gap_size': round(high - low, 6),
            'direction': 'GAP_UP' if this_open > prev_close else 'GAP_DOWN',
            'filled': False,
            'description': 'New Week Opening Gap — Reference weekly',
        }
    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  LIQUIDITY VOIDS — Zones sans stops (mouvements impulsifs)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _detect_liquidity_voids(candles: List[Dict], current_price: float) -> List[Dict]:
    """
    Detecte les Liquidity Voids — zones ou le prix a traverse rapidement
    sans laisser de stops (gaps dans le volume/prix).
    Le marche tend a revenir remplir ces voids.
    """
    try:
        voids: List[Dict] = []
        if len(candles) < 3:
            return voids

        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]

            # Void haussier: gap entre le high precedent et le low actuel
            if curr['low'] > prev['high']:
                gap = curr['low'] - prev['high']
                avg_range = (prev['high'] - prev['low'] + curr['high'] - curr['low']) / 2
                if avg_range > 0 and gap > avg_range * 0.5:
                    voids.append({
                        'type': 'LIQUIDITY_VOID',
                        'direction': 'bullish',
                        'high': curr['low'],
                        'low': prev['high'],
                        'mid': (curr['low'] + prev['high']) / 2,
                        'size': gap,
                        'time': curr['time'],
                        'above_price': curr['low'] > current_price,
                    })

            # Void bearish
            if prev['low'] > curr['high']:
                gap = prev['low'] - curr['high']
                avg_range = (prev['high'] - prev['low'] + curr['high'] - curr['low']) / 2
                if avg_range > 0 and gap > avg_range * 0.5:
                    voids.append({
                        'type': 'LIQUIDITY_VOID',
                        'direction': 'bearish',
                        'high': prev['low'],
                        'low': curr['high'],
                        'mid': (prev['low'] + curr['high']) / 2,
                        'size': gap,
                        'time': curr['time'],
                        'above_price': prev['low'] > current_price,
                    })

        # Garder les 10 plus recents
        return voids[-10:]

    except Exception:
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DRAW ON LIQUIDITY (DOL) — Quel pool le marche vise?
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _determine_draw_on_liquidity(bsl: List[Dict], ssl: List[Dict],
                                  current_price: float,
                                  daily_candles: List[Dict]) -> Optional[Dict[str, Any]]:
    """
    Determine le DOL (Draw On Liquidity) — quel pool de liquidite
    le marche est en train de viser.

    Analyse basee sur:
    1. Direction de la structure recente (momentum)
    2. Proximite aux niveaux
    3. Importance des niveaux (significance)
    """
    try:
        if not daily_candles or len(daily_candles) < 3:
            return None

        # Direction du momentum recent (3 derniers jours)
        recent = daily_candles[-3:]
        momentum_up = recent[-1]['close'] > recent[0]['open']

        # Niveaux au-dessus
        bsl_above = [l for l in bsl if l['level'] > current_price]
        ssl_below = [l for l in ssl if l['level'] < current_price]

        if not bsl_above and not ssl_below:
            return None

        # Trouver le niveau le plus probable
        target = None
        if momentum_up and bsl_above:
            # Le marche monte -> vise la BSL la plus proche
            bsl_sorted = sorted(bsl_above, key=lambda x: x['level'])
            target = bsl_sorted[0]
            direction = 'BULLISH'
            distance = target['level'] - current_price
        elif not momentum_up and ssl_below:
            # Le marche descend -> vise la SSL la plus proche
            ssl_sorted = sorted(ssl_below, key=lambda x: -x['level'])
            target = ssl_sorted[0]
            direction = 'BEARISH'
            distance = current_price - target['level']
        elif bsl_above:
            target = sorted(bsl_above, key=lambda x: x['level'])[0]
            direction = 'BULLISH'
            distance = target['level'] - current_price
        elif ssl_below:
            target = sorted(ssl_below, key=lambda x: -x['level'])[0]
            direction = 'BEARISH'
            distance = current_price - target['level']

        if not target:
            return None

        return {
            'target_level': target['level'],
            'target_type': target['type'],
            'direction': direction,
            'distance': round(distance, 6),
            'significance': target.get('significance', 'MEDIUM'),
            'description': (
                f"DOL: Le marche vise {target['type']} a {target['level']:.5f} "
                f"({direction})"
            ),
        }

    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SWEEP DETECTION — Detection des sweeps de liquidite
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_liquidity_sweeps(candles: List[Dict],
                            liquidity_levels: List[Dict]) -> List[Dict]:
    """
    Detecte les sweeps de liquidite — quand le prix depasse brievement
    un niveau puis reverse (capture des stops).

    Un sweep = le wick depasse le niveau mais le BODY close en-deca.
    C'est le signal ICT classique de manipulation institutionnelle.
    """
    try:
        sweeps: List[Dict] = []

        for level in liquidity_levels:
            level_price = level.get('level', 0)
            level_type = level.get('type', '')
            is_bsl = (
                level_type.endswith('HIGH') or
                level_type in ('EQH', 'PWH', 'PMH', 'PDH', 'BSL',
                               'NDOG_HIGH', 'NWOG_HIGH') or
                level.get('liquidity_pool') == 'BSL'
            )

            for i, c in enumerate(candles):
                if is_bsl:
                    # BSL sweep: wick au-dessus mais close en-dessous
                    if c['high'] > level_price and c['close'] < level_price:
                        # Verifier que le close est significativement sous le niveau
                        body = abs(c['close'] - c['open'])
                        penetration = c['high'] - level_price

                        sweeps.append({
                            'type': 'SWEEP',
                            'level_type': level_type,
                            'level': level_price,
                            'sweep_high': c['high'],
                            'close_price': c['close'],
                            'penetration': round(penetration, 6),
                            'time': c['time'],
                            'candle_index': i,
                            'direction': 'bearish',
                            'significance': level.get('significance', 'MEDIUM'),
                            'body_confirmed': c['close'] < c['open'],
                            'description': f"Sweep {level_type} -> Reversal bearish",
                        })

                else:
                    # SSL sweep: wick en-dessous mais close au-dessus
                    if c['low'] < level_price and c['close'] > level_price:
                        penetration = level_price - c['low']

                        sweeps.append({
                            'type': 'SWEEP',
                            'level_type': level_type,
                            'level': level_price,
                            'sweep_low': c['low'],
                            'close_price': c['close'],
                            'penetration': round(penetration, 6),
                            'time': c['time'],
                            'candle_index': i,
                            'direction': 'bullish',
                            'significance': level.get('significance', 'MEDIUM'),
                            'body_confirmed': c['close'] > c['open'],
                            'description': f"Sweep {level_type} -> Reversal bullish",
                        })

        return sweeps

    except Exception as e:
        logger.error("Erreur detect_liquidity_sweeps: %s", e)
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UTILITAIRES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _get_ny_hour(timestamp: int) -> Optional[int]:
    """Retourne l'heure NY pour un timestamp."""
    try:
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        ny_dt = dt + timedelta(hours=NY_OFFSET)
        return ny_dt.hour
    except Exception:
        return None
