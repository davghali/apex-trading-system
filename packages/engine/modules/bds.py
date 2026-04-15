from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 2: Bias Determination System (BDS)
  Systeme de determination du biais avec 15+ facteurs:
  - Analyse du range Asia pour le daily bias
  - Midnight Open et NY Open tracking depuis les bougies
  - Detection du flux d'ordres institutionnel
  - Patterns Day-of-Week (Lundi accumulation, Mardi manipulation, etc.)
  - Scoring granulaire multi-facteurs
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from analysis.po3 import analyze_po3, get_ny_hour, detect_asian_range

logger = logging.getLogger("apex.bds")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DAY OF WEEK PATTERNS — Tendances ICT par jour
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DOW_TENDENCY: Dict[int, Dict[str, Any]] = {
    0: {'name': 'MONDAY',    'tendency': 'ACCUMULATION',
        'desc': 'Lundi: Le range de la semaine se forme. Identifier les extremes.',
        'trade_quality': 'MEDIUM', 'avoid': False},
    1: {'name': 'TUESDAY',   'tendency': 'MANIPULATION',
        'desc': 'Mardi: Jour de manipulation. Chercher le Judas Swing.',
        'trade_quality': 'HIGH', 'avoid': False},
    2: {'name': 'WEDNESDAY', 'tendency': 'DISTRIBUTION',
        'desc': 'Mercredi: Jour de distribution. Le vrai mouvement demarre.',
        'trade_quality': 'HIGHEST', 'avoid': False},
    3: {'name': 'THURSDAY',  'tendency': 'DISTRIBUTION_CONTINUE',
        'desc': 'Jeudi: Continuation. Les mouvements de mercredi se prolongent.',
        'trade_quality': 'HIGH', 'avoid': False},
    4: {'name': 'FRIDAY',    'tendency': 'CLOSE_POSITIONS',
        'desc': 'Vendredi: Cloture de positions. Eviter les nouveaux trades apres 12h.',
        'trade_quality': 'LOW', 'avoid': True},
    5: {'name': 'SATURDAY',  'tendency': 'NO_TRADE',
        'desc': 'Samedi: Marche ferme.', 'trade_quality': 'NONE', 'avoid': True},
    6: {'name': 'SUNDAY',    'tendency': 'NO_TRADE',
        'desc': 'Dimanche: Marche ferme.', 'trade_quality': 'NONE', 'avoid': True},
}


