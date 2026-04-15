from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Breaker Block Detection (Production Grade)
  Detection des Breaker Blocks avec:
  - Transition OB echoue -> Breaker avec logique propre
  - Tracking du sweep de liquidite associe
  - Suivi de mitigation des breakers
  - Scoring par qualite de l'OB original et du sweep
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("apex.breaker")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DETECTION DES BREAKER BLOCKS
#  Un Breaker = un OB qui a echoue (le prix a close au travers)
#  et qui devient support/resistance inverse.
#  C'est un des setups ICT les plus puissants quand combine avec IFVG.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_breaker_blocks(order_blocks: List[Dict],
                          liquidity_sweeps: List[Dict],
                          candles: Optional[List[Dict]] = None) -> List[Dict]:
    """
    Detecte les Breaker Blocks a partir des OB mitiges/invalides.

    Logique de transition:
    1. Un OB est cree (ex: OB bearish a un swing high)
    2. Le prix CLOSE au travers de l'OB (invalidation)
    3. L'OB echoue -> il devient un Breaker Block
    4. Le Breaker agit comme support/resistance inverse

    Un OB bearish invalide -> Breaker BULLISH (support)
    Un OB bullish invalide -> Breaker BEARISH (resistance)
    """
    try:
        breaker_blocks: List[Dict] = []

        for ob in order_blocks:
            # L'OB doit etre invalide (pas juste mitigue)
            is_failed = ob.get('invalidated', False) or ob.get('mitigated', False)
            if not is_failed:
                continue

            # Trouver le sweep de liquidite associe
            sweep = _find_associated_sweep(ob, liquidity_sweeps)

            # Verifier la transition propre: le prix doit avoir traverse
            # l'OB avec conviction (body close, pas juste wick)
            transition_valid = _validate_transition(ob, candles)
            if not transition_valid and not sweep:
                # Ni sweep ni transition valide -> pas un vrai breaker
                continue

            # ━━━ Construction du Breaker Block ━━━
            # Direction inversee: OB bearish echoue -> Breaker bullish
            if ob['direction'] == 'bearish':
                bb_direction = 'bullish'
            elif ob['direction'] == 'bullish':
                bb_direction = 'bearish'
            else:
                continue

            # Score de qualite du breaker
            quality = _score_breaker(ob, sweep, transition_valid)

            # Mitigation tracking
            mitigation = _check_breaker_mitigation(ob, candles) if candles else {
                'mitigated': False, 'retests': 0, 'first_retest_time': None,
            }

            bb = {
                'type': 'BREAKER_BLOCK',
                'direction': bb_direction,
                'high': ob['high'],
                'low': ob['low'],
                'ce_50': ob['ce_50'],
                'timeframe': ob.get('timeframe', ''),
                'original_ob_direction': ob['direction'],
                'original_ob_type': ob.get('type', 'ORDER_BLOCK'),
                'original_ob_quality': ob.get('quality_score', 50),
                'associated_sweep': sweep,
                'has_sweep': sweep is not None,
                'sweep_type': sweep.get('level_type', 'UNKNOWN') if sweep else 'NONE',
                'sweep_significance': sweep.get('significance', 'LOW') if sweep else 'NONE',
                'transition_validated': transition_valid,
                'usage': 'LIQUIDITY_SWEEP_ENTRY',
                'requires_ifvg_confirm': True,
                'quality_score': quality,
                'created_at': ob['created_at'],
                'retests': mitigation.get('retests', 0),
                'mitigated': mitigation.get('mitigated', False),
                'first_retest_time': mitigation.get('first_retest_time'),
                'status': 'MITIGATED' if mitigation.get('mitigated') else 'ACTIVE',
                'entry_logic': _describe_entry_logic(bb_direction, sweep),
            }
            breaker_blocks.append(bb)

        return breaker_blocks

    except Exception as e:
        logger.error("Erreur detect_breaker_blocks: %s", e)
        return []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  VALIDATION DE TRANSITION — L'OB a-t-il vraiment echoue proprement?
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _validate_transition(ob: Dict, candles: Optional[List[Dict]]) -> bool:
    """
    Valide que la transition OB -> Breaker est propre.
    Le prix doit avoir CLOSE au travers du body de l'OB
    (pas juste un wick qui depasse).
    """
    try:
        if not candles:
            return ob.get('invalidated', False)

        for c in candles:
            if c['time'] <= ob['created_at']:
                continue

            if ob['direction'] == 'bullish':
                # OB bullish echoue: le prix close sous le low de l'OB
                if c['close'] < ob['low']:
                    # Verifier que c'est un mouvement significatif
                    body = abs(c['close'] - c['open'])
                    total = c['high'] - c['low']
                    if total > 0 and body / total > 0.4:
                        return True

            elif ob['direction'] == 'bearish':
                # OB bearish echoue: le prix close au-dessus du high de l'OB
                if c['close'] > ob['high']:
                    body = abs(c['close'] - c['open'])
                    total = c['high'] - c['low']
                    if total > 0 and body / total > 0.4:
                        return True

        return False

    except Exception:
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SWEEP ASSOCIE — Quel sweep de liquidite a cause l'echec de l'OB?
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _find_associated_sweep(ob: Dict, sweeps: List[Dict]) -> Optional[Dict]:
    """
    Trouve le sweep de liquidite qui a probablement cause l'echec de l'OB.

    Le sweep doit:
    1. Etre dans une fenetre temporelle raisonnable (3 jours max)
    2. Etre dans la direction compatible avec l'echec de l'OB
    """
    try:
        if not sweeps:
            return None

        best_sweep = None
        best_time_diff = float('inf')

        for sweep in sweeps:
            time_diff = abs(sweep.get('time', 0) - ob.get('created_at', 0))

            # Fenetre de 3 jours max
            if time_diff > 86400 * 3:
                continue

            # Verifier la compatibilite directionnelle
            # OB bullish echoue -> sweep doit etre bearish (SSL swept)
            if ob['direction'] == 'bullish' and sweep.get('direction') == 'bearish':
                if time_diff < best_time_diff:
                    best_sweep = sweep
                    best_time_diff = time_diff

            # OB bearish echoue -> sweep doit etre bullish (BSL swept)
            elif ob['direction'] == 'bearish' and sweep.get('direction') == 'bullish':
                if time_diff < best_time_diff:
                    best_sweep = sweep
                    best_time_diff = time_diff

            # Si pas de filtre directionnel, prendre le plus proche
            elif time_diff < best_time_diff:
                best_sweep = sweep
                best_time_diff = time_diff

        return best_sweep

    except Exception:
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MITIGATION DES BREAKERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _check_breaker_mitigation(ob: Dict, candles: Optional[List[Dict]]) -> Dict[str, Any]:
    """
    Verifie si le Breaker Block a ete reteste (mitigue).
    Le premier retest est souvent le meilleur point d'entree.
    """
    try:
        result = {
            'mitigated': False,
            'retests': 0,
            'first_retest_time': None,
        }

        if not candles:
            return result

        # Apres l'echec de l'OB, le prix revient tester la zone
        # C'est la mitigation du Breaker
        for c in candles:
            if c['time'] <= ob['created_at']:
                continue

            if ob['direction'] == 'bearish':
                # L'OB bearish est devenu un Breaker bullish
                # Mitigation = le prix revient dans la zone par le haut
                if c['low'] <= ob['high'] and c['close'] >= ob['low']:
                    result['retests'] += 1
                    if result['first_retest_time'] is None:
                        result['first_retest_time'] = c['time']
                    # Mitigation complete si le prix close sous le low
                    if c['close'] < ob['low']:
                        result['mitigated'] = True
                        break

            elif ob['direction'] == 'bullish':
                # L'OB bullish est devenu un Breaker bearish
                if c['high'] >= ob['low'] and c['close'] <= ob['high']:
                    result['retests'] += 1
                    if result['first_retest_time'] is None:
                        result['first_retest_time'] = c['time']
                    if c['close'] > ob['high']:
                        result['mitigated'] = True
                        break

        return result

    except Exception:
        return {'mitigated': False, 'retests': 0, 'first_retest_time': None}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCORING DES BREAKER BLOCKS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_breaker(ob: Dict, sweep: Optional[Dict],
                   transition_valid: bool) -> int:
    """Score de qualite d'un Breaker Block (0-100)."""
    try:
        score = 0

        # 1. Qualite de l'OB original (max 30)
        ob_quality = ob.get('quality_score', 50)
        score += min(30, int(ob_quality * 0.35))

        # 2. Sweep associe (max 30)
        if sweep:
            sig = sweep.get('significance', 'LOW')
            if sig == 'EXTREME':
                score += 30
            elif sig == 'VERY_HIGH':
                score += 25
            elif sig == 'HIGH':
                score += 20
            elif sig == 'MEDIUM':
                score += 12
            else:
                score += 5
        else:
            score += 3  # Pas de sweep = moins fiable

        # 3. Transition validee (max 15)
        if transition_valid:
            score += 15
        else:
            score += 5

        # 4. Timeframe (max 15)
        tf_weights = {
            'W1': 15, 'D1': 15, 'H4': 13, 'H1': 11,
            'M15': 9, 'M5': 6, 'M1': 3,
        }
        score += tf_weights.get(ob.get('timeframe', ''), 6)

        # 5. OB extreme/propulsion bonus (max 10)
        if ob.get('is_extreme'):
            score += 10
        elif ob.get('is_propulsion'):
            score += 8
        elif ob.get('has_fvg'):
            score += 5

        return max(0, min(100, score))

    except Exception:
        return 50


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DESCRIPTION DE LA LOGIQUE D'ENTREE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _describe_entry_logic(direction: str, sweep: Optional[Dict]) -> str:
    """Genere une description de la logique d'entree pour le Breaker."""
    try:
        if sweep:
            sweep_type = sweep.get('level_type', 'liquidite')
            if direction == 'bullish':
                return (
                    f"Breaker BULLISH apres sweep {sweep_type} — "
                    f"Attendre IFVG bullish dans le BB pour entree LONG"
                )
            else:
                return (
                    f"Breaker BEARISH apres sweep {sweep_type} — "
                    f"Attendre IFVG bearish dans le BB pour entree SHORT"
                )
        else:
            if direction == 'bullish':
                return "Breaker BULLISH — Attendre IFVG de confirmation pour LONG"
            else:
                return "Breaker BEARISH — Attendre IFVG de confirmation pour SHORT"
    except Exception:
        return "Breaker Block — Attendre confirmation IFVG"
