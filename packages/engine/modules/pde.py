from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 3: POI Detection Engine (PDE)
  Detection de tous les Points d'Interet avec:
  - Detection de stacking (OB + FVG overlap = super zone)
  - Tri par proximite configurable
  - Logique d'expiration (vieux POIs perdent de la valeur)
  - Tracking des retests
=============================================================================
"""

import time
import logging
from typing import Optional, List, Dict, Any

from analysis.fvg import detect_fvg, check_fvg_mitigation, detect_fvg_overlap
from analysis.orderblock import detect_order_blocks, check_ob_mitigation
from analysis.breaker import detect_breaker_blocks
from analysis.ifvg import detect_ifvg
from analysis.liquidity import map_liquidity, detect_liquidity_sweeps

logger = logging.getLogger("apex.pde")

# Age max d'un POI avant penalite (en secondes par TF)
POI_MAX_AGE: Dict[str, int] = {
    'M1': 1800, 'M5': 7200, 'M15': 28800,
    'H1': 86400, 'H4': 259200, 'D1': 1209600, 'W1': 5184000,
}


class POIDetectionEngine:
    """
    Module 3 — POI Detection Engine.
    Detecte et classe tous les Points d'Interet (OB, FVG, BB, IFVG).
    """

    def detect_all_pois(self, candles_map: Dict[str, List[Dict]],
                        structure_map: Dict,
                        daily_candles: List[Dict],
                        weekly_candles: List[Dict],
                        current_price: float,
                        instrument: str = 'EURUSD',
                        intraday_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """
        Detecte TOUS les POIs sur tous les timeframes disponibles.
        Inclut stacking detection, expiration, et tri par proximite.
        """
        try:
            all_fvgs: List[Dict] = []
            all_obs: List[Dict] = []
            all_bbs: List[Dict] = []
            all_ifvgs: List[Dict] = []
            stacked_zones: List[Dict] = []
            now = int(time.time())

            for tf, candles in candles_map.items():
                if not candles or tf in ('W1',):  # W1 trop large pour POIs d'entree
                    continue

                try:
                    # ━━━ FVGs ━━━
                    fvgs = detect_fvg(candles, tf, instrument)
                    for fvg in fvgs:
                        check_fvg_mitigation(fvg, candles)
                    active_fvgs = [f for f in fvgs if f.get('status') == 'ACTIVE']
                    # Appliquer expiration
                    active_fvgs = self._apply_expiration(active_fvgs, tf, now)
                    all_fvgs.extend(active_fvgs)

                    # ━━━ Order Blocks ━━━
                    structure = structure_map.get(tf, {})
                    breaks = structure.get('breaks', [])
                    swing_highs = structure.get('swing_highs', [])
                    swing_lows = structure.get('swing_lows', [])

                    obs = detect_order_blocks(
                        candles, breaks, tf, instrument,
                        swing_highs=swing_highs, swing_lows=swing_lows
                    )
                    for ob in obs:
                        check_ob_mitigation(ob, candles)
                    active_obs = [o for o in obs if o.get('status') == 'ACTIVE']
                    active_obs = self._apply_expiration(active_obs, tf, now)
                    all_obs.extend(active_obs)

                except Exception as e:
                    logger.warning("Erreur POI detection sur %s: %s", tf, e)
                    continue

            # ━━━ Liquidity Map ━━━
            liq_map = map_liquidity(
                daily_candles, weekly_candles, current_price,
                intraday_candles=intraday_candles
            )

            # ━━━ Breaker Blocks depuis les OB mitiges ━━━
            all_obs_for_bb = []
            for tf, candles in candles_map.items():
                if not candles or tf in ('W1',):
                    continue
                structure = structure_map.get(tf, {})
                breaks = structure.get('breaks', [])
                obs_all = detect_order_blocks(candles, breaks, tf, instrument)
                for ob in obs_all:
                    check_ob_mitigation(ob, candles)
                all_obs_for_bb.extend(obs_all)

            mitigated_obs = [o for o in all_obs_for_bb if o.get('mitigated') or o.get('invalidated')]
            all_liq = liq_map.get('buy_side_liquidity', []) + liq_map.get('sell_side_liquidity', [])

            # Sweeps
            sweeps: List[Dict] = []
            if daily_candles:
                sweeps = detect_liquidity_sweeps(daily_candles, all_liq)

            # Breaker blocks
            bbs = detect_breaker_blocks(mitigated_obs, sweeps, daily_candles)
            all_bbs.extend(bbs)

            # ━━━ FVG Stacking (overlap detection) ━━━
            stacked = detect_fvg_overlap(all_fvgs)
            stacked_zones.extend(stacked)

            # ━━━ POI Stacking Detection (OB + FVG overlap) ━━━
            super_zones = self._detect_poi_stacking(all_obs, all_fvgs, current_price)

            # ━━━ Combine all POIs ━━━
            all_pois: List[Dict] = []

            # Super zones d'abord (plus haute qualite)
            for sz in super_zones:
                all_pois.append(sz)

            # Puis les POIs individuels
            for fvg in all_fvgs[-25:]:
                all_pois.append(fvg)
            for ob in all_obs[-20:]:
                all_pois.append(ob)
            for bb in all_bbs[-10:]:
                all_pois.append(bb)

            # ━━━ Tri par proximite au prix actuel ━━━
            all_pois.sort(key=lambda p: abs(
                p.get('ce_50', p.get('mid', p.get('low', 0))) - current_price
            ))

            return {
                'pois': all_pois[:40],
                'fvgs': all_fvgs,
                'order_blocks': all_obs,
                'breaker_blocks': all_bbs,
                'ifvgs': all_ifvgs,
                'stacked_fvgs': stacked_zones,
                'super_zones': super_zones,
                'liquidity_map': liq_map,
                'sweeps': sweeps,
                'total_active_pois': len(all_pois),
            }

        except Exception as e:
            logger.error("Erreur detect_all_pois: %s", e)
            return {
                'pois': [], 'fvgs': [], 'order_blocks': [],
                'breaker_blocks': [], 'ifvgs': [], 'stacked_fvgs': [],
                'super_zones': [], 'liquidity_map': {},
                'sweeps': [], 'total_active_pois': 0,
            }

    # ━━━ POI STACKING — OB + FVG overlap = super zone ━━━

    def _detect_poi_stacking(self, obs: List[Dict], fvgs: List[Dict],
                             current_price: float) -> List[Dict]:
        """
        Detecte les super zones: OB + FVG qui se chevauchent.
        C'est le setup ICT le plus fort (OB avec FVG interne).
        """
        try:
            super_zones: List[Dict] = []

            for ob in obs:
                if ob.get('status') != 'ACTIVE':
                    continue
                for fvg in fvgs:
                    if fvg.get('status') != 'ACTIVE':
                        continue
                    if ob.get('direction') != fvg.get('direction'):
                        continue

                    # Verifier l'overlap
                    ob_high = ob.get('high', 0)
                    ob_low = ob.get('low', 0)
                    fvg_high = fvg.get('high', 0)
                    fvg_low = fvg.get('low', 0)

                    if ob_low <= fvg_high and fvg_low <= ob_high:
                        # Overlap detecte
                        zone_high = max(ob_high, fvg_high)
                        zone_low = min(ob_low, fvg_low)
                        combined_quality = min(100, (
                            ob.get('quality_score', 50) + fvg.get('quality_score', 50)
                        ) // 2 + 20)

                        super_zones.append({
                            'type': 'SUPER_ZONE',
                            'direction': ob['direction'],
                            'high': zone_high,
                            'low': zone_low,
                            'ce_50': (zone_high + zone_low) / 2,
                            'ob_timeframe': ob.get('timeframe', ''),
                            'fvg_timeframe': fvg.get('timeframe', ''),
                            'ob_quality': ob.get('quality_score', 50),
                            'fvg_quality': fvg.get('quality_score', 50),
                            'combined_quality': combined_quality,
                            'significance': 'EXTREME',
                            'description': (
                                f"SUPER ZONE: OB {ob.get('timeframe','')} + "
                                f"FVG {fvg.get('timeframe','')} {ob['direction']}"
                            ),
                            'status': 'ACTIVE',
                            'created_at': min(ob.get('created_at', 0), fvg.get('created_at', 0)),
                        })

            # Deduplicate par proximite
            return self._deduplicate_zones(super_zones)

        except Exception:
            return []

    def _deduplicate_zones(self, zones: List[Dict]) -> List[Dict]:
        """Deduplique les super zones trop proches."""
        try:
            if len(zones) <= 1:
                return zones

            result: List[Dict] = [zones[0]]
            for z in zones[1:]:
                is_dup = False
                for existing in result:
                    mid1 = (existing['high'] + existing['low']) / 2
                    mid2 = (z['high'] + z['low']) / 2
                    range1 = existing['high'] - existing['low']
                    if range1 > 0 and abs(mid1 - mid2) / range1 < 0.3:
                        is_dup = True
                        break
                if not is_dup:
                    result.append(z)

            return result
        except Exception:
            return zones

    # ━━━ EXPIRATION DES POIs ━━━

    def _apply_expiration(self, pois: List[Dict], timeframe: str,
                          now: int) -> List[Dict]:
        """
        Applique la logique d'expiration: les POIs trop vieux
        voient leur qualite reduite. Au-dela de 2x la duree max, ils sont retires.
        """
        try:
            max_age = POI_MAX_AGE.get(timeframe, 86400)
            result: List[Dict] = []

            for poi in pois:
                age = now - poi.get('created_at', now)
                if age > max_age * 2:
                    continue  # Trop vieux, on retire

                if age > max_age:
                    # Penalite d'age
                    penalty = min(0.5, (age - max_age) / max_age)
                    old_quality = poi.get('quality_score', 50)
                    poi['quality_score'] = max(10, int(old_quality * (1 - penalty)))
                    poi['expired'] = True
                else:
                    poi['expired'] = False

                result.append(poi)

            return result

        except Exception:
            return pois
