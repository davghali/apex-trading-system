from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 6: Entry Optimizer (EO)
  Optimiseur d'entree avec:
  - Calcul precis du prix d'entree avec refinement CE
  - Niveaux TP multiples (TP1 a 1:1, TP2 a 2:1, TP3 a 3:1)
  - Recommandations de trailing stop
  - Calcul exact du lot size base sur le compte et le risque
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from config import INSTRUMENT_CONFIG, ACCOUNT_BALANCE, RISK_PERCENT

logger = logging.getLogger("apex.eo")


class EntryOptimizer:
    """
    Module 6 — Entry Optimizer.
    Calcule le point d'entree optimal, les TPs multiples,
    le SL precis et la taille de position.
    """

    def find_entry(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Point d'entree principal avec tous les calculs."""
        try:
            entry_type = context.get('entry_type', 'CONTINUATION')
            if entry_type == 'LIQUIDITY_SWEEP':
                return self._liquidity_sweep(context)
            return self._continuation(context)
        except Exception as e:
            logger.error("Erreur find_entry: %s", e)
            return {'status': 'ERROR', 'reason': f'Erreur: {str(e)}'}

    def _continuation(self, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Entree en continuation: OB/FVG avec confirmation."""
        try:
            poi = ctx.get('poi', {})
            confirm_fvg = ctx.get('confirmation_fvg')
            instrument = ctx.get('instrument', 'EURUSD')
            bias = ctx.get('daily_bias', 'BULLISH')
            balance = ctx.get('account_balance', ACCOUNT_BALANCE)
            risk_pct = ctx.get('risk_percent', RISK_PERCENT)
            cfg = INSTRUMENT_CONFIG.get(instrument, {})
            pip = cfg.get('pip_size', 0.0001)
            pip_value = cfg.get('pip_value', 10.0)

            if not poi:
                return {'status': 'WAIT', 'reason': 'Aucun POI identifie'}
            if not confirm_fvg:
                return {'status': 'WAIT', 'reason': "Attente FVG en TF confirmation dans l'OB"}

            # ━━━ Prix d'entree: CE (50%) du FVG de confirmation ━━━
            entry = confirm_fvg.get('ce_50', poi.get('ce_50', 0))

            # Refinement: si l'OB a un refined level, utiliser le CE de celui-ci
            refined_high = poi.get('refined_high', poi.get('high', entry))
            refined_low = poi.get('refined_low', poi.get('low', entry))
            refined_ce = (refined_high + refined_low) / 2

            # Utiliser le meilleur entre le CE du FVG et le CE raffine
            if bias == 'BULLISH':
                entry = min(entry, refined_ce)  # Le plus bas = meilleur pour un achat
            else:
                entry = max(entry, refined_ce)  # Le plus haut = meilleur pour une vente

            # ━━━ SL: derriere le POI + buffer ━━━
            buffer = 2 * pip
            if bias == 'BULLISH':
                sl = poi.get('low', entry) - buffer
                dist = abs(entry - sl)
                # TP multiples
                tp1 = entry + dist * 1.0   # 1:1
                tp2 = entry + dist * 2.0   # 2:1
                tp3 = entry + dist * 3.0   # 3:1
                be = entry + dist          # Break even at 1:1
                direction = 'LONG'
            else:
                sl = poi.get('high', entry) + buffer
                dist = abs(sl - entry)
                tp1 = entry - dist * 1.0
                tp2 = entry - dist * 2.0
                tp3 = entry - dist * 3.0
                be = entry - dist
                direction = 'SHORT'

            # ━━━ Calcul de lot size ━━━
            sl_pips = dist / pip if pip > 0 else 0
            lot_size = self._calculate_lots(balance, risk_pct, sl_pips, pip_value)

            # ━━━ Trailing stop recommendations ━━━
            trailing = self._trailing_stop_plan(entry, sl, dist, bias)

            # ━━━ Partial close plan ━━━
            partial_plan = self._partial_close_plan(lot_size, tp1, tp2, tp3, bias)

            return {
                'status': 'READY',
                'entry_type': 'CONTINUATION',
                'entry_price': round(entry, 6),
                'sl_price': round(sl, 6),
                'tp1_price': round(tp1, 6),
                'tp2_price': round(tp2, 6),
                'tp3_price': round(tp3, 6),
                'be_price': round(be, 6),
                'sl_pips': round(sl_pips, 1),
                'tp1_pips': round(dist / pip, 1) if pip > 0 else 0,
                'tp2_pips': round(dist * 2 / pip, 1) if pip > 0 else 0,
                'tp3_pips': round(dist * 3 / pip, 1) if pip > 0 else 0,
                'risk_reward_tp1': 1.0,
                'risk_reward_tp2': 2.0,
                'risk_reward_tp3': 3.0,
                'direction': direction,
                'lot_size': lot_size,
                'risk_amount': round(balance * risk_pct / 100, 2),
                'risk_percent': risk_pct,
                'poi_timeframe': poi.get('timeframe', ''),
                'confirmation_tf': confirm_fvg.get('timeframe', ''),
                'trailing_stop': trailing,
                'partial_close_plan': partial_plan,
                'logic': (
                    f"Continuation {bias} — "
                    f"OB/FVG {poi.get('timeframe', '')} -> "
                    f"FVG confirm {confirm_fvg.get('timeframe', '')}"
                ),
            }

        except Exception as e:
            logger.error("Erreur _continuation: %s", e)
            return {'status': 'ERROR', 'reason': str(e)}

    def _liquidity_sweep(self, ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Entree apres un sweep de liquidite: Breaker + IFVG."""
        try:
            bb = ctx.get('breaker_block', ctx.get('poi', {}))
            ifvg = ctx.get('ifvg')
            instrument = ctx.get('instrument', 'EURUSD')
            bias = ctx.get('daily_bias', 'BULLISH')
            balance = ctx.get('account_balance', ACCOUNT_BALANCE)
            risk_pct = ctx.get('risk_percent', RISK_PERCENT)
            cfg = INSTRUMENT_CONFIG.get(instrument, {})
            pip = cfg.get('pip_size', 0.0001)
            pip_value = cfg.get('pip_value', 10.0)

            if not ifvg:
                return {'status': 'WAIT', 'reason': 'Attente IFVG dans le Breaker Block'}

            entry = ifvg.get('ce_50', ifvg.get('entry_price', 0))
            buffer = 2 * pip

            if bias == 'BULLISH':
                sl = bb.get('low', entry) - buffer
                dist = abs(entry - sl)
                tp1 = entry + dist * 1.0
                tp2 = entry + dist * 2.0
                tp3 = entry + dist * 3.0
                be = entry + dist
                direction = 'LONG'
            else:
                sl = bb.get('high', entry) + buffer
                dist = abs(sl - entry)
                tp1 = entry - dist * 1.0
                tp2 = entry - dist * 2.0
                tp3 = entry - dist * 3.0
                be = entry - dist
                direction = 'SHORT'

            sl_pips = dist / pip if pip > 0 else 0
            lot_size = self._calculate_lots(balance, risk_pct, sl_pips, pip_value)
            trailing = self._trailing_stop_plan(entry, sl, dist, bias)
            partial_plan = self._partial_close_plan(lot_size, tp1, tp2, tp3, bias)

            return {
                'status': 'READY',
                'entry_type': 'LIQUIDITY_SWEEP',
                'entry_price': round(entry, 6),
                'sl_price': round(sl, 6),
                'tp1_price': round(tp1, 6),
                'tp2_price': round(tp2, 6),
                'tp3_price': round(tp3, 6),
                'be_price': round(be, 6),
                'sl_pips': round(sl_pips, 1),
                'tp1_pips': round(dist / pip, 1) if pip > 0 else 0,
                'tp2_pips': round(dist * 2 / pip, 1) if pip > 0 else 0,
                'tp3_pips': round(dist * 3 / pip, 1) if pip > 0 else 0,
                'risk_reward_tp1': 1.0,
                'risk_reward_tp2': 2.0,
                'risk_reward_tp3': 3.0,
                'direction': direction,
                'lot_size': lot_size,
                'risk_amount': round(balance * risk_pct / 100, 2),
                'risk_percent': risk_pct,
                'sweep_type': ctx.get('sweep_type', ''),
                'trailing_stop': trailing,
                'partial_close_plan': partial_plan,
                'logic': (
                    f"Liquidity Sweep — "
                    f"BB {bb.get('timeframe', '')} + IFVG {ifvg.get('timeframe', '')}"
                ),
            }

        except Exception as e:
            logger.error("Erreur _liquidity_sweep: %s", e)
            return {'status': 'ERROR', 'reason': str(e)}

    # ━━━ LOT SIZE CALCULATION ━━━

    def _calculate_lots(self, balance: float, risk_pct: float,
                        sl_pips: float, pip_value: float) -> float:
        """Calcul exact du lot size base sur le risque."""
        try:
            if sl_pips <= 0 or pip_value <= 0:
                return 0.01
            risk_amount = balance * (risk_pct / 100)
            lots = risk_amount / (sl_pips * pip_value)
            # Arrondir au centieme de lot (micro lots)
            return round(max(0.01, lots), 2)
        except Exception:
            return 0.01

    # ━━━ TRAILING STOP PLAN ━━━

    def _trailing_stop_plan(self, entry: float, sl: float,
                            sl_dist: float, bias: str) -> Dict[str, Any]:
        """Plan de trailing stop recommande."""
        try:
            if bias == 'BULLISH':
                return {
                    'strategy': 'STRUCTURE_TRAILING',
                    'steps': [
                        {'trigger': 'TP1 atteint (1:1)', 'action': 'Move SL a Break Even',
                         'new_sl': round(entry, 6)},
                        {'trigger': 'TP2 atteint (2:1)', 'action': 'Move SL a TP1',
                         'new_sl': round(entry + sl_dist, 6)},
                        {'trigger': 'TP3 atteint (3:1)', 'action': 'Move SL a TP2',
                         'new_sl': round(entry + sl_dist * 2, 6)},
                    ],
                    'description': 'Trailing stop par structure: chaque TP atteint remonte le SL',
                }
            else:
                return {
                    'strategy': 'STRUCTURE_TRAILING',
                    'steps': [
                        {'trigger': 'TP1 atteint (1:1)', 'action': 'Move SL a Break Even',
                         'new_sl': round(entry, 6)},
                        {'trigger': 'TP2 atteint (2:1)', 'action': 'Move SL a TP1',
                         'new_sl': round(entry - sl_dist, 6)},
                        {'trigger': 'TP3 atteint (3:1)', 'action': 'Move SL a TP2',
                         'new_sl': round(entry - sl_dist * 2, 6)},
                    ],
                    'description': 'Trailing stop par structure: chaque TP atteint descend le SL',
                }
        except Exception:
            return {'strategy': 'MANUAL', 'steps': [], 'description': 'Trailing manuel'}

    # ━━━ PARTIAL CLOSE PLAN ━━━

    def _partial_close_plan(self, total_lots: float, tp1: float,
                            tp2: float, tp3: float, bias: str) -> List[Dict[str, Any]]:
        """Plan de cloture partielle recommande."""
        try:
            # Repartition: 40% au TP1, 40% au TP2, 20% au TP3
            lot1 = round(total_lots * 0.40, 2)
            lot2 = round(total_lots * 0.40, 2)
            lot3 = round(max(0.01, total_lots - lot1 - lot2), 2)

            return [
                {
                    'level': 'TP1',
                    'price': round(tp1, 6),
                    'lots_to_close': lot1,
                    'percentage': 40,
                    'action': 'Fermer 40% + Move SL a BE',
                },
                {
                    'level': 'TP2',
                    'price': round(tp2, 6),
                    'lots_to_close': lot2,
                    'percentage': 40,
                    'action': 'Fermer 40% + Move SL a TP1',
                },
                {
                    'level': 'TP3',
                    'price': round(tp3, 6),
                    'lots_to_close': lot3,
                    'percentage': 20,
                    'action': 'Fermer les 20% restants',
                },
            ]
        except Exception:
            return []
