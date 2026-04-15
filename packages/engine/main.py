from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — Main Application (Production Grade)
  FastAPI avec:
  - Startup pre-load de toutes les donnees
  - CORS complet avec toutes les origines necessaires
  - Middleware de timing des requetes
  - Health check qui teste chaque module
=============================================================================
"""

import time
import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from core.data_provider import DataProvider

# ━━━ LOGGING ━━━
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("apex.main")

# ━━━ APPLICATION ━━━
app = FastAPI(
    title="APEX ICT Trading Engine",
    version="5.0.0",
    description="Moteur d'analyse ICT/SMC de niveau institutionnel — Production Grade",
)

# ━━━ CORS — Toutes les origines necessaires ━━━
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://hiddennova-ict.fr",
        "https://www.hiddennova-ict.fr",
        "https://apex-trading.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ━━━ DATA PROVIDER ━━━
data_provider = DataProvider()
app.state.data_provider = data_provider


# ━━━ MIDDLEWARE — Request Timing ━━━

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    """Ajoute un header X-Process-Time a chaque reponse."""
    start = time.time()
    try:
        response = await call_next(request)
        elapsed = round((time.time() - start) * 1000, 1)
        response.headers["X-Process-Time"] = f"{elapsed}ms"
        response.headers["X-Engine-Version"] = "5.0.0"
        return response
    except Exception as e:
        logger.error("Erreur middleware: %s", e)
        elapsed = round((time.time() - start) * 1000, 1)
        return Response(
            content=f'{{"error": "Internal Server Error", "time_ms": {elapsed}}}',
            status_code=500,
            headers={
                "X-Process-Time": f"{elapsed}ms",
                "Content-Type": "application/json",
            },
        )


# ━━━ STARTUP — Pre-load des donnees ━━━

@app.on_event("startup")
async def startup_preload():
    """Pre-charge les bougies pour tous les instruments au demarrage."""
    try:
        logger.info("=== APEX ICT Trading Engine v5.0 — Demarrage ===")
        instruments = ['EURUSD', 'XAUUSD', 'NAS100', 'DXY']
        timeframes = ['D1', 'H4', 'H1', 'M15']

        await data_provider.preload(instruments, timeframes)

        logger.info("=== Pret a trader ===")
    except Exception as e:
        logger.error("Erreur startup preload: %s", e)
        # Ne pas crasher l'app si le preload echoue


# ━━━ HEALTH CHECK ━━━

@app.get("/health")
async def health():
    """Health check complet qui teste chaque composant."""
    try:
        # Test du data provider
        provider_status = data_provider.get_status()
        provider_ok = True

        # Test des modules (imports)
        modules_ok = True
        module_tests = {}
        try:
            from modules.mse import MarketStructureEngine
            module_tests['mse'] = 'OK'
        except Exception as e:
            module_tests['mse'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.bds import BiasDeterminationSystem
            module_tests['bds'] = 'OK'
        except Exception as e:
            module_tests['bds'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.pde import POIDetectionEngine
            module_tests['pde'] = 'OK'
        except Exception as e:
            module_tests['pde'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.ksm import KillzoneSessionManager
            ksm = KillzoneSessionManager()
            session = ksm.get_current_session()
            module_tests['ksm'] = f'OK — {session.get("current_session", "?")}'
        except Exception as e:
            module_tests['ksm'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.cse import ConfluenceScoringEngine
            module_tests['cse'] = 'OK'
        except Exception as e:
            module_tests['cse'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.eo import EntryOptimizer
            module_tests['eo'] = 'OK'
        except Exception as e:
            module_tests['eo'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.rtm import RiskTradeManager
            module_tests['rtm'] = 'OK'
        except Exception as e:
            module_tests['rtm'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.dce import DXYCorrelationEngine
            module_tests['dce'] = 'OK'
        except Exception as e:
            module_tests['dce'] = f'FAIL: {e}'
            modules_ok = False

        try:
            from modules.nfas import NewsFilterAlgoShield
            module_tests['nfas'] = 'OK'
        except Exception as e:
            module_tests['nfas'] = f'FAIL: {e}'
            modules_ok = False

        all_ok = provider_ok and modules_ok

        return {
            "status": "ok" if all_ok else "degraded",
            "engine": "APEX ICT Trading Engine v5.0",
            "timestamp": int(time.time()),
            "providers": provider_status,
            "modules": module_tests,
            "all_modules_ok": modules_ok,
            "cache_entries": len(data_provider.cache),
        }

    except Exception as e:
        logger.error("Erreur health check: %s", e)
        return {
            "status": "error",
            "engine": "APEX ICT Trading Engine v5.0",
            "error": str(e),
            "timestamp": int(time.time()),
        }


# ━━━ ROUTES ━━━
app.include_router(router, prefix="")
