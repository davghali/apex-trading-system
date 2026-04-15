from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Data Provider (Production Grade)
  Fournisseur de donnees multi-source avec retry, cache intelligent,
  aggregation de timeframes et monitoring de connexion.
=============================================================================
"""

import time
import math
import random
import asyncio
import logging
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from config import (
    TWELVE_DATA_API_KEY, OANDA_API_KEY, OANDA_ACCOUNT_ID,
    FINNHUB_API_KEY, ALPHA_VANTAGE_API_KEY,
    TWELVE_DATA_SYMBOLS, TIMEFRAME_MAP
)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  LOGGING — Journal structuré avec timestamps
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

logger = logging.getLogger("apex.data_provider")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)s | DataProvider | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(handler)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONSTANTES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MAX_RETRIES = 3
BASE_RETRY_DELAY = 1.0  # secondes

# Secondes par bougie pour chaque timeframe
TF_SECONDS: Dict[str, int] = {
    'W1': 604800, 'D1': 86400, 'H4': 14400, 'H1': 3600,
    'M15': 900, 'M5': 300, 'M1': 60,
}

# TTL du cache — plus court pendant les killzones pour des donnees fraiches
TTL_NORMAL: Dict[str, float] = {
    'W1': 3600, 'D1': 900, 'H4': 300, 'H1': 120,
    'M15': 60, 'M5': 30, 'M1': 15,
}
TTL_KILLZONE: Dict[str, float] = {
    'W1': 1800, 'D1': 600, 'H4': 120, 'H1': 45,
    'M15': 20, 'M5': 10, 'M1': 5,
}

# Hierarchie des TFs pour l'aggregation (du plus petit au plus grand)
TF_HIERARCHY: List[str] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1']
# Facteur de multiplexage : combien de bougies du TF inferieur composent 1 bougie du TF superieur
TF_AGGREGATION_MAP: Dict[str, Dict[str, int]] = {
    'M5':  {'source': 'M1', 'factor': 5},
    'M15': {'source': 'M5', 'factor': 3},
    'H1':  {'source': 'M15', 'factor': 4},
    'H4':  {'source': 'H1', 'factor': 4},
    'D1':  {'source': 'H4', 'factor': 6},
    'W1':  {'source': 'D1', 'factor': 5},
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RATE LIMITER — Controle du debit des appels API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RateLimiter:
    """Limiteur de debit glissant par fenetre temporelle."""

    def __init__(self, max_calls: int, period: float):
        self.max_calls = max_calls
        self.period = period
        self.calls: List[float] = []

    def can_call(self) -> bool:
        try:
            now = time.time()
            self.calls = [t for t in self.calls if now - t < self.period]
            return len(self.calls) < self.max_calls
        except Exception:
            return False

    def record(self):
        try:
            self.calls.append(time.time())
        except Exception:
            pass

    @property
    def remaining(self) -> int:
        try:
            now = time.time()
            self.calls = [t for t in self.calls if now - t < self.period]
            return max(0, self.max_calls - len(self.calls))
        except Exception:
            return 0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONNECTION HEALTH MONITOR — Surveillance de la sante des connexions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ConnectionHealthMonitor:
    """Surveille la sante des connexions API pour chaque provider."""

    def __init__(self):
        self.stats: Dict[str, Dict[str, Any]] = {}

    def record_success(self, provider: str, latency_ms: float):
        try:
            if provider not in self.stats:
                self.stats[provider] = {
                    'successes': 0, 'failures': 0, 'total_latency': 0.0,
                    'last_success': 0.0, 'last_failure': 0.0, 'consecutive_failures': 0,
                }
            s = self.stats[provider]
            s['successes'] += 1
            s['total_latency'] += latency_ms
            s['last_success'] = time.time()
            s['consecutive_failures'] = 0
        except Exception:
            pass

    def record_failure(self, provider: str, error: str):
        try:
            if provider not in self.stats:
                self.stats[provider] = {
                    'successes': 0, 'failures': 0, 'total_latency': 0.0,
                    'last_success': 0.0, 'last_failure': 0.0, 'consecutive_failures': 0,
                }
            s = self.stats[provider]
            s['failures'] += 1
            s['last_failure'] = time.time()
            s['consecutive_failures'] = s.get('consecutive_failures', 0) + 1
            logger.warning("Provider %s FAILURE (#%d): %s", provider, s['consecutive_failures'], error)
        except Exception:
            pass

    def is_healthy(self, provider: str) -> bool:
        try:
            s = self.stats.get(provider)
            if not s:
                return True  # Pas encore de data -> on tente
            # Si 5+ echecs consecutifs, considerer unhealthy pendant 60s
            if s['consecutive_failures'] >= 5:
                if time.time() - s['last_failure'] < 60:
                    return False
            return True
        except Exception:
            return True

    def get_report(self) -> Dict[str, Any]:
        try:
            report = {}
            for provider, s in self.stats.items():
                total = s['successes'] + s['failures']
                avg_latency = (s['total_latency'] / s['successes']) if s['successes'] > 0 else 0
                report[provider] = {
                    'healthy': self.is_healthy(provider),
                    'success_rate': round((s['successes'] / max(total, 1)) * 100, 1),
                    'avg_latency_ms': round(avg_latency, 1),
                    'total_calls': total,
                    'consecutive_failures': s.get('consecutive_failures', 0),
                }
            return report
        except Exception:
            return {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DATA PROVIDER — Fournisseur de donnees principal
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DataProvider:
    """
    Fournisseur de donnees multi-source avec:
    - Retry exponentiel sur chaque appel API (3 tentatives)
    - Cache intelligent avec TTL adaptatif (killzone = TTL court)
    - Aggregation de bougies (M1 -> M5 -> M15 -> H1 -> H4 -> D1 -> W1)
    - Monitoring de la sante des connexions
    - Generation de donnees demo realistes avec volatilite, tendances,
      sessions et profils de volume
    """

    def __init__(self):
        self.cache: Dict[str, List[Dict]] = {}
        self.cache_ttl: Dict[str, float] = {}
        self.cache_meta: Dict[str, Dict[str, Any]] = {}
        self.limiters: Dict[str, RateLimiter] = {
            'twelve_data': RateLimiter(8, 60),
            'finnhub': RateLimiter(55, 60),
            'alpha_vantage': RateLimiter(5, 60),
            'oanda': RateLimiter(100, 60),
        }
        self.health = ConnectionHealthMonitor()
        self.client = httpx.AsyncClient(timeout=30.0)
        self._in_killzone = False
        logger.info("DataProvider initialise - Mode production")

    # ━━━ STATUS & HEALTH ━━━

    def get_status(self) -> Dict[str, Any]:
        try:
            return {
                'twelve_data': {
                    'configured': bool(TWELVE_DATA_API_KEY),
                    'remaining': self.limiters['twelve_data'].remaining,
                    'healthy': self.health.is_healthy('twelve_data'),
                },
                'oanda': {
                    'configured': bool(OANDA_API_KEY),
                    'remaining': self.limiters['oanda'].remaining,
                    'healthy': self.health.is_healthy('oanda'),
                },
                'finnhub': {
                    'configured': bool(FINNHUB_API_KEY),
                    'remaining': self.limiters['finnhub'].remaining,
                    'healthy': self.health.is_healthy('finnhub'),
                },
                'alpha_vantage': {
                    'configured': bool(ALPHA_VANTAGE_API_KEY),
                    'remaining': self.limiters['alpha_vantage'].remaining,
                    'healthy': self.health.is_healthy('alpha_vantage'),
                },
                'connection_health': self.health.get_report(),
                'cache_entries': len(self.cache),
                'killzone_mode': self._in_killzone,
            }
        except Exception as e:
            logger.error("Erreur get_status: %s", e)
            return {'error': str(e)}

    def set_killzone_mode(self, active: bool):
        """Active le mode killzone pour des TTL de cache plus courts."""
        self._in_killzone = active

    # ━━━ CACHE INTELLIGENT ━━━

    def _cache_key(self, instrument: str, timeframe: str) -> str:
        return f"{instrument}_{timeframe}"

    def _get_ttl(self, timeframe: str) -> float:
        """Retourne le TTL adaptatif: plus court pendant les killzones."""
        try:
            if self._in_killzone:
                return TTL_KILLZONE.get(timeframe, 30)
            return TTL_NORMAL.get(timeframe, 60)
        except Exception:
            return 60

    def _is_cached(self, key: str, max_age: Optional[float] = None) -> bool:
        try:
            if key not in self.cache:
                return False
            ttl = max_age if max_age is not None else 60.0
            return (time.time() - self.cache_ttl.get(key, 0)) < ttl
        except Exception:
            return False

    def _store_cache(self, key: str, candles: List[Dict], source: str):
        try:
            self.cache[key] = candles
            self.cache_ttl[key] = time.time()
            self.cache_meta[key] = {
                'source': source,
                'count': len(candles),
                'stored_at': time.time(),
            }
        except Exception:
            pass

    # ━━━ METHODE PRINCIPALE : GET CANDLES ━━━

    async def get_candles(self, instrument: str, timeframe: str, bars: int = 500) -> List[Dict]:
        """
        Recupere les bougies pour un instrument et timeframe donnes.
        Essaie dans l'ordre: cache -> aggregation -> TwelveData -> Finnhub -> Oanda -> Demo
        """
        try:
            cache_key = self._cache_key(instrument, timeframe)
            ttl = self._get_ttl(timeframe)

            # 1. Verifier le cache
            if self._is_cached(cache_key, ttl):
                return self.cache[cache_key]

            # 2. Essayer l'aggregation depuis un TF inferieur deja en cache
            aggregated = self._try_aggregate_from_cache(instrument, timeframe, bars)
            if aggregated:
                self._store_cache(cache_key, aggregated, 'aggregation')
                logger.info("Aggregation %s %s : %d bougies depuis le cache", instrument, timeframe, len(aggregated))
                return aggregated

            # 3. Essayer les APIs avec retry
            candles = await self._fetch_with_fallback(instrument, timeframe, bars)

            # 4. Stocker en cache
            source = 'api' if candles else 'demo'
            if not candles:
                candles = self._generate_demo_candles(instrument, timeframe, bars)
                source = 'demo'

            self._store_cache(cache_key, candles, source)
            return candles

        except Exception as e:
            logger.error("ERREUR CRITIQUE get_candles(%s, %s): %s", instrument, timeframe, e)
            return self._generate_demo_candles(instrument, timeframe, bars)

    async def _fetch_with_fallback(self, instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Essaie chaque source de donnees avec retry exponentiel."""
        try:
            # Source 1: TwelveData
            candles = await self._retry_fetch(
                self._fetch_twelve_data, 'twelve_data', instrument, timeframe, bars
            )
            if candles:
                return candles

            # Source 2: Finnhub
            candles = await self._retry_fetch(
                self._fetch_finnhub, 'finnhub', instrument, timeframe, bars
            )
            if candles:
                return candles

            # Source 3: Oanda
            candles = await self._retry_fetch(
                self._fetch_oanda, 'oanda', instrument, timeframe, bars
            )
            if candles:
                return candles

            return []
        except Exception as e:
            logger.error("Toutes les sources ont echoue pour %s %s: %s", instrument, timeframe, e)
            return []

    # ━━━ RETRY EXPONENTIEL ━━━

    async def _retry_fetch(self, fetch_fn, provider: str,
                           instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Execute une fonction fetch avec retry exponentiel (3 tentatives)."""
        for attempt in range(MAX_RETRIES):
            try:
                start_ms = time.time() * 1000
                candles = await fetch_fn(instrument, timeframe, bars)
                elapsed_ms = (time.time() * 1000) - start_ms

                if candles:
                    self.health.record_success(provider, elapsed_ms)
                    logger.info(
                        "OK %s | %s %s | %d bougies | %.0fms",
                        provider, instrument, timeframe, len(candles), elapsed_ms
                    )
                    return candles
                else:
                    # Pas de donnees mais pas d'erreur -> ne pas retry
                    return []

            except Exception as e:
                self.health.record_failure(provider, str(e))
                delay = BASE_RETRY_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    "Retry %d/%d %s (%s %s): %s — attente %.1fs",
                    attempt + 1, MAX_RETRIES, provider, instrument, timeframe, e, delay
                )
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(delay)

        return []

    # ━━━ SOURCES DE DONNEES ━━━

    async def _fetch_twelve_data(self, instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Recupere les bougies depuis TwelveData API."""
        if not TWELVE_DATA_API_KEY or not self.limiters['twelve_data'].can_call():
            return []
        if not self.health.is_healthy('twelve_data'):
            return []

        symbol = TWELVE_DATA_SYMBOLS.get(instrument, instrument)
        interval = TIMEFRAME_MAP.get(timeframe, '1h')
        url = "https://api.twelvedata.com/time_series"
        params = {
            'symbol': symbol,
            'interval': interval,
            'outputsize': min(bars, 5000),
            'apikey': TWELVE_DATA_API_KEY,
            'format': 'JSON',
        }

        self.limiters['twelve_data'].record()
        resp = await self.client.get(url, params=params)
        data = resp.json()

        if 'values' not in data:
            logger.debug("TwelveData: pas de 'values' pour %s %s — reponse: %s",
                         instrument, timeframe, str(data.get('message', ''))[:100])
            return []

        candles = []
        for v in reversed(data['values']):
            try:
                if ' ' in v['datetime']:
                    ts = int(time.mktime(time.strptime(v['datetime'][:19], '%Y-%m-%d %H:%M:%S')))
                else:
                    ts = int(time.mktime(time.strptime(v['datetime'], '%Y-%m-%d')))
                candles.append({
                    'time': ts,
                    'open': float(v['open']),
                    'high': float(v['high']),
                    'low': float(v['low']),
                    'close': float(v['close']),
                    'volume': float(v.get('volume', 0)),
                })
            except (ValueError, KeyError):
                continue

        return candles

    async def _fetch_finnhub(self, instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Recupere les bougies depuis Finnhub API."""
        if not FINNHUB_API_KEY or not self.limiters['finnhub'].can_call():
            return []
        if not self.health.is_healthy('finnhub'):
            return []

        symbol_map = {
            'EURUSD': 'OANDA:EUR_USD', 'XAUUSD': 'OANDA:XAU_USD',
            'NAS100': 'FOREXCOM:NSXUSD', 'DXY': 'TVC:DXY',
        }
        res_map = {'W1': 'W', 'D1': 'D', 'H4': '240', 'H1': '60', 'M15': '15', 'M5': '5', 'M1': '1'}

        symbol = symbol_map.get(instrument)
        resolution = res_map.get(timeframe)
        if not symbol or not resolution:
            return []

        now = int(time.time())
        from_ts = now - (bars * TF_SECONDS.get(timeframe, 3600))
        url = "https://finnhub.io/api/v1/stock/candle"
        params = {'symbol': symbol, 'resolution': resolution, 'from': from_ts, 'to': now, 'token': FINNHUB_API_KEY}

        self.limiters['finnhub'].record()
        resp = await self.client.get(url, params=params)
        data = resp.json()

        if data.get('s') != 'ok':
            return []

        candles = []
        timestamps = data.get('t', [])
        for i in range(len(timestamps)):
            try:
                candles.append({
                    'time': data['t'][i],
                    'open': float(data['o'][i]),
                    'high': float(data['h'][i]),
                    'low': float(data['l'][i]),
                    'close': float(data['c'][i]),
                    'volume': float(data['v'][i]) if 'v' in data else 0,
                })
            except (IndexError, ValueError, KeyError):
                continue

        return candles

    async def _fetch_oanda(self, instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Recupere les bougies depuis Oanda API (pratique/demo)."""
        if not OANDA_API_KEY or not self.limiters['oanda'].can_call():
            return []
        if not self.health.is_healthy('oanda'):
            return []

        symbol_map = {
            'EURUSD': 'EUR_USD', 'XAUUSD': 'XAU_USD',
            'NAS100': 'NAS100_USD', 'DXY': None,
        }
        gran_map = {'W1': 'W', 'D1': 'D', 'H4': 'H4', 'H1': 'H1', 'M15': 'M15', 'M5': 'M5', 'M1': 'M1'}

        symbol = symbol_map.get(instrument)
        gran = gran_map.get(timeframe)
        if not symbol or not gran:
            return []

        url = f"https://api-fxpractice.oanda.com/v3/instruments/{symbol}/candles"
        headers = {'Authorization': f'Bearer {OANDA_API_KEY}'}
        params = {'count': min(bars, 5000), 'granularity': gran, 'price': 'M'}

        self.limiters['oanda'].record()
        resp = await self.client.get(url, headers=headers, params=params)
        data = resp.json()

        candles = []
        for c in data.get('candles', []):
            try:
                if not c.get('complete', True):
                    continue
                mid = c['mid']
                candles.append({
                    'time': int(time.mktime(time.strptime(c['time'][:19], '%Y-%m-%dT%H:%M:%S'))),
                    'open': float(mid['o']),
                    'high': float(mid['h']),
                    'low': float(mid['l']),
                    'close': float(mid['c']),
                    'volume': int(c.get('volume', 0)),
                })
            except (ValueError, KeyError):
                continue

        return candles

    # ━━━ AGGREGATION DE TIMEFRAMES ━━━
    # Permet de construire M5 depuis M1, M15 depuis M5, etc.
    # Economise les appels API en reutilisant les donnees deja en cache.

    def _try_aggregate_from_cache(self, instrument: str, timeframe: str, bars: int) -> Optional[List[Dict]]:
        """Tente d'agreger les bougies depuis un TF inferieur en cache."""
        try:
            agg_info = TF_AGGREGATION_MAP.get(timeframe)
            if not agg_info:
                return None

            source_tf = agg_info['source']
            factor = agg_info['factor']
            source_key = self._cache_key(instrument, source_tf)

            if source_key not in self.cache:
                return None

            source_candles = self.cache[source_key]
            needed = bars * factor
            if len(source_candles) < factor:
                return None

            return self.aggregate_candles(source_candles[-needed:], factor)
        except Exception:
            return None

    @staticmethod
    def aggregate_candles(candles: List[Dict], factor: int) -> List[Dict]:
        """
        Agregation de bougies: combine 'factor' bougies en 1.
        Ex: 5 bougies M1 -> 1 bougie M5
        """
        try:
            if not candles or factor < 1:
                return []

            aggregated = []
            for i in range(0, len(candles) - factor + 1, factor):
                chunk = candles[i:i + factor]
                if not chunk:
                    continue
                agg = {
                    'time': chunk[0]['time'],
                    'open': chunk[0]['open'],
                    'high': max(c['high'] for c in chunk),
                    'low': min(c['low'] for c in chunk),
                    'close': chunk[-1]['close'],
                    'volume': sum(c.get('volume', 0) for c in chunk),
                }
                aggregated.append(agg)

            return aggregated
        except Exception:
            return []

    # ━━━ GENERATEUR DE DONNEES DEMO REALISTES ━━━
    # Produit des bougies avec:
    # - Tendances directionnelles (trend + mean reversion)
    # - Volatilite variable par session (Asia faible, London/NY forte)
    # - Profil de volume realiste par session
    # - Patterns de bougies realistes (ratio body/wick)
    # - Cycles de marche (accumulation/distribution)

    def _generate_demo_candles(self, instrument: str, timeframe: str, bars: int) -> List[Dict]:
        """Genere des bougies demo ultra-realistes avec volatilite de marche."""
        try:
            base_prices = {
                'EURUSD': 1.0850, 'XAUUSD': 2350.0, 'NAS100': 18500.0, 'DXY': 104.50,
            }
            volatilities = {
                'EURUSD': 0.0015, 'XAUUSD': 15.0, 'NAS100': 100.0, 'DXY': 0.30,
            }
            # Volatilite par session (multiplicateur)
            session_vol_profile = {
                'asia':   0.4,   # Session calme
                'london': 1.2,   # Session volatile
                'ny_am':  1.5,   # NY open = pic de volatilite
                'ny_pm':  0.8,   # Apres-midi plus calme
                'off':    0.3,   # Hors session
            }
            # Volume moyen par session
            session_volume_profile = {
                'asia':   1500,
                'london': 5000,
                'ny_am':  8000,
                'ny_pm':  4000,
                'off':    800,
            }

            base = base_prices.get(instrument, 1.0)
            vol = volatilities.get(instrument, 0.001)
            interval = TF_SECONDS.get(timeframe, 3600)
            now = int(time.time())
            candles = []
            price = base

            # Etat du marche pour la generation
            rng = random.Random(hash(f"{instrument}_{timeframe}_apex"))  # Seed deterministe mais unique
            trend = 0.0          # Direction de la tendance (-1 a +1)
            trend_duration = 0   # Bougies restantes dans la tendance actuelle
            cycle_phase = 0.0    # Phase du cycle de marche (0 a 2*pi)

            for i in range(bars):
                ts = now - (bars - i) * interval

                # --- Determiner la session pour cette bougie ---
                session = self._get_session_for_timestamp(ts)
                vol_mult = session_vol_profile.get(session, 0.5)
                base_volume = session_volume_profile.get(session, 2000)

                # --- Gestion de la tendance ---
                if trend_duration <= 0:
                    # Nouvelle tendance
                    trend = rng.uniform(-0.6, 0.6)
                    trend_duration = rng.randint(20, 80)
                trend_duration -= 1

                # --- Cycle de marche (sinusoidal long terme) ---
                cycle_phase += 0.02
                cycle_component = math.sin(cycle_phase) * vol * 0.1

                # --- Mean reversion douce ---
                reversion = (base - price) * 0.001

                # --- Mouvement du prix ---
                noise = rng.gauss(0, vol * vol_mult * 0.3)
                drift = trend * vol * 0.05 + reversion + cycle_component
                change = noise + drift

                # --- Construction de la bougie ---
                o = price
                c = o + change

                # Wick realiste: proportionnel a la volatilite de session
                wick_up = abs(rng.gauss(0, vol * vol_mult * 0.4))
                wick_down = abs(rng.gauss(0, vol * vol_mult * 0.4))

                h = max(o, c) + wick_up
                l = min(o, c) - wick_down

                # Volume avec variation realiste
                vol_noise = rng.gauss(1.0, 0.3)
                volume = max(50, int(base_volume * max(0.2, vol_noise)))

                # Spike de volume occasionnel (simule news ou breakout)
                if rng.random() < 0.03:  # 3% de chance
                    volume = int(volume * rng.uniform(2.5, 5.0))
                    # Bougie impulsive pendant un spike
                    change *= rng.uniform(1.5, 3.0)
                    c = o + change
                    h = max(o, c) + wick_up * 0.3  # Peu de wick = impulsion
                    l = min(o, c) - wick_down * 0.3

                # Precision selon l'instrument
                precision = 5 if instrument in ('EURUSD', 'DXY') else (1 if instrument == 'XAUUSD' else 0)

                candles.append({
                    'time': ts,
                    'open': round(o, precision),
                    'high': round(h, precision),
                    'low': round(l, precision),
                    'close': round(c, precision),
                    'volume': volume,
                })
                price = c

            return candles

        except Exception as e:
            logger.error("Erreur generation demo: %s", e)
            # Fallback minimal
            now = int(time.time())
            return [
                {'time': now - (bars - i) * 3600, 'open': 1.0, 'high': 1.001,
                 'low': 0.999, 'close': 1.0, 'volume': 1000}
                for i in range(bars)
            ]

    @staticmethod
    def _get_session_for_timestamp(ts: int) -> str:
        """Determine la session de marche pour un timestamp donne (heure NY)."""
        try:
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            ny_hour = (dt.hour - 5) % 24  # Approximation EST

            if 20 <= ny_hour or ny_hour < 2:
                return 'asia'
            elif 2 <= ny_hour < 5:
                return 'london'
            elif 5 <= ny_hour < 8:
                return 'london'
            elif 8 <= ny_hour < 12:
                return 'ny_am'
            elif 12 <= ny_hour < 17:
                return 'ny_pm'
            else:
                return 'off'
        except Exception:
            return 'off'

    # ━━━ CALENDRIER ECONOMIQUE ━━━

    async def get_economic_calendar(self) -> List[Dict]:
        """Recupere le calendrier economique depuis Finnhub avec retry."""
        try:
            if not FINNHUB_API_KEY or not self.limiters['finnhub'].can_call():
                return []

            today = datetime.now().strftime('%Y-%m-%d')
            tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            url = "https://finnhub.io/api/v1/calendar/economic"
            params = {'from': today, 'to': tomorrow, 'token': FINNHUB_API_KEY}

            candles = await self._retry_fetch(
                self._fetch_calendar_internal, 'finnhub',
                today, tomorrow, 0  # dummy args pour le format
            )
            return candles if candles else []

        except Exception as e:
            logger.error("Erreur calendrier: %s", e)
            return []

    async def _fetch_calendar_internal(self, today: str, tomorrow: str, _bars: int) -> List[Dict]:
        """Fetch interne pour le calendrier (compatible avec _retry_fetch)."""
        if not FINNHUB_API_KEY or not self.limiters['finnhub'].can_call():
            return []

        url = "https://finnhub.io/api/v1/calendar/economic"
        # Utiliser today/tomorrow comme instrument/timeframe (hack pour retry_fetch)
        from_date = today  # C'est en fait le premier arg
        to_date = tomorrow  # C'est en fait le deuxieme arg

        params = {'from': from_date, 'to': to_date, 'token': FINNHUB_API_KEY}

        self.limiters['finnhub'].record()
        resp = await self.client.get(url, params=params)
        data = resp.json()

        events = []
        impact_map = {1: 'LOW', 2: 'MEDIUM', 3: 'HIGH'}
        for e in data.get('economicCalendar', []):
            try:
                events.append({
                    'name': e.get('event', ''),
                    'currency': e.get('country', ''),
                    'impact': impact_map.get(e.get('impact', 1), 'LOW'),
                    'time': e.get('time', ''),
                    'actual': e.get('actual'),
                    'forecast': e.get('estimate'),
                    'previous': e.get('prev'),
                })
            except Exception:
                continue

        return events

    async def get_economic_calendar_safe(self) -> List[Dict]:
        """Version safe du calendrier qui ne crash jamais."""
        try:
            if not FINNHUB_API_KEY or not self.limiters['finnhub'].can_call():
                return []

            today = datetime.now().strftime('%Y-%m-%d')
            tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            url = "https://finnhub.io/api/v1/calendar/economic"
            params = {'from': today, 'to': tomorrow, 'token': FINNHUB_API_KEY}

            for attempt in range(MAX_RETRIES):
                try:
                    self.limiters['finnhub'].record()
                    resp = await self.client.get(url, params=params)
                    data = resp.json()

                    events = []
                    impact_map = {1: 'LOW', 2: 'MEDIUM', 3: 'HIGH'}
                    for e in data.get('economicCalendar', []):
                        try:
                            events.append({
                                'name': e.get('event', ''),
                                'currency': e.get('country', ''),
                                'impact': impact_map.get(e.get('impact', 1), 'LOW'),
                                'time': e.get('time', ''),
                                'actual': e.get('actual'),
                                'forecast': e.get('estimate'),
                                'previous': e.get('prev'),
                            })
                        except Exception:
                            continue
                    return events

                except Exception as e:
                    delay = BASE_RETRY_DELAY * (2 ** attempt)
                    logger.warning("Retry calendrier %d/%d: %s", attempt + 1, MAX_RETRIES, e)
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(delay)

            return []

        except Exception as e:
            logger.error("Erreur calendrier: %s", e)
            return []

    # ━━━ PRELOAD ━━━

    async def preload(self, instruments: List[str], timeframes: List[str]):
        """Pre-charge les bougies pour tous les instruments et timeframes."""
        try:
            logger.info("Pre-chargement: %s x %s", instruments, timeframes)
            tasks = []
            for inst in instruments:
                for tf in timeframes:
                    tasks.append(self.get_candles(inst, tf, 500))

            results = await asyncio.gather(*tasks, return_exceptions=True)
            success = sum(1 for r in results if isinstance(r, list) and len(r) > 0)
            logger.info("Pre-chargement termine: %d/%d reussis", success, len(tasks))
        except Exception as e:
            logger.error("Erreur preload: %s", e)
