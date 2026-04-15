import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(env_path)

TWELVE_DATA_API_KEY = os.getenv('TWELVE_DATA_API_KEY', '')
OANDA_API_KEY = os.getenv('OANDA_API_KEY', '')
OANDA_ACCOUNT_ID = os.getenv('OANDA_ACCOUNT_ID', '')
FINNHUB_API_KEY = os.getenv('FINNHUB_API_KEY', '')
ALPHA_VANTAGE_API_KEY = os.getenv('ALPHA_VANTAGE_API_KEY', '')

RISK_PERCENT = float(os.getenv('RISK_PERCENT', '1.0'))
MAX_DAILY_TRADES = int(os.getenv('MAX_DAILY_TRADES', '2'))
MAX_DAILY_LOSS_PERCENT = float(os.getenv('MAX_DAILY_LOSS_PERCENT', '2.0'))
MAX_WEEKLY_LOSS_PERCENT = float(os.getenv('MAX_WEEKLY_LOSS_PERCENT', '5.0'))
CONFLUENCE_MIN_SCORE = int(os.getenv('CONFLUENCE_MIN_SCORE', '75'))
DEFAULT_RR = float(os.getenv('DEFAULT_RR', '2.0'))
BE_AT_RR = float(os.getenv('BE_AT_RR', '1.0'))
ACCOUNT_BALANCE = float(os.getenv('ACCOUNT_BALANCE', '10000'))

INSTRUMENT_CONFIG = {
    'EURUSD': {'pip_size': 0.0001, 'pip_value': 10.0, 'max_spread': 1.2, 'type': 'forex'},
    'XAUUSD': {'pip_size': 0.1, 'pip_value': 10.0, 'max_spread': 3.0, 'type': 'commodity'},
    'NAS100': {'pip_size': 1.0, 'pip_value': 1.0, 'max_spread': 2.0, 'type': 'index'},
    'DXY':    {'pip_size': 0.01, 'pip_value': 0, 'max_spread': 0, 'type': 'index'},
}

TWELVE_DATA_SYMBOLS = {
    'EURUSD': 'EUR/USD',
    'XAUUSD': 'XAU/USD',
    'NAS100': 'IXIC',
    'DXY': 'DXY',
}

TIMEFRAME_MAP = {
    'W1': '1week', 'D1': '1day', 'H4': '4h', 'H1': '1h',
    'M15': '15min', 'M5': '5min', 'M1': '1min',
}