class BiasDeterminationSystem:
    """
    Module 2 — Bias Determination System.
    Determine le biais directionnel (bullish/bearish) avec scoring multi-facteurs.
    """

    def weekly_bias(self, weekly_candles: List[Dict],
                    current_price: float) -> Dict[str, Any]:
        """Determine le biais weekly avec 8+ facteurs."""
        try:
            if len(weekly_candles) < 3:
                return self._empty_bias()

            last_week = weekly_candles[-1]
            score_bull, score_bear = 0, 0
            factors: List[str] = []

            # ━━━ 1. Bougie weekly precedente (15 pts) ━━━
            if last_week['close'] > last_week['open']:
                score_bull += 15
                factors.append('W1: Bougie weekly precedente BULLISH (+15)')
            else:
                score_bear += 15
                factors.append('W1: Bougie weekly precedente BEARISH (+15)')

            # ━━━ 2. Premium/Discount weekly (10 pts) ━━━
            w_range = last_week['high'] - last_week['low']
            w_mid = last_week['low'] + w_range / 2 if w_range > 0 else last_week['close']
            if current_price > w_mid:
                score_bear += 10
                factors.append(f'W2: Prix en PREMIUM weekly (>{w_mid:.5f}) — vente favorisee (+10 bearish)')
            else:
                score_bull += 10
                factors.append(f'W2: Prix en DISCOUNT weekly (<{w_mid:.5f}) — achat favorise (+10 bullish)')

            # ━━━ 3. PWH/PWL sweep (20 pts) ━━━
            pwh, pwl = last_week['high'], last_week['low']
            if current_price > pwh:
                score_bear += 20
                factors.append(f'W3: PWH SWEPT ({pwh:.5f}) — BSL prise, retournement bearish (+20)')
            elif current_price < pwl:
                score_bull += 20
                factors.append(f'W3: PWL SWEPT ({pwl:.5f}) — SSL prise, retournement bullish (+20)')
            else:
                dist_to_pwh = abs(pwh - current_price)
                dist_to_pwl = abs(current_price - pwl)
                if dist_to_pwl < dist_to_pwh:
                    score_bear += 10
                    factors.append('W3: Plus proche du PWL — gravitation bearish (+10)')
                else:
                    score_bull += 10
                    factors.append('W3: Plus proche du PWH — gravitation bullish (+10)')

            # ━━━ 4. Structure weekly (25 pts) ━━━
            w_struct = self._analyze_structure(weekly_candles[-6:])
            if w_struct == 'bullish':
                score_bull += 25
                factors.append('W4: Structure W1 BULLISH (HH+HL) (+25)')
            elif w_struct == 'bearish':
                score_bear += 25
                factors.append('W4: Structure W1 BEARISH (LH+LL) (+25)')
            else:
                factors.append('W4: Structure W1 ranging (+0)')

            # ━━━ 5. Body ratio de la bougie weekly (10 pts) ━━━
            body = abs(last_week['close'] - last_week['open'])
            total = last_week['high'] - last_week['low']
            if total > 0 and body / total > 0.6:
                if last_week['close'] > last_week['open']:
                    score_bull += 10
                    factors.append(f'W5: Fort body bullish ({body/total:.0%}) (+10)')
                else:
                    score_bear += 10
                    factors.append(f'W5: Fort body bearish ({body/total:.0%}) (+10)')

            # ━━━ 6. 2 dernieres semaines (12 pts) ━━━
            if len(weekly_candles) >= 3:
                two_weeks_ago = weekly_candles[-3]
                if last_week['close'] > two_weeks_ago['close'] and last_week['close'] > last_week['open']:
                    score_bull += 12
                    factors.append('W6: Momentum haussier sur 2 semaines (+12)')
                elif last_week['close'] < two_weeks_ago['close'] and last_week['close'] < last_week['open']:
                    score_bear += 12
                    factors.append('W6: Momentum baissier sur 2 semaines (+12)')

            # ━━━ 7. NWOG direction (8 pts) ━━━
            if len(weekly_candles) >= 2:
                prev_close = weekly_candles[-2]['close']
                this_open = weekly_candles[-1]['open']
                if this_open > prev_close:
                    score_bull += 8
                    factors.append('W7: NWOG Gap Up — Momentum bullish (+8)')
                elif this_open < prev_close:
                    score_bear += 8
                    factors.append('W7: NWOG Gap Down — Momentum bearish (+8)')

            total_score = max(score_bull, score_bear)
            bias = 'BULLISH' if score_bull > score_bear else 'BEARISH'
            conviction = 'HIGH' if total_score >= 70 else ('MEDIUM' if total_score >= 50 else 'LOW')

            return {
                'bias': bias, 'score': total_score, 'conviction': conviction,
                'score_bullish': score_bull, 'score_bearish': score_bear,
                'factors': factors, 'pwh': pwh, 'pwl': pwl,
                'premium_discount': 'PREMIUM' if current_price > w_mid else 'DISCOUNT',
                'weekly_mid': round(w_mid, 6), 'tradeable': conviction in ('HIGH', 'MEDIUM'),
            }

        except Exception as e:
            logger.error("Erreur weekly_bias: %s", e)
            return self._empty_bias()

    def daily_bias(self, daily_candles: List[Dict], current_price: float,
                   weekly_bias: Dict, midnight_open: float,
                   daily_open: Optional[float] = None,
                   intraday_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Determine le biais daily avec 15+ facteurs."""
        try:
            if len(daily_candles) < 3:
                return self._empty_bias()

            yesterday = daily_candles[-2]
            score_bull, score_bear = 0, 0
            factors: List[str] = []

            pdh, pdl = yesterday['high'], yesterday['low']
            pd_range = pdh - pdl
            pd_mid = pdl + pd_range / 2 if pd_range > 0 else yesterday['close']

            # ━━━ 1. Structure D1 (15 pts) ━━━
            d_struct = self._analyze_structure(daily_candles[-10:])
            if d_struct == 'bullish':
                score_bull += 15
                factors.append('D1: Structure D1 BULLISH (+15)')
            elif d_struct == 'bearish':
                score_bear += 15
                factors.append('D1: Structure D1 BEARISH (+15)')

            # ━━━ 2. Prix vs PDH/PDL (10 pts) ━━━
            if current_price > pdh:
                score_bull += 10
                factors.append(f'D2: Prix > PDH ({pdh:.5f}) — Expansion bullish (+10)')
            elif current_price < pdl:
                score_bear += 10
                factors.append(f'D2: Prix < PDL ({pdl:.5f}) — Expansion bearish (+10)')
            elif current_price > pd_mid:
                score_bull += 5
                factors.append('D2: Prix > PD 50% (+5 bullish)')
            else:
                score_bear += 5
                factors.append('D2: Prix < PD 50% (+5 bearish)')

            # ━━━ 3. Midnight Open (12 pts) ━━━
            if current_price > midnight_open:
                score_bull += 12
                factors.append(f'D3: Prix > Midnight Open ({midnight_open:.5f}) (+12 bullish)')
            else:
                score_bear += 12
                factors.append(f'D3: Prix < Midnight Open ({midnight_open:.5f}) (+12 bearish)')

            # ━━━ 4. NY Open / Daily Open (8 pts) ━━━
            if daily_open is not None:
                if current_price > daily_open:
                    score_bull += 8
                    factors.append(f'D4: Prix > NY Open ({daily_open:.5f}) (+8 bullish)')
                else:
                    score_bear += 8
                    factors.append(f'D4: Prix < NY Open ({daily_open:.5f}) (+8 bearish)')

            # ━━━ 5. Premium/Discount D1 (8 pts) ━━━
            if pd_range > 0:
                fib_618 = pdl + pd_range * 0.618
                fib_382 = pdl + pd_range * 0.382
                if current_price > fib_618:
                    score_bear += 8
                    factors.append('D5: Prix en PREMIUM D1 (>0.618) — Vente favorisee (+8 bearish)')
                elif current_price < fib_382:
                    score_bull += 8
                    factors.append('D5: Prix en DISCOUNT D1 (<0.382) — Achat favorise (+8 bullish)')

            # ━━━ 6. Bougie D1 precedente (5 pts) ━━━
            if yesterday['close'] > yesterday['open']:
                score_bull += 5
                factors.append('D6: Bougie D1 precedente BULLISH (+5)')
            else:
                score_bear += 5
                factors.append('D6: Bougie D1 precedente BEARISH (+5)')

            # ━━━ 7. Alignement weekly (12 pts) ━━━
            wb = weekly_bias.get('bias', 'NEUTRAL')
            if wb == 'BULLISH':
                score_bull += 12
                factors.append('D7: Weekly bias BULLISH confirme (+12)')
            elif wb == 'BEARISH':
                score_bear += 12
                factors.append('D7: Weekly bias BEARISH confirme (+12)')

            # ━━━ 8. Day of Week patterns (10 pts) ━━━
            dow = datetime.now(timezone.utc).weekday()
            dow_info = DOW_TENDENCY.get(dow, DOW_TENDENCY[0])
            factors.append(f'D8: {dow_info["name"]} — {dow_info["desc"]}')
            if dow == 4:
                factors.append('VENDREDI: Eviter nouveaux trades apres 12h NY')
            # Mardi/Mercredi = jours de manipulation/distribution = haute probabilite
            if dow in (1, 2):
                factors.append(f'D8: {dow_info["name"]} — Jour de haute probabilite (+5)')
                if score_bull > score_bear:
                    score_bull += 5
                else:
                    score_bear += 5

            # ━━━ 9. Range Asia pour daily bias (10 pts) ━━━
            if intraday_candles:
                asia = detect_asian_range(intraday_candles)
                if asia.get('detected'):
                    asia_mid = asia.get('mid', current_price)
                    if current_price > asia_mid:
                        score_bull += 7
                        factors.append(f'D9: Prix > Asia Mid ({asia_mid:.5f}) (+7 bullish)')
                    else:
                        score_bear += 7
                        factors.append(f'D9: Prix < Asia Mid ({asia_mid:.5f}) (+7 bearish)')

                    # Sweep de l'Asia range
                    if current_price < asia.get('low', current_price):
                        score_bull += 3
                        factors.append('D9: Asia Low swept — Signal bullish (+3)')
                    elif current_price > asia.get('high', current_price):
                        score_bear += 3
                        factors.append('D9: Asia High swept — Signal bearish (+3)')

            # ━━━ 10. Institutional order flow (8 pts) ━━━
            iof = self._detect_institutional_flow(daily_candles[-5:])
            if iof == 'bullish':
                score_bull += 8
                factors.append('D10: Flux institutionnel BULLISH (accumulation) (+8)')
            elif iof == 'bearish':
                score_bear += 8
                factors.append('D10: Flux institutionnel BEARISH (distribution) (+8)')

            # ━━━ 11. 3-day momentum (7 pts) ━━━
            if len(daily_candles) >= 4:
                three_day_change = daily_candles[-1]['close'] - daily_candles[-4]['close']
                if three_day_change > 0:
                    score_bull += 7
                    factors.append('D11: Momentum 3 jours HAUSSIER (+7)')
                else:
                    score_bear += 7
                    factors.append('D11: Momentum 3 jours BAISSIER (+7)')

            # ━━━ 12. NDOG direction (6 pts) ━━━
            if len(daily_candles) >= 2:
                prev_close = daily_candles[-2]['close']
                today_open = daily_candles[-1]['open']
                if today_open > prev_close:
                    score_bull += 6
                    factors.append('D12: NDOG Gap Up (+6 bullish)')
                elif today_open < prev_close:
                    score_bear += 6
                    factors.append('D12: NDOG Gap Down (+6 bearish)')

            # ━━━ TOTAL ━━━
            total_score = max(score_bull, score_bear)
            bias = 'BULLISH' if score_bull > score_bear else ('BEARISH' if score_bear > score_bull else 'NEUTRAL')
            conviction = 'HIGH' if total_score >= 70 else ('MEDIUM' if total_score >= 50 else 'LOW')

            return {
                'bias': bias, 'score': total_score, 'conviction': conviction,
                'score_bullish': score_bull, 'score_bearish': score_bear,
                'factors': factors, 'pdh': pdh, 'pdl': pdl,
                'midnight_open': midnight_open, 'daily_open': daily_open,
                'premium_discount_zone': 'PREMIUM' if current_price > pd_mid else 'DISCOUNT',
                'tradeable': conviction in ('HIGH', 'MEDIUM'),
                'dow_tendency': dow_info.get('tendency', 'UNKNOWN'),
                'dow_trade_quality': dow_info.get('trade_quality', 'MEDIUM'),
                'avoid_today': dow_info.get('avoid', False),
            }

        except Exception as e:
            logger.error("Erreur daily_bias: %s", e)
            return self._empty_bias()

    def full_bias(self, weekly_candles: List[Dict], daily_candles: List[Dict],
                  current_price: float, midnight_open: float,
                  daily_open: Optional[float] = None,
                  intraday_candles: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Analyse complete du biais (weekly + daily + PO3)."""
        try:
            wb = self.weekly_bias(weekly_candles, current_price)
            db = self.daily_bias(daily_candles, current_price, wb, midnight_open,
                                daily_open, intraday_candles)
            po3 = analyze_po3(midnight_open, daily_open, current_price, db['bias'],
                              intraday_candles=intraday_candles)

            return {
                'weekly': wb,
                'daily': db,
                'po3': po3,
                'weekly_confirms_daily': wb['bias'] == db['bias'],
                'overall_bias': db['bias'] if wb['bias'] == db['bias'] else db['bias'],
                'overall_conviction': (
                    'HIGH' if wb['bias'] == db['bias'] and db['conviction'] == 'HIGH'
                    else db['conviction']
                ),
            }

        except Exception as e:
            logger.error("Erreur full_bias: %s", e)
            return {
                'weekly': self._empty_bias(), 'daily': self._empty_bias(),
                'po3': {}, 'weekly_confirms_daily': False,
                'overall_bias': 'NEUTRAL', 'overall_conviction': 'LOW',
            }

    # ━━━ DETECTION DU FLUX INSTITUTIONNEL ━━━

    def _detect_institutional_flow(self, candles: List[Dict]) -> str:
        """
        Detecte le flux d'ordres institutionnel sur les 5 derniers jours.
        Accumulation = bougies avec long wicks en bas (achat en discount)
        Distribution = bougies avec long wicks en haut (vente en premium)
        """
        try:
            if len(candles) < 3:
                return 'neutral'

            bullish_signals = 0
            bearish_signals = 0

            for c in candles:
                body = abs(c['close'] - c['open'])
                total = c['high'] - c['low']
                if total <= 0:
                    continue

                lower_wick = min(c['open'], c['close']) - c['low']
                upper_wick = c['high'] - max(c['open'], c['close'])

                # Rejet par le bas (accumulation institutionnelle)
                if lower_wick / total > 0.4 and body / total < 0.3:
                    bullish_signals += 1

                # Rejet par le haut (distribution institutionnelle)
                if upper_wick / total > 0.4 and body / total < 0.3:
                    bearish_signals += 1

                # Large body bullish
                if c['close'] > c['open'] and body / total > 0.7:
                    bullish_signals += 1

                # Large body bearish
                if c['close'] < c['open'] and body / total > 0.7:
                    bearish_signals += 1

            if bullish_signals > bearish_signals + 1:
                return 'bullish'
            elif bearish_signals > bullish_signals + 1:
                return 'bearish'
            return 'neutral'

        except Exception:
            return 'neutral'

    # ━━━ STRUCTURE ━━━

    def _analyze_structure(self, candles: List[Dict]) -> str:
        """Analyse la structure simple (HH/HL ou LH/LL)."""
        try:
            if len(candles) < 3:
                return 'ranging'
            highs = [c['high'] for c in candles]
            lows = [c['low'] for c in candles]
            hh = all(highs[i] > highs[i - 1] for i in range(-2, 0))
            hl = all(lows[i] > lows[i - 1] for i in range(-2, 0))
            lh = all(highs[i] < highs[i - 1] for i in range(-2, 0))
            ll = all(lows[i] < lows[i - 1] for i in range(-2, 0))
            if hh and hl:
                return 'bullish'
            if lh and ll:
                return 'bearish'
            return 'ranging'
        except Exception:
            return 'ranging'

    def _empty_bias(self) -> Dict[str, Any]:
        """Biais vide par defaut."""
        return {
            'bias': 'NEUTRAL', 'score': 0, 'conviction': 'LOW',
            'score_bullish': 0, 'score_bearish': 0, 'factors': ['Donnees insuffisantes'],
            'tradeable': False,
        }
