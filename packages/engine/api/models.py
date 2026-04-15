from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, List


class AnalyzeRequest(BaseModel):
    instrument: str = 'EURUSD'
    timeframes: List[str] = ['D1', 'H4', 'H1', 'M15']


class StructureRequest(BaseModel):
    instrument: str = 'EURUSD'
    timeframes: List[str] = ['D1', 'H4', 'H1']


class BiasRequest(BaseModel):
    instrument: str = 'EURUSD'


class POIRequest(BaseModel):
    instrument: str = 'EURUSD'
    timeframes: List[str] = ['H4', 'H1', 'M15']


class ConfluenceRequest(BaseModel):
    instrument: str = 'EURUSD'


class EntryRequest(BaseModel):
    instrument: str = 'EURUSD'


class CandleRequest(BaseModel):
    instrument: str = 'EURUSD'
    timeframe: str = 'H1'
    bars: int = 500
