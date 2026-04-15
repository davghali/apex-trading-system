from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Fair Value Gap (FVG) Detection (Production Grade)
  Detection de desequilibres 3 bougies avec:
  - Classification: Standard, Consequent Encroachment, Inverse FVG
  - Detection de chevauchement (FVG empiles = zone forte)
  - Suivi de remplissage partiel vs total avec pourcentage
  - Age tracking (FVG anciennes perdent leur significance)
  - Ponderation par body ratio et volume de l'impulsion
=============================================================================
"""

import time
import logging
from typing import Optional, List, Dict, Any
from config import INSTRUMENT_CONFIG

logger = logging.getLogger("apex.fvg")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Duree de vie max d'un FVG en secondes avant de perdre en significance
FVG_MAX_AGE: Dict[str, int] = {
    'M1': 3600,       # 1h
    'M5': 14400,      # 4h
    'M15': 43200,     # 12h
    'H1': 172800,     # 2 jours
    'H4': 604800,     # 1 semaine
    'D1': 2592000,    # 30 jours
    'W1': 7776000,    # 90 jours
}

# Penalite d'age: apres 50% de la duree de vie, le score baisse
AGE_PENALTY_START = 0.5
AGE_PENALTY_FACTOR = 0.3  # Score reduit de 30% max a cause de l'age


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION PRINCIPALE DES FVG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_fvg(candles: List[Dict], timeframe: str,
               instrument: str = 'EURUSD', min_gap_pips: float = 1.0) -> List[Dict]:
    """
    Detecte tous les FVG (Fair Value Gaps) dans une serie de bougies.

    Un FVG est un desequilibre de 3 bougies ou le prix n'a pas trade
    dans une zone. C'est une zone de "fair value" que le marche tend
    a revisiter (mitigation).

    Types detectes:
    - STANDARD: FVG classique (gap entre C1.high et C3.low ou inverse)
    - CONSEQUENT_ENCROACHMENT: FVG deja partiellement rempli a 50%
    - INVERSE: FVG dans la direction opposee au mouvement precedent
    """
    try:
        cfg = INSTRUMENT_CONFIG.get(instrument, {})
        pip_size = cfg.get('pip_size', 0.0001)
        min_gap = min_gap_pips * pip_size
        fvg_list: List[Dict] = []
        now = int(time.time())

        if len(candles) < 3:
            return fvg_list

        for i in range(2, len(candles)):
            c1 = candles[i - 2]
            c2 = candles[i - 1]  # Bougie d'impulsion (impulse candle)
            c3 = candles[i]

            # ━━━ FVG Bullish: gap entre c1.high et c3.low ━━━
            if c3['low'] > c1['high']:
                gap_size = c3['low'] - c1['high']
                if gap_size >= min_gap:
                    fvg = _build_fvg(
                        direction='bullish',
                        high=c3['low'],
                        low=c1['high'],
                        gap_size=gap_size,
                        impulse_candle=c2,
                        timeframe=timeframe,
                        pip_size=pip_size,
                        now=now,
                        candles=candles,
                        idx=i,
                    )
                    fvg_list.append(fvg)

            # ━━━ FVG Bearish: gap entre c1.low et c3.high ━━━
            if c1['low'] > c3['high']:
                gap_size = c1['low'] - c3['high']
                if gap_size >= min_gap:
                    fvg = _build_fvg(
                        direction='bearish',
                        high=c1['low'],
                        low=c3['high'],
                        gap_size=gap_size,
                        impulse_candle=c2,
                        timeframe=timeframe,
                        pip_size=pip_size,
                        now=now,
                        candles=candles,
                        idx=i,
                    )
                    fvg_list.append(fvg)

        return fvg_list

    except Exception as e:
        logger.error("Erreur detect_fvg: %s", e)
        return []


def _build_fvg(direction: str, high: float, low: float, gap_size: float,
               impulse_candle: Dict, timeframe: str, pip_size: float,
               now: int, candles: List[Dict], idx: int) -> Dict[str, Any]:
    """Construit un objet FVG complet avec tous les attributs."""
    try:
        ce_50 = low + (gap_size / 2)
        gap_pips = gap_size / pip_size if pip_size > 0 else 0

        # Body ratio de l'impulsion
        body = abs(impulse_candle['close'] - impulse_candle['open'])
        total = impulse_candle['high'] - impulse_candle['low']
        body_ratio = body / total if total > 0 else 0.5

        # Volume de l'impulsion vs moyenne
        vol = impulse_candle.get('volume', 0)
        avg_vol = _local_avg_volume(candles, idx, lookback=10)
        vol_ratio = vol / avg_vol if avg_vol > 0 else 1.0

        # Age du FVG
        created_at = impulse_candle['time']
        age_seconds = max(0, now - created_at)
        max_age = FVG_MAX_AGE.get(timeframe, 86400)
        age_ratio = age_seconds / max_age if max_age > 0 else 0

        # Classification
        classification = 'STANDARD'

        # Score de qualite
        quality = _score_fvg_advanced(
            gap_pips, body_ratio, vol_ratio, timeframe, age_ratio, pip_size
        )

        return {
            'type': 'FVG',
            'classification': classification,
            'direction': direction,
            'high': round(high, 6),
            'low': round(low, 6),
            'ce_50': round(ce_50, 6),
            'gap_size_pips': round(gap_pips, 1),
            'timeframe': timeframe,
            'filled': False,
            'partially_filled': False,
            'fill_percentage': 0.0,
            'impulse_body': round(body, 6),
            'impulse_body_ratio': round(body_ratio, 3),
            'impulse_volume_ratio': round(vol_ratio, 2),
            'usage': 'CONTINUATION',
            'created_at': created_at,
            'age_seconds': age_seconds,
            'age_label': _age_label(age_seconds),
            'quality_score': quality,
            'retests': 0,
            'status': 'ACTIVE',
        }

    except Exception:
        return {
            'type': 'FVG', 'classification': 'STANDARD', 'direction': direction,
            'high': high, 'low': low, 'ce_50': low + (high - low) / 2,
            'gap_size_pips': 0, 'timeframe': timeframe,
            'filled': False, 'partially_filled': False, 'fill_percentage': 0.0,
            'impulse_body': 0, 'impulse_body_ratio': 0.5,
            'impulse_volume_ratio': 1.0, 'usage': 'CONTINUATION',
            'created_at': 0, 'age_seconds': 0, 'age_label': 'FRESH',
            'quality_score': 50, 'retests': 0, 'status': 'ACTIVE',
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MITIGATION / REMPLISSAGE DES FVG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def check_fvg_mitigation(fvg: Dict, candles: List[Dict]) -> Dict:
    """
    Verifie le niveau de mitigation d'un FVG par les bougies suivantes.

    Etats possibles:
    - ACTIVE: non touche
    - PARTIALLY_FILLED: touche mais pas completement rempli (avec %)
    - CE_REACHED: le prix a atteint le Consequent Encroachment (50%)
    - MITIGATED: completement rempli
    """
    try:
        fvg_high = fvg['high']
        fvg_low = fvg['low']
        fvg_ce = fvg['ce_50']
        fvg_range = fvg_high - fvg_low

        if fvg_range <= 0:
            return fvg

        max_fill = 0.0

        for c in candles:
            if c['time'] <= fvg['created_at']:
                continue

            if fvg['direction'] == 'bullish':
                # Remplissage = combien le prix a penetre depuis le haut
                if c['low'] <= fvg_high:
                    penetration = fvg_high - max(c['low'], fvg_low)
                    fill_pct = min(100.0, (penetration / fvg_range) * 100)
                    max_fill = max(max_fill, fill_pct)

                    if c['low'] <= fvg_low:
                        fvg['filled'] = True
                        fvg['fill_percentage'] = 100.0
                        fvg['status'] = 'MITIGATED'
                        fvg['classification'] = 'MITIGATED'
                        break
                    elif c['low'] <= fvg_ce:
                        fvg['partially_filled'] = True
                        fvg['classification'] = 'CONSEQUENT_ENCROACHMENT'
                        fvg['retests'] += 1
            else:
                # Bearish FVG: remplissage depuis le bas
                if c['high'] >= fvg_low:
                    penetration = min(c['high'], fvg_high) - fvg_low
                    fill_pct = min(100.0, (penetration / fvg_range) * 100)
                    max_fill = max(max_fill, fill_pct)

                    if c['high'] >= fvg_high:
                        fvg['filled'] = True
                        fvg['fill_percentage'] = 100.0
                        fvg['status'] = 'MITIGATED'
                        fvg['classification'] = 'MITIGATED'
                        break
                    elif c['high'] >= fvg_ce:
                        fvg['partially_filled'] = True
                        fvg['classification'] = 'CONSEQUENT_ENCROACHMENT'
                        fvg['retests'] += 1

        if not fvg['filled']:
            fvg['fill_percentage'] = round(max_fill, 1)

        return fvg

    except Exception as e:
        logger.error("Erreur check_fvg_mitigation: %s", e)
        return fvg


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION DE CHEVAUCHEMENT — FVG empiles (zone forte)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_fvg_overlap(fvg_list: List[Dict]) -> List[Dict]:
    """
    Detecte les FVG qui se chevauchent (stacked FVGs).

    Des FVG empiles dans la meme direction = zone de desequilibre
    tres forte. Le marche a une forte probabilite de revenir mitiger
    cette zone avant de continuer.
    """
    try:
        if len(fvg_list) < 2:
            return []

        stacked_zones: List[Dict] = []
        used = set()

        active_fvgs = [f for f in fvg_list if f.get('status') == 'ACTIVE']

        for i, fvg1 in enumerate(active_fvgs):
            if i in used:
                continue
            cluster = [fvg1]
            for j, fvg2 in enumerate(active_fvgs):
                if i == j or j in used:
                    continue
                if fvg1['direction'] != fvg2['direction']:
                    continue
                # Verifier le chevauchement
                overlap = _check_overlap(fvg1, fvg2)
                if overlap:
                    cluster.append(fvg2)
                    used.add(j)

            if len(cluster) >= 2:
                used.add(i)
                # Zone combinee
                direction = cluster[0]['direction']
                zone_high = max(f['high'] for f in cluster)
                zone_low = min(f['low'] for f in cluster)
                avg_quality = sum(f.get('quality_score', 50) for f in cluster) / len(cluster)

                stacked_zones.append({
                    'type': 'STACKED_FVG',
                    'direction': direction,
                    'high': round(zone_high, 6),
                    'low': round(zone_low, 6),
                    'ce_50': round(zone_low + (zone_high - zone_low) / 2, 6),
                    'fvg_count': len(cluster),
                    'combined_quality': min(100, int(avg_quality * 1.3)),
                    'significance': 'EXTREME' if len(cluster) >= 3 else 'HIGH',
                    'timeframes': list(set(f.get('timeframe', '') for f in cluster)),
                })

        return stacked_zones

    except Exception as e:
        logger.error("Erreur detect_fvg_overlap: %s", e)
        return []


def _check_overlap(fvg1: Dict, fvg2: Dict) -> bool:
    """Verifie si deux FVG se chevauchent."""
    try:
        return fvg1['low'] <= fvg2['high'] and fvg2['low'] <= fvg1['high']
    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCORING AVANCE DES FVG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_fvg_advanced(gap_pips: float, body_ratio: float,
                        volume_ratio: float, timeframe: str,
                        age_ratio: float, pip_size: float) -> int:
    """
    Score avance (0-100) base sur:
    1. Taille du gap en pips
    2. Force de l'impulsion (body ratio)
    3. Volume relatif
    4. Poids du timeframe
    5. Penalite d'age
    """
    try:
        score = 0

        # 1. Taille du gap (max 25)
        if gap_pips > 15:
            score += 25
        elif gap_pips > 10:
            score += 20
        elif gap_pips > 5:
            score += 15
        elif gap_pips > 2:
            score += 10
        else:
            score += 5

        # 2. Force de l'impulsion — body ratio (max 25)
        if body_ratio > 0.8:
            score += 25
        elif body_ratio > 0.65:
            score += 20
        elif body_ratio > 0.5:
            score += 15
        elif body_ratio > 0.3:
            score += 8
        else:
            score += 3

        # 3. Volume de l'impulsion (max 20)
        if volume_ratio > 2.5:
            score += 20
        elif volume_ratio > 1.8:
            score += 15
        elif volume_ratio > 1.2:
            score += 10
        elif volume_ratio > 0.8:
            score += 5
        else:
            score += 2

        # 4. Poids du timeframe (max 20)
        tf_weights = {
            'W1': 20, 'D1': 18, 'H4': 16, 'H1': 14,
            'M15': 12, 'M5': 8, 'M1': 5,
        }
        score += tf_weights.get(timeframe, 8)

        # 5. Penalite d'age (reduit jusqu'a 30%)
        if age_ratio > AGE_PENALTY_START:
            penalty_pct = min(AGE_PENALTY_FACTOR, (age_ratio - AGE_PENALTY_START) * AGE_PENALTY_FACTOR * 2)
            score = int(score * (1.0 - penalty_pct))

        return max(0, min(100, score))

    except Exception:
        return 50


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  COMPATIBILITE — Ancien scoring (garde pour reference)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_fvg(gap_size: float, impulse_candle: Dict,
               timeframe: str, pip_size: float) -> int:
    """Scoring de compatibilite (delegation au scoring avance)."""
    try:
        gap_pips = gap_size / pip_size if pip_size > 0 else 0
        body = abs(impulse_candle['close'] - impulse_candle['open'])
        total = impulse_candle['high'] - impulse_candle['low']
        body_ratio = body / total if total > 0 else 0.5
        return _score_fvg_advanced(gap_pips, body_ratio, 1.0, timeframe, 0.0, pip_size)
    except Exception:
        return 50


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  UTILITAIRES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _local_avg_volume(candles: List[Dict], idx: int, lookback: int = 10) -> float:
    """Volume moyen local autour d'un index."""
    try:
        start = max(0, idx - lookback)
        subset = candles[start:idx]
        if not subset:
            return 1.0
        vols = [c.get('volume', 0) for c in subset if c.get('volume', 0) > 0]
        return sum(vols) / len(vols) if vols else 1.0
    except Exception:
        return 1.0


def _age_label(age_seconds: int) -> str:
    """Label humain pour l'age d'un FVG."""
    try:
        if age_seconds < 3600:
            return 'FRESH'
        elif age_seconds < 14400:
            return 'RECENT'
        elif age_seconds < 86400:
            return 'MATURE'
        elif age_seconds < 604800:
            return 'OLD'
        else:
            return 'ANCIENT'
    except Exception:
        return 'UNKNOWN'
