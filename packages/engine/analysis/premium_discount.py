from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Premium/Discount Zone (Production Grade)
  Identification des zones premium/discount avec:
  - Dealing Range detection (range actif)
  - Zones nested (macro range dans micro range)
  - OTE (Optimal Trade Entry) zone (0.62-0.79 fib)
  - Tracking de la zone courante du prix
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("apex.premium_discount")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CALCUL DES ZONES PREMIUM/DISCOUNT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def calculate_zones(high: float, low: float, current_price: float) -> Dict[str, Any]:
    """
    Calcule les zones premium/discount basees sur les niveaux Fibonacci.

    Zones ICT:
    - PREMIUM (au-dessus de 0.5) = zone de vente
    - DISCOUNT (en-dessous de 0.5) = zone d'achat
    - EQUILIBRIUM (0.5) = fair value

    OTE (Optimal Trade Entry) = zone 0.62 - 0.79
    C'est la zone IDEALE pour entrer dans la direction du biais.
    """
    try:
        range_size = high - low
        if range_size <= 0:
            return _empty_zones(current_price)

        equilibrium = low + (range_size * 0.5)

        fib_levels = {
            '0.0': low,
            '0.236': low + (range_size * 0.236),
            '0.382': low + (range_size * 0.382),
            '0.5': equilibrium,
            '0.618': low + (range_size * 0.618),
            '0.705': low + (range_size * 0.705),
            '0.786': low + (range_size * 0.786),
            '1.0': high,
            # Extensions pour TP
            '-0.272': low - (range_size * 0.272),
            '-0.618': low - (range_size * 0.618),
            '1.272': high + (range_size * 0.272),
            '1.618': high + (range_size * 0.618),
        }

        # ━━━ Zone actuelle ━━━
        if current_price > fib_levels['0.786']:
            zone = 'PREMIUM'
            zone_strength = 'EXTREME_PREMIUM'
        elif current_price > fib_levels['0.618']:
            zone = 'PREMIUM'
            zone_strength = 'DEEP_PREMIUM'
        elif current_price > fib_levels['0.5']:
            zone = 'PREMIUM'
            zone_strength = 'PREMIUM'
        elif current_price > fib_levels['0.382']:
            zone = 'EQUILIBRIUM'
            zone_strength = 'EQUILIBRIUM'
        elif current_price > fib_levels['0.236']:
            zone = 'DISCOUNT'
            zone_strength = 'DISCOUNT'
        else:
            zone = 'DISCOUNT'
            zone_strength = 'DEEP_DISCOUNT'

        # ━━━ OTE Zone (Optimal Trade Entry) ━━━
        ote_high = fib_levels['0.786']
        ote_low = fib_levels['0.618']
        in_ote_buy = ote_low >= current_price >= fib_levels['0.618'] and current_price <= ote_high
        in_ote_sell = fib_levels['0.618'] <= current_price <= fib_levels['0.786']

        # Position precise dans la zone OTE
        ote = {
            'high': round(ote_high, 6),
            'low': round(ote_low, 6),
            'mid': round((ote_high + ote_low) / 2, 6),
            'price_in_ote_discount': zone == 'DISCOUNT' and current_price >= fib_levels['0.618'] * (low / high) if high > 0 else False,
            'price_in_ote_premium': zone == 'PREMIUM' and fib_levels['0.618'] <= current_price <= fib_levels['0.786'],
        }

        # ━━━ Distance au 50% ━━━
        distance_to_eq = abs(current_price - equilibrium)
        distance_to_eq_pct = (distance_to_eq / range_size * 100) if range_size > 0 else 0

        return {
            'zone': zone,
            'zone_strength': zone_strength,
            'equilibrium': round(equilibrium, 6),
            'fib_levels': {k: round(v, 6) for k, v in fib_levels.items()},
            'ote': ote,
            'is_premium': current_price > equilibrium,
            'is_discount': current_price < equilibrium,
            'distance_to_eq': round(distance_to_eq, 6),
            'distance_to_eq_pct': round(distance_to_eq_pct, 1),
            'range_high': round(high, 6),
            'range_low': round(low, 6),
            'range_size': round(range_size, 6),
            'current_fib_position': round((current_price - low) / range_size, 4) if range_size > 0 else 0.5,
        }

    except Exception as e:
        logger.error("Erreur calculate_zones: %s", e)
        return _empty_zones(current_price)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DEALING RANGE — Le range actif actuellement trade
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_dealing_range(candles: List[Dict], swing_highs: List[Dict],
                         swing_lows: List[Dict], current_price: float) -> Dict[str, Any]:
    """
    Detecte le Dealing Range — le range dans lequel le prix evolue actuellement.

    Le Dealing Range est defini par le dernier swing high et swing low
    non-casses. C'est le range "actif" que les institutions tradent.
    """
    try:
        if not swing_highs or not swing_lows:
            return _empty_dealing_range(current_price)

        # Trouver le high et low non-casses les plus pertinents
        active_high = None
        active_low = None

        for sh in reversed(swing_highs):
            if not sh.get('broken', False):
                if active_high is None or sh['price'] > active_high['price']:
                    active_high = sh
                break  # Prendre le plus recent non-casse

        for sl in reversed(swing_lows):
            if not sl.get('broken', False):
                if active_low is None or sl['price'] < active_low['price']:
                    active_low = sl
                break

        if not active_high or not active_low:
            # Fallback sur les derniers swings
            if swing_highs:
                active_high = swing_highs[-1]
            if swing_lows:
                active_low = swing_lows[-1]

        if not active_high or not active_low:
            return _empty_dealing_range(current_price)

        range_high = active_high['price']
        range_low = active_low['price']

        # Calculer les zones dans le dealing range
        zones = calculate_zones(range_high, range_low, current_price)

        return {
            'detected': True,
            'high': round(range_high, 6),
            'low': round(range_low, 6),
            'equilibrium': zones['equilibrium'],
            'current_zone': zones['zone'],
            'current_zone_strength': zones['zone_strength'],
            'ote': zones['ote'],
            'fib_levels': zones['fib_levels'],
            'price_position': zones['current_fib_position'],
            'description': (
                f"Dealing Range: {range_low:.5f} - {range_high:.5f} | "
                f"Prix en {zones['zone']} ({zones['zone_strength']})"
            ),
        }

    except Exception as e:
        logger.error("Erreur detect_dealing_range: %s", e)
        return _empty_dealing_range(current_price)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ZONES NESTED — Range macro dans micro
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def calculate_nested_zones(macro_high: float, macro_low: float,
                           micro_high: float, micro_low: float,
                           current_price: float) -> Dict[str, Any]:
    """
    Calcule les zones nested (imbriqueees).

    Le macro range (D1/H4) donne la direction.
    Le micro range (M15/M5) donne le timing d'entree.

    La meilleure entree = discount dans le micro ET dans le macro
    pour un trade bullish (ou premium dans les deux pour bearish).
    """
    try:
        macro_zones = calculate_zones(macro_high, macro_low, current_price)
        micro_zones = calculate_zones(micro_high, micro_low, current_price)

        # Alignement des zones
        both_discount = macro_zones['is_discount'] and micro_zones['is_discount']
        both_premium = macro_zones['is_premium'] and micro_zones['is_premium']
        aligned = both_discount or both_premium

        # Recommandation
        if both_discount:
            recommendation = 'STRONG BUY ZONE — Discount dans macro ET micro'
            entry_quality = 'EXCELLENT'
        elif both_premium:
            recommendation = 'STRONG SELL ZONE — Premium dans macro ET micro'
            entry_quality = 'EXCELLENT'
        elif macro_zones['is_discount'] and micro_zones['is_premium']:
            recommendation = 'ATTENDRE — Discount macro mais premium micro'
            entry_quality = 'WAIT'
        elif macro_zones['is_premium'] and micro_zones['is_discount']:
            recommendation = 'ATTENDRE — Premium macro mais discount micro'
            entry_quality = 'WAIT'
        else:
            recommendation = 'NEUTRE — Equilibrium'
            entry_quality = 'NEUTRAL'

        return {
            'macro': {
                'zone': macro_zones['zone'],
                'strength': macro_zones['zone_strength'],
                'equilibrium': macro_zones['equilibrium'],
                'fib_position': macro_zones['current_fib_position'],
            },
            'micro': {
                'zone': micro_zones['zone'],
                'strength': micro_zones['zone_strength'],
                'equilibrium': micro_zones['equilibrium'],
                'fib_position': micro_zones['current_fib_position'],
            },
            'aligned': aligned,
            'entry_quality': entry_quality,
            'recommendation': recommendation,
        }

    except Exception as e:
        logger.error("Erreur calculate_nested_zones: %s", e)
        return {
            'macro': {'zone': 'NEUTRAL', 'strength': 'EQUILIBRIUM'},
            'micro': {'zone': 'NEUTRAL', 'strength': 'EQUILIBRIUM'},
            'aligned': False, 'entry_quality': 'NEUTRAL',
            'recommendation': 'ERREUR dans le calcul',
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  VERIFICATION — POI dans la bonne zone
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def is_poi_in_correct_zone(poi_direction: str, poi_mid: float,
                           high: float, low: float) -> bool:
    """
    Verifie si un POI est dans la zone correcte:
    - POI bullish doit etre en DISCOUNT (en-dessous du 50%)
    - POI bearish doit etre en PREMIUM (au-dessus du 50%)

    C'est une regle ICT fondamentale:
    on achete en discount, on vend en premium.
    """
    try:
        if high <= low:
            return False
        eq = low + (high - low) * 0.5
        if poi_direction.lower() == 'bullish':
            return poi_mid < eq
        elif poi_direction.lower() == 'bearish':
            return poi_mid > eq
        return False
    except Exception:
        return False


def is_poi_in_ote(poi_direction: str, poi_mid: float,
                  high: float, low: float) -> bool:
    """
    Verifie si un POI est dans la zone OTE (Optimal Trade Entry).
    OTE = 0.618 - 0.786 du range
    """
    try:
        if high <= low:
            return False
        range_size = high - low
        ote_618 = low + range_size * 0.618
        ote_786 = low + range_size * 0.786

        if poi_direction.lower() == 'bullish':
            # OTE d'achat = 0.618 - 0.786 mesure depuis le haut (inverse)
            ote_buy_high = high - range_size * 0.618
            ote_buy_low = high - range_size * 0.786
            return ote_buy_low <= poi_mid <= ote_buy_high
        elif poi_direction.lower() == 'bearish':
            return ote_618 <= poi_mid <= ote_786
        return False
    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UTILITAIRES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _empty_zones(current_price: float) -> Dict[str, Any]:
    """Retourne un resultat vide pour les zones."""
    return {
        'zone': 'NEUTRAL',
        'zone_strength': 'EQUILIBRIUM',
        'equilibrium': current_price,
        'fib_levels': {},
        'ote': {'high': 0, 'low': 0, 'mid': 0},
        'is_premium': False,
        'is_discount': False,
        'distance_to_eq': 0,
        'distance_to_eq_pct': 0,
        'range_high': current_price,
        'range_low': current_price,
        'range_size': 0,
        'current_fib_position': 0.5,
    }


def _empty_dealing_range(current_price: float) -> Dict[str, Any]:
    """Retourne un dealing range vide."""
    return {
        'detected': False,
        'high': current_price,
        'low': current_price,
        'equilibrium': current_price,
        'current_zone': 'NEUTRAL',
        'current_zone_strength': 'EQUILIBRIUM',
        'ote': {'high': 0, 'low': 0, 'mid': 0},
        'fib_levels': {},
        'price_position': 0.5,
        'description': 'Dealing Range non detecte',
    }
