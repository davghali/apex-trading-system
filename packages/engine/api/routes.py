from __future__ import annotations

"""
=============================================================================
  APEX ICT TRADING SYSTEM — API Routes (Production Grade)
  Routes avec:
  - Error handling sur TOUTES les routes (try/except avec erreurs explicites)
  - Validation des requetes
  - Headers de timing dans les reponses
=============================================================================
"""

import time
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from api.models import (
    AnalyzeRequest, StructureRequest, BiasRequest,
    POIRequest, ConfluenceRequest, EntryRequest,
)
from analysis.pipeline import AnalysisPipeline

logger = logging.getLogger("apex.routes")

router = APIRouter()


# ━━━ HELPER ━━━

def get_provider(request: Request):
    """Recupere le DataProvider depuis l'etat de l'application."""
    try:
        return request.app.state.data_provider
    except Exception as e:
        logger.error("DataProvider non disponible: %s", e)
        raise HTTPException(status_code=500, detail="DataProvider non initialise")


def safe_response(data: Any, start_time: float) -> JSONResponse:
    """Cree une reponse JSON avec timing."""
    elapsed = round((time.time() - start_time) * 1000, 1)
    if isinstance(data, dict):
        data['_timing_ms'] = elapsed
    return JSONResponse(content=data, headers={"X-Process-Time": f"{elapsed}ms"})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ANALYSE COMPLETE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze")
async def full_analysis(req: AnalyzeRequest, request: Request):
    """Analyse complete — execute les 10 modules."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_full(req.instrument, req.timeframes)
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze",
                     "_timing_ms": round((time.time() - start) * 1000, 1)},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  STRUCTURE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/structure")
async def analyze_structure(req: StructureRequest, request: Request):
    """Analyse de la structure de marche multi-TF."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        candles_map: Dict[str, list] = {}
        for tf in req.timeframes:
            candles_map[tf] = await provider.get_candles(req.instrument, tf, 500)
        result = pipeline.mse.analyze_multi_tf(candles_map, req.instrument)
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/structure: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/structure"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BIAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/bias")
async def analyze_bias(req: BiasRequest, request: Request):
    """Analyse du biais directionnel (weekly + daily + PO3)."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_bias(req.instrument)
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/bias: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/bias"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POI
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/poi")
async def analyze_poi(req: POIRequest, request: Request):
    """Detection des Points d'Interet (OB, FVG, BB, IFVG)."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_poi(req.instrument, req.timeframes)
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/poi: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/poi"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  KILLZONE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/killzone")
async def analyze_killzone(request: Request):
    """Etat de la session et killzone actuelle."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = pipeline.ksm.get_current_session()
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/killzone: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/killzone"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CONFLUENCE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/confluence")
async def analyze_confluence(req: ConfluenceRequest, request: Request):
    """Score de confluence (/100) avec 42 criteres."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_full(req.instrument, ['D1', 'H4', 'H1', 'M15'])
        return safe_response({"confluence": result.get("confluence", {})}, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/confluence: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/confluence"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENTRY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/entry")
async def analyze_entry(req: EntryRequest, request: Request):
    """Point d'entree optimal avec TPs et lot size."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_full(req.instrument, ['D1', 'H4', 'H1', 'M15'])
        return safe_response({"entry": result.get("entry", {})}, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/entry: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/entry"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DXY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/dxy")
async def analyze_dxy(request: Request):
    """Analyse de correlation DXY/EURUSD avec SMT."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        result = await pipeline.run_dxy()
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/dxy: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/dxy"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NEWS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/analyze/news")
async def analyze_news(request: Request):
    """Verification de la securite news avec filtre par instrument."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        events = await provider.get_economic_calendar_safe()
        pipeline.nfas.update_events(events)
        result = pipeline.nfas.check_news_safety()
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /analyze/news: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/analyze/news"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DATA — CANDLES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/data/candles/{instrument}/{timeframe}")
async def get_candles(instrument: str, timeframe: str,
                      bars: int = 500, request: Request = None):
    """Recupere les bougies brutes pour un instrument/TF."""
    start = time.time()
    try:
        # Validation
        valid_instruments = {'EURUSD', 'XAUUSD', 'NAS100', 'DXY'}
        valid_tfs = {'W1', 'D1', 'H4', 'H1', 'M15', 'M5', 'M1'}

        if instrument not in valid_instruments:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Instrument invalide: {instrument}",
                    "valid": list(valid_instruments),
                },
            )
        if timeframe not in valid_tfs:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Timeframe invalide: {timeframe}",
                    "valid": list(valid_tfs),
                },
            )

        bars = min(max(1, bars), 5000)

        provider = get_provider(request)
        candles = await provider.get_candles(instrument, timeframe, bars)

        return safe_response({
            "instrument": instrument,
            "timeframe": timeframe,
            "count": len(candles),
            "candles": candles,
        }, start)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /data/candles: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/data/candles"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DATA — PROVIDER STATUS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/data/providers/status")
async def provider_status(request: Request):
    """Status des providers de donnees avec sante des connexions."""
    start = time.time()
    try:
        provider = get_provider(request)
        result = provider.get_status()
        return safe_response(result, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /data/providers/status: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/data/providers/status"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TRADE MANAGEMENT — Risk & Equity
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/trade/status")
async def trade_status(request: Request):
    """Status du gestionnaire de trades (RTM)."""
    start = time.time()
    try:
        provider = get_provider(request)
        pipeline = AnalysisPipeline(provider)
        check = pipeline.rtm.check_trade_allowed()
        equity = pipeline.rtm.get_equity_curve()
        return safe_response({
            "trade_check": check,
            "equity_curve": equity,
        }, start)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erreur /trade/status: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "endpoint": "/trade/status"},
        )
