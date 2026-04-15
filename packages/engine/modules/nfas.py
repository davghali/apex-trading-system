from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Module 9: News Filter & Algo Shield (NFAS)
  Filtre de news avec:
  - Keywords complets pour TOUS les evenements high-impact
  - Filtrage par devise (USD pour EURUSD/XAUUSD, pas JPY)
  - Regles de positionnement pre-news
  - Timing de re-entree post-news
=============================================================================
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("apex.nfas")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NEWS HIGH IMPACT — Keywords complets
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HIGH_IMPACT_KEYWORDS: List[str] = [
    # USA
    'NFP', 'Nonfarm', 'Non-Farm', 'Non Farm',
    'CPI', 'Consumer Price Index', 'Core CPI',
    'PPI', 'Producer Price Index',
    'FOMC', 'Federal Reserve', 'Fed Rate', 'Federal Funds',
    'Interest Rate Decision', 'Rate Decision',
    'GDP', 'Gross Domestic Product',
    'Retail Sales', 'Core Retail',
    'PCE', 'Personal Consumption', 'Core PCE',
    'Unemployment Rate', 'Unemployment Claims', 'Initial Claims',
    'ISM Manufacturing', 'ISM Services', 'ISM Non-Manufacturing',
    'Durable Goods', 'Core Durable',
    'Housing Starts', 'Building Permits',
    'Trade Balance',
    'Powell', 'Yellen',
    'JOLTS', 'Job Openings',
    'Michigan Consumer', 'Consumer Confidence',
    'Philadelphia Fed', 'Empire State',
    'ADP Employment', 'ADP Nonfarm',
    # Europe
    'ECB', 'European Central Bank', 'Lagarde',
    'German CPI', 'German GDP', 'German PMI',
    'Eurozone CPI', 'Eurozone GDP',
    'PMI Manufacturing', 'PMI Services',
    # UK
    'BOE', 'Bank of England', 'Bailey',
    'UK CPI', 'UK GDP', 'UK Employment',
    # Other
    'BOJ', 'Bank of Japan', 'Ueda',
    'RBA', 'Reserve Bank', 'BOC', 'SNB',
    'OPEC',
]

# Devises affectees par instrument
INSTRUMENT_CURRENCIES: Dict[str, List[str]] = {
    'EURUSD': ['USD', 'EUR', 'US', 'Euro', 'EC'],
    'XAUUSD': ['USD', 'US', 'Gold', 'XAU'],
    'NAS100': ['USD', 'US'],
    'DXY':    ['USD', 'US'],
}

# Timing
BUFFER_BEFORE_MIN = 30   # Minutes avant la news
BUFFER_AFTER_MIN = 15    # Minutes apres la news
REENTRY_DELAY_MIN = 30   # Delai de re-entree post-news


