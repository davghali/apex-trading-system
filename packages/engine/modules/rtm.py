from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 7: Risk & Trade Manager (RTM)
  Gestionnaire de risque et de trades avec:
  - Tilt Guard (detection de pertes consecutives)
  - Drawdown tracking
  - Equity curve monitoring
  - Compatibilite prop firm (max daily/total loss, consistency)
  - Recommandations de cloture partielle
=============================================================================
"""

import time
import logging
from typing import Optional, List, Dict, Any
from config import INSTRUMENT_CONFIG, ACCOUNT_BALANCE, RISK_PERCENT, MAX_DAILY_TRADES

logger = logging.getLogger("apex.rtm")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PROP FIRM RULES — Regles des prop firms courantes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROP_FIRM_RULES: Dict[str, Dict[str, Any]] = {
    'APEX': {
        'max_daily_loss_pct': 2.0,
        'max_total_loss_pct': 6.0,
        'consistency_rule': True,
        'max_winning_day_pct': 30.0,  # Max 30% du profit total en un jour
        'trailing_drawdown': True,
        'description': 'Apex Trader Funding rules',
    },
    'FTMO': {
        'max_daily_loss_pct': 5.0,
        'max_total_loss_pct': 10.0,
        'consistency_rule': False,
        'trailing_drawdown': False,
        'description': 'FTMO Challenge rules',
    },
    'MFF': {
        'max_daily_loss_pct': 5.0,
        'max_total_loss_pct': 12.0,
        'consistency_rule': True,
        'max_winning_day_pct': 50.0,
        'trailing_drawdown': False,
        'description': 'MyForexFunds rules',
    },
    'DEFAULT': {
        'max_daily_loss_pct': 2.0,
        'max_total_loss_pct': 5.0,
        'consistency_rule': False,
        'trailing_drawdown': False,
        'description': 'Default conservative rules',
    },
}


class RiskTradeManager:
    """
    Module 7 — Risk & Trade Manager.
    Gere le risque, suit les trades, surveille le drawdown
    et applique les regles de prop firm.
    """

    def __init__(self, prop_firm: str = 'DEFAULT'):
        self.balance = ACCOUNT_BALANCE
        self.initial_balance = ACCOUNT_BALANCE
        self.base_risk = RISK_PERCENT
        self.daily_trades: List[Dict[str, Any]] = []
        self.all_trades: List[Dict[str, Any]] = []
        self.daily_pnl = 0.0
        self.weekly_pnl = 0.0
        self.total_pnl = 0.0
        self.peak_balance = ACCOUNT_BALANCE
        self.max_drawdown = 0.0
        self.current_drawdown = 0.0
        self.consecutive_losses = 0
        self.max_consecutive_losses = 0
        self.tilt_active = False
        self.prop_firm_rules = PROP_FIRM_RULES.get(prop_firm, PROP_FIRM_RULES['DEFAULT'])
        self.prop_firm_name = prop_firm
        logger.info("RTM initialise — Prop Firm: %s | Balance: %.2f", prop_firm, self.balance)

    # ━━━ POSITION SIZE ━━━

    def calculate_position(self, entry: float, sl: float, instrument: str,
                           confluence_modifier: float = 1.0) -> Dict[str, Any]:
        """Calcule la taille de position avec tous les ajustements."""
        try:
            cfg = INSTRUMENT_CONFIG.get(instrument, {})
            pip_size = cfg.get('pip_size', 0.0001)
            pip_value = cfg.get('pip_value', 10.0)

            risk_amount = self.balance * (self.base_risk / 100)
            modifier = confluence_modifier

            # ━━━ Ajustements dynamiques ━━━
            adjustment_reasons: List[str] = []

            # Reduction apres perte
            if self.daily_trades and self.daily_trades[-1].get('result') == 'LOSS':
                modifier *= 0.5
                adjustment_reasons.append('Dernier trade perdant -> x0.5')

            # Tilt guard: 3+ pertes consecutives
            if self.consecutive_losses >= 3:
                modifier *= 0.25
                adjustment_reasons.append(f'{self.consecutive_losses} pertes consecutives -> x0.25')
                if self.tilt_active:
                    return {
                        'lots': 0,
                        'risk_amount': 0,
                        'risk_percent': 0,
                        'sl_pips': 0,
                        'blocked': True,
                        'reason': f'TILT GUARD: {self.consecutive_losses} pertes consecutives. STOP TRADING.',
                        'adjustments': adjustment_reasons,
                    }

            # Drawdown guard
            if self.current_drawdown > 0.03:  # > 3% drawdown
                dd_mult = max(0.25, 1.0 - (self.current_drawdown * 10))
                modifier *= dd_mult
                adjustment_reasons.append(f'Drawdown {self.current_drawdown:.1%} -> x{dd_mult:.2f}')

            adjusted_risk = risk_amount * modifier
            sl_distance = abs(entry - sl)
            sl_pips = sl_distance / pip_size if pip_size > 0 else 0
            lots = adjusted_risk / (sl_pips * pip_value) if sl_pips > 0 and pip_value > 0 else 0
            lots = round(max(0.01, lots), 2)

            # ━━━ Prop firm daily loss check ━━━
            max_daily = self.balance * (self.prop_firm_rules['max_daily_loss_pct'] / 100)
            daily_loss_remaining = max_daily - abs(min(0, self.daily_pnl))

            # Ne pas risquer plus que le daily loss restant
            if adjusted_risk > daily_loss_remaining > 0:
                lots = round(daily_loss_remaining / (sl_pips * pip_value), 2) if sl_pips > 0 and pip_value > 0 else 0.01
                adjustment_reasons.append(f'Capped par daily loss restant: ${daily_loss_remaining:.2f}')

            return {
                'lots': lots,
                'risk_amount': round(adjusted_risk, 2),
                'risk_percent': round((adjusted_risk / self.balance) * 100, 2) if self.balance > 0 else 0,
                'sl_pips': round(sl_pips, 1),
                'tp1_pips': round(sl_pips, 1),
                'tp2_pips': round(sl_pips * 2, 1),
                'tp3_pips': round(sl_pips * 3, 1),
                'potential_profit_tp1': round(adjusted_risk, 2),
                'potential_profit_tp2': round(adjusted_risk * 2, 2),
                'potential_profit_tp3': round(adjusted_risk * 3, 2),
                'be_level': round(entry + (sl_distance if entry > sl else -sl_distance), 6),
                'size_modifier': round(modifier, 3),
                'adjustments': adjustment_reasons,
                'max_daily_loss_remaining': round(daily_loss_remaining, 2),
                'blocked': False,
            }

        except Exception as e:
            logger.error("Erreur calculate_position: %s", e)
            return {
                'lots': 0.01, 'risk_amount': 0, 'risk_percent': 0,
                'sl_pips': 0, 'blocked': False, 'adjustments': [],
            }

    # ━━━ TRADE ALLOWED CHECK ━━━

    def check_trade_allowed(self) -> Dict[str, Any]:
        """Verifie si un nouveau trade est autorise."""
        try:
            reasons: List[str] = []
            allowed = True
            warnings: List[str] = []

            # Max daily trades
            if len(self.daily_trades) >= MAX_DAILY_TRADES:
                allowed = False
                reasons.append(f'Max {MAX_DAILY_TRADES} trades/jour atteint')

            # Max daily loss
            max_daily = self.balance * (self.prop_firm_rules['max_daily_loss_pct'] / 100)
            if self.daily_pnl <= -max_daily:
                allowed = False
                reasons.append(f'Max daily loss {self.prop_firm_rules["max_daily_loss_pct"]}% atteint')

            # Max total loss
            max_total = self.initial_balance * (self.prop_firm_rules['max_total_loss_pct'] / 100)
            if self.total_pnl <= -max_total:
                allowed = False
                reasons.append(f'Max total loss {self.prop_firm_rules["max_total_loss_pct"]}% atteint')

            # Tilt guard
            if self.tilt_active:
                allowed = False
                reasons.append(f'TILT GUARD: {self.consecutive_losses} pertes consecutives')

            # Warnings
            if self.daily_pnl <= -max_daily * 0.7:
                warnings.append(f'Proche du max daily loss ({abs(self.daily_pnl):.2f}/${max_daily:.2f})')
            if self.consecutive_losses >= 2:
                warnings.append(f'{self.consecutive_losses} pertes consecutives — Prudence')
            if self.current_drawdown > 0.02:
                warnings.append(f'Drawdown actuel: {self.current_drawdown:.1%}')

            return {
                'allowed': allowed,
                'reasons': reasons,
                'warnings': warnings,
                'trades_today': len(self.daily_trades),
                'trades_remaining': max(0, MAX_DAILY_TRADES - len(self.daily_trades)),
                'daily_pnl': round(self.daily_pnl, 2),
                'weekly_pnl': round(self.weekly_pnl, 2),
                'total_pnl': round(self.total_pnl, 2),
                'consecutive_losses': self.consecutive_losses,
                'tilt_active': self.tilt_active,
                'current_drawdown': round(self.current_drawdown * 100, 2),
                'max_drawdown': round(self.max_drawdown * 100, 2),
                'prop_firm': self.prop_firm_name,
            }

        except Exception as e:
            logger.error("Erreur check_trade_allowed: %s", e)
            return {
                'allowed': True, 'reasons': [], 'warnings': [],
                'trades_today': 0, 'trades_remaining': MAX_DAILY_TRADES,
                'daily_pnl': 0, 'weekly_pnl': 0,
            }

    # ━━━ RECORD TRADE ━━━

    def record_trade(self, result: str, pnl: float, details: Optional[Dict] = None):
        """Enregistre un trade et met a jour toutes les metriques."""
        try:
            trade = {
                'result': result,
                'pnl': pnl,
                'time': int(time.time()),
                'details': details or {},
            }
            self.daily_trades.append(trade)
            self.all_trades.append(trade)
            self.daily_pnl += pnl
            self.weekly_pnl += pnl
            self.total_pnl += pnl
            self.balance += pnl

            # Consecutive losses tracking
            if result == 'LOSS':
                self.consecutive_losses += 1
                self.max_consecutive_losses = max(self.max_consecutive_losses, self.consecutive_losses)
                # Tilt guard: 3 pertes de suite
                if self.consecutive_losses >= 3:
                    self.tilt_active = True
                    logger.warning("TILT GUARD ACTIVE: %d pertes consecutives", self.consecutive_losses)
            elif result == 'WIN':
                self.consecutive_losses = 0
                self.tilt_active = False

            # Drawdown tracking
            self.peak_balance = max(self.peak_balance, self.balance)
            if self.peak_balance > 0:
                self.current_drawdown = (self.peak_balance - self.balance) / self.peak_balance
                self.max_drawdown = max(self.max_drawdown, self.current_drawdown)

            logger.info(
                "Trade enregistre: %s | PnL: %.2f | Balance: %.2f | DD: %.2f%%",
                result, pnl, self.balance, self.current_drawdown * 100
            )

        except Exception as e:
            logger.error("Erreur record_trade: %s", e)

    # ━━━ EQUITY CURVE ━━━

    def get_equity_curve(self) -> Dict[str, Any]:
        """Retourne les metriques de l'equity curve."""
        try:
            if not self.all_trades:
                return {
                    'total_trades': 0,
                    'win_rate': 0,
                    'avg_win': 0,
                    'avg_loss': 0,
                    'profit_factor': 0,
                    'balance': self.balance,
                    'peak_balance': self.peak_balance,
                    'current_drawdown': 0,
                    'max_drawdown': 0,
                }

            wins = [t for t in self.all_trades if t['result'] == 'WIN']
            losses = [t for t in self.all_trades if t['result'] == 'LOSS']

            total_wins = sum(t['pnl'] for t in wins) if wins else 0
            total_losses = abs(sum(t['pnl'] for t in losses)) if losses else 0

            return {
                'total_trades': len(self.all_trades),
                'wins': len(wins),
                'losses': len(losses),
                'win_rate': round(len(wins) / len(self.all_trades) * 100, 1) if self.all_trades else 0,
                'avg_win': round(total_wins / len(wins), 2) if wins else 0,
                'avg_loss': round(total_losses / len(losses), 2) if losses else 0,
                'profit_factor': round(total_wins / max(total_losses, 0.01), 2),
                'total_pnl': round(self.total_pnl, 2),
                'balance': round(self.balance, 2),
                'initial_balance': round(self.initial_balance, 2),
                'peak_balance': round(self.peak_balance, 2),
                'current_drawdown': round(self.current_drawdown * 100, 2),
                'max_drawdown': round(self.max_drawdown * 100, 2),
                'consecutive_losses': self.consecutive_losses,
                'max_consecutive_losses': self.max_consecutive_losses,
                'tilt_active': self.tilt_active,
            }

        except Exception as e:
            logger.error("Erreur get_equity_curve: %s", e)
            return {'total_trades': 0, 'balance': self.balance}

    # ━━━ PARTIAL CLOSE RECOMMENDATION ━━━

    def recommend_partial_close(self, current_pnl: float, entry_price: float,
                                current_price: float, sl_price: float,
                                direction: str) -> Dict[str, Any]:
        """Recommande une cloture partielle basee sur le RR atteint."""
        try:
            dist = abs(entry_price - sl_price)
            if dist <= 0:
                return {'action': 'HOLD', 'reason': 'Distance SL invalide'}

            current_rr = abs(current_price - entry_price) / dist

            if current_rr >= 3.0:
                return {
                    'action': 'CLOSE_REMAINING',
                    'reason': f'TP3 atteint (RR {current_rr:.1f}:1) — Fermer tout',
                    'percentage': 100,
                    'move_sl_to': round(entry_price + dist * 2 * (1 if direction == 'LONG' else -1), 6),
                }
            elif current_rr >= 2.0:
                return {
                    'action': 'PARTIAL_CLOSE',
                    'reason': f'TP2 atteint (RR {current_rr:.1f}:1) — Fermer 40%',
                    'percentage': 40,
                    'move_sl_to': round(entry_price + dist * (1 if direction == 'LONG' else -1), 6),
                }
            elif current_rr >= 1.0:
                return {
                    'action': 'PARTIAL_CLOSE',
                    'reason': f'TP1 atteint (RR {current_rr:.1f}:1) — Fermer 40% + BE',
                    'percentage': 40,
                    'move_sl_to': round(entry_price, 6),
                }
            else:
                return {
                    'action': 'HOLD',
                    'reason': f'RR actuel: {current_rr:.1f}:1 — Attendre TP1',
                    'percentage': 0,
                }

        except Exception:
            return {'action': 'HOLD', 'reason': 'Erreur calcul'}

    # ━━━ UPDATES ━━━

    def update_balance(self, new_balance: float):
        try:
            self.balance = new_balance
            self.peak_balance = max(self.peak_balance, new_balance)
        except Exception:
            pass

    def reset_daily(self):
        try:
            self.daily_trades = []
            self.daily_pnl = 0.0
            # Reset tilt seulement si pas de pertes consecutives majeures
            if self.consecutive_losses < 5:
                self.tilt_active = False
            logger.info("Reset daily — Tilt: %s", self.tilt_active)
        except Exception:
            pass

    def reset_weekly(self):
        try:
            self.weekly_pnl = 0.0
            logger.info("Reset weekly")
        except Exception:
            pass
