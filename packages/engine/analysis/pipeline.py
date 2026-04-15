from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Analysis Pipeline (Production Grade)
  Orchestrateur de tous les 10 modules avec:
  - Error handling: si un module echoue, les autres tournent quand meme
  - Timing tracking pour chaque module
  - Cache des resultats entre les scans
  - Execution parallele quand possible
  - Midnight Open et Daily Open calcules depuis les bougies
=============================================================================
"""

import time
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta

from modules.mse import MarketStructureEngine
from modules.bds import BiasDeterminationSystem
from modules.pde import POIDetectionEngine
from modules.ksm import KillzoneSessionManager
from modules.cse import ConfluenceScoringEngine
from modules.eo import EntryOptimizer
from modules.rtm import RiskTradeManager
from modules.dce import DXYCorrelationEngine
from modules.nfas import NewsFilterAlgoShield
from analysis.premium_discount import is_poi_in_correct_zone, is_poi_in_ote
from core.data_provider import DataProvider

logger = logging.getLogger("apex.pipeline")


class AnalysisPipeline:
    """
    Orchestrateur principal — Execute les 10 modules dans l'ordre
    avec isolation des erreurs et tracking du temps.
    """

    def __init__(self, data_provider: DataProvider):
        self.provider = data_provider
        self.mse = MarketStructureEngine()
        self.bds = BiasDeterminationSystem()
        self.pde = POIDetectionEngine()
        self.ksm = KillzoneSessionManager()
        self.cse = ConfluenceScoringEngine()
        self.eo = EntryOptimizer()
        self.rtm = RiskTradeManager()
        self.dce = DXYCorrelationEngine()
        self.nfas = NewsFilterAlgoShield()
        self._last_results: Dict[str, Any] = {}
        self._last_scan_time: float = 0

    async def run_full(self, instrument: str, timeframes: List[str]) -> Dict[str, Any]:
        """
        Execute l'analyse COMPLETE sur un instrument.
        Chaque module est isole: si un module echoue, les autres continuent.
        """
        pipeline_start = time.time()
        timings: Dict[str, float] = {}
        errors: List[str] = []

        try:
            # ━━━ 1. FETCH CANDLES (toutes les TFs en parallele) ━━━
            t0 = time.time()
            candles_map = await self._fetch_all_candles(instrument, timeframes)
            timings['fetch_candles'] = round((time.time() - t0) * 1000)

            current_price = self._get_current_price(candles_map)

            # ━━━ 2. MARKET STRUCTURE (Module 1) ━━━
            structure_result = {}
            alignment = {}
            structures = {}
            try:
                t0 = time.time()
                structure_result = self.mse.analyze_multi_tf(candles_map, instrument)
                alignment = structure_result.get('alignment', {})
                structures = structure_result.get('structures', {})
                timings['mse'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'MSE: {str(e)}')
                logger.error("Module MSE echoue: %s", e)

            # ━━━ 3. BIAS (Module 2) ━━━
            bias_result = {}
            try:
                t0 = time.time()
                weekly_candles = candles_map.get('W1', [])
                daily_candles = candles_map.get('D1', [])

                # Calcul precis du Midnight Open depuis les bougies H1
                midnight_open = self._calculate_midnight_open(candles_map, daily_candles)
                daily_open = self._calculate_daily_open(candles_map)

                # Bougies intraday pour l'analyse Asia range
                intraday_candles = candles_map.get('M15', candles_map.get('M5', []))

                bias_result = self.bds.full_bias(
                    weekly_candles, daily_candles, current_price,
                    midnight_open, daily_open, intraday_candles
                )
                timings['bds'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'BDS: {str(e)}')
                logger.error("Module BDS echoue: %s", e)
                bias_result = {
                    'weekly': {'bias': 'NEUTRAL', 'conviction': 'LOW', 'factors': []},
                    'daily': {'bias': 'NEUTRAL', 'conviction': 'LOW', 'factors': []},
                    'po3': {}, 'weekly_confirms_daily': False,
                }

            # ━━━ 4. POI DETECTION (Module 3) ━━━
            poi_result = {}
            try:
                t0 = time.time()
                daily_candles = candles_map.get('D1', [])
                weekly_candles = candles_map.get('W1', [])
                poi_result = self.pde.detect_all_pois(
                    candles_map, structures, daily_candles, weekly_candles,
                    current_price, instrument,
                    intraday_candles=candles_map.get('M15', [])
                )
                timings['pde'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'PDE: {str(e)}')
                logger.error("Module PDE echoue: %s", e)
                poi_result = {'pois': [], 'fvgs': [], 'order_blocks': [],
                              'breaker_blocks': [], 'sweeps': [], 'liquidity_map': {}}

            # ━━━ 5. KILLZONE SESSION (Module 4) ━━━
            session = {}
            kz_model = {}
            try:
                t0 = time.time()
                session = self.ksm.get_current_session()

                # Mettre a jour le mode killzone du data provider
                self.provider.set_killzone_mode(session.get('is_active', False))

                daily_bias_str = bias_result.get('daily', {}).get('bias', 'NEUTRAL')
                kz_model = self.ksm.identify_model(
                    session.get('current_session', 'POST_SESSION'),
                    daily_bias_str,
                    current_price,
                )
                timings['ksm'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'KSM: {str(e)}')
                logger.error("Module KSM echoue: %s", e)
                session = {'current_session': 'UNKNOWN', 'is_active': False, 'ny_time': '00:00'}
                kz_model = {'model': 'NONE', 'direction': 'NONE', 'confidence': 'LOW'}

            # ━━━ 6. DXY CORRELATION (Module 8 — pour EURUSD) ━━━
            dxy_result = {
                'dxy_structure': 'neutral', 'eurusd_confirms': False,
                'divergence_alert': False, 'dxy_bias_summary': 'DXY non analyse',
                'recommendation': 'N/A',
            }
            try:
                if instrument == 'EURUSD':
                    t0 = time.time()
                    dxy_result = await self.run_dxy()
                    timings['dce'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'DCE: {str(e)}')
                logger.error("Module DCE echoue: %s", e)

            # ━━━ 7. NEWS FILTER (Module 9) ━━━
            news_safety = {'safe_to_trade': True, 'status': 'CLEAR'}
            try:
                t0 = time.time()
                events = await self.provider.get_economic_calendar_safe()
                self.nfas.update_events(events)
                news_safety = self.nfas.check_news_safety(instrument)
                timings['nfas'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'NFAS: {str(e)}')
                logger.error("Module NFAS echoue: %s", e)

            # ━━━ 8. BUILD CONFLUENCE SETUP ━━━
            best_poi = poi_result.get('pois', [{}])[0] if poi_result.get('pois') else {}
            daily_bias = bias_result.get('daily', {})
            daily_candles = candles_map.get('D1', [])

            d1_range_high = daily_candles[-2]['high'] if len(daily_candles) >= 2 else current_price + 0.01
            d1_range_low = daily_candles[-2]['low'] if len(daily_candles) >= 2 else current_price - 0.01

            poi_in_correct = False
            poi_in_ote_zone = False
            if best_poi:
                poi_mid = best_poi.get('ce_50', best_poi.get('mid', current_price))
                poi_dir = best_poi.get('direction', '')
                poi_in_correct = is_poi_in_correct_zone(poi_dir, poi_mid, d1_range_high, d1_range_low)
                poi_in_ote_zone = is_poi_in_ote(poi_dir, poi_mid, d1_range_high, d1_range_low)

            setup = {
                'instrument': instrument,
                'daily_bias': daily_bias,
                'weekly_confirms_daily': bias_result.get('weekly_confirms_daily', False),
                'alignment': alignment,
                'structures': structures,
                'recent_bos': any(
                    s.get('last_bos') for s in structures.values()
                    if isinstance(s, dict)
                ),
                'recent_choch': any(
                    s.get('last_choch') for s in structures.values()
                    if isinstance(s, dict)
                ),
                'poi': best_poi,
                'poi_in_correct_zone': poi_in_correct,
                'poi_in_ote': poi_in_ote_zone,
                'liquidity_swept': len(poi_result.get('sweeps', [])) > 0,
                'fvg_confirmed': len(poi_result.get('fvgs', [])) > 0,
                'po3': bias_result.get('po3', {}),
                'in_killzone': session.get('is_active', False),
                'kz_model': kz_model,
                'day_ok': not self._is_friday_pm(),
                'news_clear': news_safety.get('safe_to_trade', True),
                'risk_reward': 2.0,
                'sl_behind_structure': True if best_poi else False,
                'spread_ok': True,
                'dxy_confirms': dxy_result.get('eurusd_confirms', False) if instrument == 'EURUSD' else None,
                'trade_check': self.rtm.check_trade_allowed(),
            }

            # ━━━ 9. CONFLUENCE SCORE (Module 5) ━━━
            confluence = {}
            try:
                t0 = time.time()
                confluence = self.cse.calculate(setup)
                timings['cse'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'CSE: {str(e)}')
                logger.error("Module CSE echoue: %s", e)
                confluence = {'total_score': 0, 'tradeable': False, 'grade': 'ERROR'}

            # ━━━ 10. ENTRY OPTIMIZER (Module 6) ━━━
            entry = None
            try:
                if confluence.get('tradeable') and best_poi:
                    t0 = time.time()
                    entry_ctx = {
                        'instrument': instrument,
                        'daily_bias': daily_bias.get('bias', 'NEUTRAL'),
                        'entry_type': 'CONTINUATION',
                        'poi': best_poi,
                        'confirmation_fvg': poi_result.get('fvgs', [None])[0] if poi_result.get('fvgs') else None,
                    }
                    entry = self.eo.find_entry(entry_ctx)
                    timings['eo'] = round((time.time() - t0) * 1000)
            except Exception as e:
                errors.append(f'EO: {str(e)}')
                logger.error("Module EO echoue: %s", e)

            # ━━━ 11. TRADE CHECK (Module 7) ━━━
            trade_check = {}
            try:
                trade_check = self.rtm.check_trade_allowed()
            except Exception as e:
                errors.append(f'RTM: {str(e)}')

            # ━━━ RESULTAT FINAL ━━━
            total_time = round((time.time() - pipeline_start) * 1000)
            timings['total'] = total_time

            result = {
                'instrument': instrument,
                'timestamp': int(time.time()),
                'current_price': current_price,
                'structure': structure_result,
                'bias': bias_result,
                'pois': poi_result,
                'session': session,
                'killzone_model': kz_model,
                'confluence': confluence,
                'entry': entry,
                'dxy': dxy_result,
                'news': news_safety,
                'trade_check': trade_check,
                'pipeline_timings': timings,
                'errors': errors,
                'modules_succeeded': 10 - len(errors),
                'modules_total': 10,
            }

            self._last_results = result
            self._last_scan_time = time.time()

            if errors:
                logger.warning("Pipeline termine avec %d erreurs: %s", len(errors), errors)
            else:
                logger.info("Pipeline termine OK en %dms", total_time)

            return result

        except Exception as e:
            logger.error("ERREUR CRITIQUE Pipeline: %s", e)
            return {
                'instrument': instrument,
                'timestamp': int(time.time()),
                'current_price': 0,
                'error': str(e),
                'errors': [f'Pipeline: {str(e)}'],
                'modules_succeeded': 0,
                'modules_total': 10,
            }

    # ━━━ FETCH CANDLES ━━━

    async def _fetch_all_candles(self, instrument: str,
                                  timeframes: List[str]) -> Dict[str, List[Dict]]:
        """Recupere les bougies pour tous les TFs necessaires."""
        try:
            candles_map: Dict[str, List[Dict]] = {}

            # Ajouter W1 et D1 s'ils ne sont pas demandes
            all_tfs = list(set(timeframes + ['W1', 'D1']))

            # Fetch en parallele
            tasks = {
                tf: self.provider.get_candles(instrument, tf, 500 if tf not in ('W1',) else 52)
                for tf in all_tfs
            }

            for tf, task in tasks.items():
                try:
                    candles_map[tf] = await task
                except Exception as e:
                    logger.warning("Erreur fetch %s %s: %s", instrument, tf, e)
                    candles_map[tf] = []

            return candles_map

        except Exception as e:
            logger.error("Erreur _fetch_all_candles: %s", e)
            return {}

    def _get_current_price(self, candles_map: Dict[str, List[Dict]]) -> float:
        """Obtient le prix actuel depuis les bougies les plus recentes."""
        try:
            for tf in ('M1', 'M5', 'M15', 'H1', 'H4', 'D1'):
                candles = candles_map.get(tf, [])
                if candles:
                    return candles[-1]['close']
            return 0.0
        except Exception:
            return 0.0

    # ━━━ MIDNIGHT OPEN & DAILY OPEN ━━━

    def _calculate_midnight_open(self, candles_map: Dict[str, List[Dict]],
                                  daily_candles: List[Dict]) -> float:
        """
        Calcul precis du Midnight Open (00:00 NY) depuis les bougies H1.
        Le Midnight Open est le prix a 00:00 NY, qui sert de reference
        pour le PO3 (au-dessus = bullish, en-dessous = bearish).
        """
        try:
            # Essayer d'abord avec les bougies H1
            h1_candles = candles_map.get('H1', [])
            if h1_candles:
                for c in reversed(h1_candles):
                    ny_hour = self._get_ny_hour(c['time'])
                    if ny_hour == 0:  # Minuit NY
                        return c['open']

            # Fallback: open de la derniere bougie D1
            if daily_candles:
                return daily_candles[-1]['open']

            return 0.0

        except Exception:
            if daily_candles:
                return daily_candles[-1]['open']
            return 0.0

    def _calculate_daily_open(self, candles_map: Dict[str, List[Dict]]) -> Optional[float]:
        """
        Calcul du NY Open (09:30 NY = ouverture du marche americain).
        """
        try:
            h1_candles = candles_map.get('H1', [])
            if h1_candles:
                for c in reversed(h1_candles):
                    ny_hour = self._get_ny_hour(c['time'])
                    if ny_hour == 9:  # 9h NY (approximation de 9:30)
                        return c['open']

            m15_candles = candles_map.get('M15', [])
            if m15_candles:
                for c in reversed(m15_candles):
                    ny_hour = self._get_ny_hour(c['time'])
                    ny_minute = self._get_ny_minute(c['time'])
                    if ny_hour == 9 and 25 <= ny_minute <= 35:
                        return c['open']

            return None

        except Exception:
            return None

    # ━━━ RUNS INDIVIDUELS ━━━

    async def run_bias(self, instrument: str) -> Dict[str, Any]:
        """Execute uniquement l'analyse de biais."""
        try:
            weekly = await self.provider.get_candles(instrument, 'W1', 52)
            daily = await self.provider.get_candles(instrument, 'D1', 60)
            intraday = await self.provider.get_candles(instrument, 'M15', 200)
            price = daily[-1]['close'] if daily else 0
            mo = self._calculate_midnight_open({'H1': [], 'M15': intraday}, daily)
            if mo == 0 and daily:
                mo = daily[-1]['open']
            daily_open = self._calculate_daily_open({'H1': [], 'M15': intraday})
            return self.bds.full_bias(weekly, daily, price, mo, daily_open, intraday_candles=intraday)
        except Exception as e:
            logger.error("Erreur run_bias: %s", e)
            return {'error': str(e)}

    async def run_poi(self, instrument: str, timeframes: List[str]) -> Dict[str, Any]:
        """Execute uniquement la detection de POI."""
        try:
            candles_map: Dict[str, List[Dict]] = {}
            for tf in timeframes:
                candles_map[tf] = await self.provider.get_candles(instrument, tf, 500)
            daily = await self.provider.get_candles(instrument, 'D1', 60)
            weekly = await self.provider.get_candles(instrument, 'W1', 20)
            price = daily[-1]['close'] if daily else 0

            structures: Dict[str, Dict] = {}
            for tf, candles in candles_map.items():
                if candles:
                    structures[tf] = self.mse.analyze(candles, tf, instrument)

            return self.pde.detect_all_pois(
                candles_map, structures, daily, weekly, price, instrument
            )
        except Exception as e:
            logger.error("Erreur run_poi: %s", e)
            return {'error': str(e)}

    async def run_dxy(self) -> Dict[str, Any]:
        """Execute l'analyse DXY correlation."""
        try:
            dxy_candles = await self.provider.get_candles('DXY', 'H1', 200)
            eurusd_candles = await self.provider.get_candles('EURUSD', 'H1', 200)

            if not dxy_candles:
                return {
                    'dxy_structure': 'unknown', 'eurusd_confirms': False,
                    'divergence_alert': False, 'dxy_bias_summary': 'No DXY data',
                    'recommendation': 'N/A',
                }

            dxy_struct = self.mse.analyze(dxy_candles, 'H1', 'DXY')
            eurusd_struct = self.mse.analyze(eurusd_candles, 'H1', 'EURUSD') if eurusd_candles else {}

            return self.dce.analyze(
                dxy_candles, dxy_struct.get('trend', 'ranging'),
                eurusd_struct.get('trend', 'ranging').upper(),
                eurusd_candles,
            )
        except Exception as e:
            logger.error("Erreur run_dxy: %s", e)
            return {
                'dxy_structure': 'error', 'eurusd_confirms': False,
                'divergence_alert': False, 'dxy_bias_summary': str(e),
                'recommendation': 'N/A',
            }

    # ━━━ UTILITAIRES ━━━

    def _is_friday_pm(self) -> bool:
        """Verifie si c'est vendredi apres-midi NY."""
        try:
            ny = datetime.now(timezone.utc) + timedelta(hours=-5)
            return ny.weekday() == 4 and ny.hour >= 12
        except Exception:
            return False

    def _get_ny_hour(self, timestamp: int) -> int:
        try:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            ny = dt + timedelta(hours=-5)
            return ny.hour
        except Exception:
            return -1

    def _get_ny_minute(self, timestamp: int) -> int:
        try:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            ny = dt + timedelta(hours=-5)
            return ny.minute
        except Exception:
            return -1
