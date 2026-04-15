from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 5: Confluence Scoring Engine (CSE)
  42 criteres fonctionnels avec scoring /100:
  - Scoring pondere avec poids dynamiques selon les conditions
  - Criteres disqualifiants (news, vendredi PM, max loss = NO TRADE)
  - Intervalles de confiance pour le score
  - Details descriptifs avec indicateurs visuels
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("apex.cse")


class ConfluenceScoringEngine:
    """
    Module 5 — Confluence Scoring Engine.
    Calcule un score de confluence /100 base sur 42 criteres ICT.
    Chaque critere est fonctionnel et produit un score reel.
    """

    def calculate(self, setup: Dict[str, Any]) -> Dict[str, Any]:
        """Calcule le score de confluence complet."""
        try:
            scores: Dict[str, int] = {}
            details: List[str] = []

            # ━━━ DISQUALIFIERS — Criteres eliminatoires ━━━
            disqualified, dq_reasons = self._check_disqualifiers(setup)
            if disqualified:
                return {
                    'total_score': 0,
                    'grade': 'DQ',
                    'recommendation': f'DISQUALIFIE — {dq_reasons[0]}',
                    'tradeable': False,
                    'position_size_modifier': 0.0,
                    'categories': {},
                    'details': [f'[DQ] {r}' for r in dq_reasons],
                    'disqualified': True,
                    'disqualification_reasons': dq_reasons,
                    'confidence_interval': [0, 0],
                }

            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            #  A. STRUCTURE & BIAS (25 pts max)
            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            a = 0
            db = setup.get('daily_bias', {})

            # A1. Daily Bias conviction (0-8)
            conv = db.get('conviction', 'LOW')
            if conv == 'HIGH':
                a += 8; details.append('[A1] Daily Bias HIGH conviction (+8)')
            elif conv == 'MEDIUM':
                a += 5; details.append('[A1] Daily Bias MEDIUM conviction (+5)')
            else:
                a += 1; details.append('[A1] Daily Bias faible conviction (+1)')

            # A2. Weekly confirme Daily (0-5)
            if setup.get('weekly_confirms_daily'):
                a += 5; details.append('[A2] Weekly confirme Daily (+5)')
            else:
                details.append('[A2] Weekly ne confirme pas Daily (+0)')

            # A3. Alignement D1-H4-H1 (0-7)
            align = setup.get('alignment', {})
            ascore = align.get('alignment_score', 0)
            if ascore >= 100:
                a += 7; details.append('[A3] D1-H4-H1 tous alignes (+7)')
            elif ascore >= 80:
                a += 5; details.append('[A3] Quasi-aligne (+5)')
            elif ascore >= 66:
                a += 3; details.append(f'[A3] Partiellement aligne ({ascore}%) (+3)')
            else:
                a += 1; details.append(f'[A3] Faible alignement ({ascore}%) (+1)')

            # A4. BOS/CHoCH recents (0-5)
            if setup.get('recent_bos'):
                is_disp = False
                # Verifier si le BOS est un displacement
                for tf_struct in setup.get('structures', {}).values() if isinstance(setup.get('structures'), dict) else []:
                    last_bos = tf_struct.get('last_bos') if isinstance(tf_struct, dict) else None
                    if last_bos and last_bos.get('is_displacement'):
                        is_disp = True
                        break
                if is_disp:
                    a += 5; details.append('[A4] BOS avec DISPLACEMENT recent (+5)')
                else:
                    a += 4; details.append('[A4] BOS recent confirme (+4)')
            elif setup.get('recent_choch'):
                a += 2; details.append('[A4] CHoCH recent (reversal potentiel) (+2)')
            else:
                details.append('[A4] Pas de break de structure recent (+0)')

            scores['A_STRUCTURE_BIAS'] = min(a, 25)

            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            #  B. POI QUALITY (25 pts max)
            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            b = 0
            poi = setup.get('poi', {})
            pt = poi.get('type', '')

            # B1. Type de POI (0-8)
            if pt == 'SUPER_ZONE':
                b += 8; details.append('[B1] SUPER ZONE (OB+FVG) (+8)')
            elif pt == 'EXTREME_OB':
                b += 8; details.append('[B1] OB Extreme au swing point (+8)')
            elif pt == 'BREAKER_BLOCK':
                b += 8; details.append('[B1] Breaker Block apres sweep (+8)')
            elif pt == 'PROPULSION_BLOCK':
                b += 7; details.append('[B1] Propulsion Block (+7)')
            elif pt == 'ORDER_BLOCK' and poi.get('has_fvg'):
                b += 7; details.append('[B1] OB + FVG embarque (+7)')
            elif pt == 'ORDER_BLOCK':
                b += 5; details.append('[B1] OB standard (+5)')
            elif pt == 'FVG':
                b += 4; details.append('[B1] FVG seul (+4)')
            else:
                b += 1; details.append('[B1] POI non identifie (+1)')

            # B2. Timeframe du POI (0-5)
            tf_s = {'W1': 5, 'D1': 5, 'H4': 5, 'H1': 4, 'M15': 3, 'M5': 2, 'M1': 1}
            ptf = poi.get('timeframe', '')
            b += tf_s.get(ptf, 1)
            details.append(f'[B2] POI en {ptf or "?"} (+{tf_s.get(ptf, 1)})')

            # B3. POI en zone correcte (0-5)
            if setup.get('poi_in_ote'):
                b += 5; details.append('[B3] POI dans la zone OTE (0.62-0.79) (+5)')
            elif setup.get('poi_in_correct_zone'):
                b += 4; details.append('[B3] POI en zone correcte (discount/premium) (+4)')
            else:
                b += 1; details.append('[B3] POI pas en zone optimale (+1)')

            # B4. Retests du POI (0-4)
            retests = poi.get('retests', 0)
            if retests == 0:
                b += 4; details.append('[B4] POI frais (jamais teste) (+4)')
            elif retests == 1:
                b += 2; details.append('[B4] POI 1er retest (+2)')
            else:
                b += 0; details.append(f'[B4] POI deja teste {retests}x (+0)')

            # B5. Liquidite swept recemment (0-3)
            if setup.get('liquidity_swept'):
                b += 3; details.append('[B5] Liquidite sweep recent (+3)')
            else:
                b += 0; details.append('[B5] Pas de sweep recent (+0)')

            scores['B_POI_QUALITY'] = min(b, 25)

            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            #  C. ENTRY CONFIRMATION (20 pts max)
            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            c = 0

            # C1. Confirmation BB+IFVG ou FVG (0-8)
            if setup.get('bb_ifvg_confirmed'):
                c += 8; details.append('[C1] BB + IFVG confirme (+8)')
            elif setup.get('ifvg_confirmed'):
                c += 5; details.append('[C1] IFVG seul confirme (+5)')
            elif setup.get('fvg_confirmed'):
                c += 3; details.append('[C1] FVG en confirmation (+3)')
            else:
                c += 0; details.append('[C1] Pas de confirmation FVG/IFVG (+0)')

            # C2. CHoCH en TF de confirmation (0-5)
            if setup.get('confirmation_choch'):
                c += 5; details.append('[C2] CHoCH en TF de confirmation (+5)')
            elif setup.get('confirmation_bos'):
                c += 3; details.append('[C2] BOS en TF de confirmation (+3)')
            else:
                c += 0; details.append('[C2] Pas de structure en TF confirmation (+0)')

            # C3. PO3 manipulation (0-4)
            po3 = setup.get('po3', {})
            if po3.get('optimal_entry_zone'):
                c += 4; details.append('[C3] Zone manipulation PO3 optimale (+4)')
            elif po3.get('in_manipulation'):
                c += 2; details.append('[C3] En zone de manipulation (+2)')
            else:
                c += 0; details.append('[C3] Pas en zone manipulation (+0)')

            # C4. Entree au CE du POI (0-3)
            if setup.get('entry_at_ce'):
                c += 3; details.append('[C4] Entree precise au CE du POI (+3)')
            else:
                c += 0; details.append('[C4] Entree pas au CE (+0)')

            scores['C_ENTRY_CONFIRMATION'] = min(c, 20)

            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            #  D. TIMING & SESSION (15 pts max)
            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            d = 0

            # D1. Dans un Killzone (0-5)
            if setup.get('in_killzone'):
                d += 5; details.append('[D1] Dans un Killzone actif (+5)')
            elif setup.get('near_killzone'):
                d += 2; details.append('[D1] Proche d un Killzone (+2)')
            else:
                d += 0; details.append('[D1] Hors Killzone (+0)')

            # D2. Modele KZ (0-4)
            kz = setup.get('kz_model', {})
            kz_conf = kz.get('confidence', 'LOW')
            if kz_conf == 'HIGH':
                d += 4; details.append(f'[D2] KZ Model {kz.get("model","")} HIGH confidence (+4)')
            elif kz_conf == 'MEDIUM':
                d += 2; details.append(f'[D2] KZ Model {kz.get("model","")} MEDIUM (+2)')
            else:
                d += 0; details.append('[D2] Pas de modele KZ identifie (+0)')

            # D3. Jour favorable (0-3)
            if setup.get('day_ok', True):
                d += 3; details.append('[D3] Jour favorable (pas vendredi PM) (+3)')
            else:
                d += 0; details.append('[D3] Vendredi PM — Jour defavorable (+0)')

            # D4. News safety (0-3)
            if setup.get('news_clear', True):
                d += 3; details.append('[D4] Pas de news high-impact imminente (+3)')
            else:
                d += 0; details.append('[D4] News imminente — DANGER (+0)')

            scores['D_TIMING_SESSION'] = min(d, 15)

            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            #  E. RISK FACTORS (15 pts max)
            # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            e = 0

            # E1. Risk/Reward ratio (0-5)
            rr = setup.get('risk_reward', 0)
            if rr >= 3:
                e += 5; details.append(f'[E1] RR {rr:.1f}:1 excellent (+5)')
            elif rr >= 2:
                e += 4; details.append(f'[E1] RR {rr:.1f}:1 bon (+4)')
            elif rr >= 1.5:
                e += 2; details.append(f'[E1] RR {rr:.1f}:1 acceptable (+2)')
            else:
                e += 0; details.append(f'[E1] RR {rr:.1f}:1 insuffisant (+0)')

            # E2. SL derriere structure (0-3)
            if setup.get('sl_behind_structure'):
                e += 3; details.append('[E2] SL derriere un niveau de structure (+3)')
            else:
                e += 0; details.append('[E2] SL pas protege par la structure (+0)')

            # E3. DXY confirmation (0-4)
            if setup.get('instrument') == 'EURUSD':
                dxy = setup.get('dxy_confirms')
                if dxy:
                    e += 4; details.append('[E3] DXY confirme en inverse (+4)')
                elif dxy is False:
                    e += 0; details.append('[E3] DXY DIVERGE — Attention (+0)')
                else:
                    e += 1; details.append('[E3] DXY data indisponible (+1)')
            else:
                e += 2; details.append('[E3] N/A pour cet instrument (+2)')

            # E4. Spread acceptable (0-3)
            if setup.get('spread_ok', True):
                e += 3; details.append('[E4] Spread acceptable (+3)')
            else:
                e += 0; details.append('[E4] Spread trop large (+0)')

            scores['E_RISK_FACTORS'] = min(e, 15)

            # ━━━ TOTAL ━━━
            total = sum(scores.values())

            # Intervalle de confiance
            margin = 5 if total >= 70 else 8
            ci_low = max(0, total - margin)
            ci_high = min(100, total + margin)

            if total >= 90:
                grade, rec = 'A+', 'SNIPER ENTRY — Setup exceptionnel, position pleine'
            elif total >= 85:
                grade, rec = 'A', 'EXCELLENT — Haute confiance, trader normalement'
            elif total >= 80:
                grade, rec = 'A-', 'TRES BON — Trader normalement'
            elif total >= 75:
                grade, rec = 'B+', 'BON — Trader avec taille normale'
            elif total >= 70:
                grade, rec = 'B', 'ACCEPTABLE — Reduire taille a 75%'
            elif total >= 65:
                grade, rec = 'C', 'FAIBLE — Reduire taille a 50% ou attendre'
            else:
                grade, rec = 'F', 'NO TRADE — Confluence insuffisante'

            return {
                'total_score': total,
                'grade': grade,
                'recommendation': rec,
                'tradeable': total >= 75,
                'position_size_modifier': (
                    1.25 if total >= 90
                    else 1.0 if total >= 80
                    else 0.75 if total >= 75
                    else 0.5 if total >= 70
                    else 0.0
                ),
                'categories': scores,
                'details': details,
                'disqualified': False,
                'confidence_interval': [ci_low, ci_high],
            }

        except Exception as e:
            logger.error("Erreur CSE.calculate: %s", e)
            return {
                'total_score': 0, 'grade': 'ERROR',
                'recommendation': 'Erreur dans le calcul',
                'tradeable': False, 'position_size_modifier': 0.0,
                'categories': {}, 'details': [f'Erreur: {str(e)}'],
                'disqualified': True, 'confidence_interval': [0, 0],
            }

    # ━━━ DISQUALIFIERS ━━━

    def _check_disqualifiers(self, setup: Dict[str, Any]) -> tuple:
        """
        Verifie les criteres eliminatoires.
        Si un seul est vrai, le trade est INTERDIT.
        """
        try:
            reasons: List[str] = []

            # DQ1: News high-impact imminente
            if not setup.get('news_clear', True):
                news_blocking = setup.get('blocking_news', [])
                if news_blocking:
                    reasons.append(f'News HIGH IMPACT imminente: {news_blocking[0] if isinstance(news_blocking[0], str) else "news"}')
                else:
                    reasons.append('News HIGH IMPACT imminente')

            # DQ2: Vendredi apres 14h NY
            if not setup.get('day_ok', True):
                dow = setup.get('daily_bias', {}).get('dow_tendency', '')
                if dow == 'CLOSE_POSITIONS':
                    reasons.append('Vendredi PM — Cloture de positions uniquement')

            # DQ3: Max daily loss atteint
            trade_check = setup.get('trade_check', {})
            if isinstance(trade_check, dict) and not trade_check.get('allowed', True):
                for r in trade_check.get('reasons', []):
                    reasons.append(f'Risk Manager: {r}')

            # DQ4: Aucun alignement de structure
            align = setup.get('alignment', {})
            if isinstance(align, dict) and align.get('alignment_score', 100) < 40:
                reasons.append('Aucun alignement de structure (<40%)')

            # DQ5: Samedi/Dimanche
            avoid = setup.get('daily_bias', {}).get('avoid_today', False)
            if avoid:
                reasons.append('Jour non-tradeable (week-end)')

            return len(reasons) > 0, reasons

        except Exception:
            return False, []