class NewsFilterAlgoShield:
    """
    Module 9 — News Filter & Algo Shield.
    Filtre les news high-impact et protege les trades.
    """

    def __init__(self):
        self.events: List[Dict] = []

    def update_events(self, events: List[Dict]):
        """Met a jour la liste des evenements economiques."""
        try:
            self.events = events if events else []
        except Exception:
            self.events = []

    def check_news_safety(self, instrument: str = 'EURUSD') -> Dict[str, Any]:
        """
        Verifie si c'est safe de trader maintenant.
        Filtre par instrument (seules les news de la devise concernee comptent).
        """
        try:
            now = datetime.now(timezone.utc)
            blocked = False
            blocking: List[Dict] = []
            next_clear = None

            # Devises pertinentes pour cet instrument
            relevant_currencies = INSTRUMENT_CURRENCIES.get(instrument, ['USD'])

            for event in self.events:
                if not self._is_relevant_high_impact(event, relevant_currencies):
                    continue

                event_time = self._parse_time(event.get('time', ''))
                if not event_time:
                    continue

                buffer_before = timedelta(minutes=BUFFER_BEFORE_MIN)
                buffer_after = timedelta(minutes=BUFFER_AFTER_MIN)
                start = event_time - buffer_before
                end = event_time + buffer_after

                if start <= now <= end:
                    blocked = True
                    blocking.append({
                        'name': event.get('name', 'Unknown'),
                        'time': event_time.isoformat(),
                        'impact': event.get('impact', 'HIGH'),
                        'currency': event.get('currency', 'USD'),
                        'exclusion_start': start.isoformat(),
                        'exclusion_end': end.isoformat(),
                        'reentry_time': (event_time + timedelta(minutes=REENTRY_DELAY_MIN)).isoformat(),
                    })
                    if next_clear is None or end > next_clear:
                        next_clear = end

            # Pre-news positioning rules
            pre_news = self._check_pre_news_positioning(now, relevant_currencies)

            # Post-news re-entry timing
            post_news = self._check_post_news_reentry(now, relevant_currencies)

            # Upcoming news
            upcoming = self._upcoming_news(now, relevant_currencies)

            return {
                'safe_to_trade': not blocked,
                'algo_active': not blocked,
                'blocking_news': blocking,
                'next_clear_time': next_clear.isoformat() if next_clear else None,
                'status': (
                    'CLEAR — Algo actif, pas de news imminente'
                    if not blocked
                    else f'BLOQUE — {blocking[0]["name"]} ({blocking[0]["currency"]})'
                ),
                'action_for_open_trades': 'NONE' if not blocked else 'MOVE_TO_BE_OR_CLOSE',
                'pre_news_positioning': pre_news,
                'post_news_reentry': post_news,
                'upcoming_high_impact': upcoming,
                'instrument': instrument,
                'currencies_monitored': relevant_currencies,
            }

        except Exception as e:
            logger.error("Erreur check_news_safety: %s", e)
            return {
                'safe_to_trade': True,
                'algo_active': True,
                'blocking_news': [],
                'status': 'Erreur verification news — Trading autorise par defaut',
                'upcoming_high_impact': [],
            }

    def _is_relevant_high_impact(self, event: Dict, currencies: List[str]) -> bool:
        """
        Verifie si un evenement est high-impact ET pertinent pour l'instrument.
        """
        try:
            # Verifier l'impact
            is_high = event.get('impact') == 'HIGH'
            name = event.get('name', '').lower()
            if not is_high:
                is_high = any(kw.lower() in name for kw in HIGH_IMPACT_KEYWORDS)

            if not is_high:
                return False

            # Verifier la devise
            event_currency = event.get('currency', '').upper()
            if event_currency:
                return any(curr.upper() in event_currency or event_currency in curr.upper()
                          for curr in currencies)

            # Si pas de devise specifiee, verifier dans le nom
            for curr in currencies:
                if curr.lower() in name:
                    return True

            # Par defaut, considerer les news USD comme pertinentes
            return 'USD' in currencies or 'US' in currencies

        except Exception:
            return False

    def _parse_time(self, time_str: str) -> Optional[datetime]:
        """Parse une chaine de temps en datetime."""
        try:
            if not time_str:
                return None
            return datetime.fromisoformat(time_str.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return None

    # ━━━ PRE-NEWS POSITIONING ━━━

    def _check_pre_news_positioning(self, now: datetime,
                                     currencies: List[str]) -> Dict[str, Any]:
        """
        Regles de positionnement avant une news:
        - 60 min avant: Reduire taille ou ne pas entrer
        - 30 min avant: Ne pas ouvrir de nouveaux trades
        - 15 min avant: Bouger les SL a break-even
        """
        try:
            for event in self.events:
                if not self._is_relevant_high_impact(event, currencies):
                    continue

                event_time = self._parse_time(event.get('time', ''))
                if not event_time or event_time <= now:
                    continue

                minutes_until = (event_time - now).total_seconds() / 60

                if minutes_until <= 15:
                    return {
                        'status': 'CRITICAL',
                        'action': 'Move SL a Break Even sur TOUS les trades ouverts',
                        'event': event.get('name', ''),
                        'minutes_until': round(minutes_until),
                    }
                elif minutes_until <= 30:
                    return {
                        'status': 'WARNING',
                        'action': 'NE PAS ouvrir de nouveaux trades. Proteger les existants.',
                        'event': event.get('name', ''),
                        'minutes_until': round(minutes_until),
                    }
                elif minutes_until <= 60:
                    return {
                        'status': 'CAUTION',
                        'action': 'Reduire la taille des positions. Envisager la sortie.',
                        'event': event.get('name', ''),
                        'minutes_until': round(minutes_until),
                    }

            return {'status': 'CLEAR', 'action': 'Aucune news imminente'}

        except Exception:
            return {'status': 'UNKNOWN', 'action': 'Erreur verification'}

    # ━━━ POST-NEWS RE-ENTRY ━━━

    def _check_post_news_reentry(self, now: datetime,
                                  currencies: List[str]) -> Dict[str, Any]:
        """
        Timing de re-entree apres une news:
        - Attendre 30 min apres la news pour la volatilite se calme
        - Attendre un nouveau setup ICT (FVG/OB) post-news
        """
        try:
            for event in self.events:
                if not self._is_relevant_high_impact(event, currencies):
                    continue

                event_time = self._parse_time(event.get('time', ''))
                if not event_time:
                    continue

                minutes_since = (now - event_time).total_seconds() / 60

                if 0 < minutes_since < REENTRY_DELAY_MIN:
                    return {
                        'status': 'COOLING_DOWN',
                        'action': f'Attendre encore {REENTRY_DELAY_MIN - int(minutes_since)} min post-news',
                        'event': event.get('name', ''),
                        'minutes_since': round(minutes_since),
                        'can_reenter_at': (event_time + timedelta(minutes=REENTRY_DELAY_MIN)).isoformat(),
                    }
                elif REENTRY_DELAY_MIN <= minutes_since < REENTRY_DELAY_MIN + 5:
                    return {
                        'status': 'READY',
                        'action': 'Re-entree possible — Chercher un nouveau setup ICT (FVG/OB post-news)',
                        'event': event.get('name', ''),
                    }

            return {'status': 'CLEAR', 'action': 'Pas de restriction post-news'}

        except Exception:
            return {'status': 'UNKNOWN', 'action': 'Erreur verification'}

    # ━━━ UPCOMING NEWS ━━━

    def _upcoming_news(self, now: datetime, currencies: List[str]) -> List[Dict]:
        """Liste les prochaines news high-impact."""
        try:
            upcoming: List[Dict] = []
            for event in self.events:
                if not self._is_relevant_high_impact(event, currencies):
                    continue
                event_time = self._parse_time(event.get('time', ''))
                if event_time and event_time > now:
                    diff_min = (event_time - now).total_seconds() / 60
                    upcoming.append({
                        'name': event.get('name', ''),
                        'time': event_time.isoformat(),
                        'minutes_until': round(diff_min),
                        'currency': event.get('currency', ''),
                        'impact': event.get('impact', 'HIGH'),
                        'forecast': event.get('forecast'),
                        'previous': event.get('previous'),
                    })
            return sorted(upcoming, key=lambda x: x['minutes_until'])[:8]

        except Exception:
            return []
