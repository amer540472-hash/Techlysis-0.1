/* Techlysis — configuration & static data (no build step, plain JS)
 * Everything here is a plain global under the `TL` namespace.
 */
'use strict';

window.TL = window.TL || {};

TL.VERSION = '0.1.0';

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */
TL.ASSET_KEYS = ['XAUUSD', 'EURUSD', 'USOIL', 'GBPJPY', 'BTCUSD', 'ETHUSD'];

TL.ASSETS = {
  XAUUSD: {
    name: 'Gold', ticker: 'XAUUSD', type: 'fx',
    twelveData: 'XAU/USD', yahoo: 'GC=F', stooq: 'xauusd',
    pip: 0.01, unit: 'USD/troy oz',
    brief: {
      headline: 'Gold is the classic safe-haven & inflation hedge.',
      drivers: [
        'Real interest rates (yields minus inflation) — the dominant long-term driver.',
        'US Dollar strength — gold is priced in USD, so a stronger dollar usually pressures gold.',
        'Geopolitical risk & fear — flight-to-safety buying in crises.',
        'Central-bank buying & ETF flows (GLD).',
        'Inflation expectations and Fed policy expectations.'
      ],
      sessions: [
        'Asia: often quiet, range-bound; watch Shanghai Gold Exchange open.',
        'London: the most liquid session for gold (fixings at 10:30 & 15:00 GMT).',
        'New York: US data, COMEX open, highest volatility; overlaps with London.'
      ],
      correlations: [
        'Inverse to USD & real yields.',
        'Inverse (rough) to risk-on equities; positive to silver.',
        'Often inversely correlated with risk sentiment vs. safe-haven demand.'
      ]
    }
  },
  EURUSD: {
    name: 'Euro / Dollar', ticker: 'EURUSD', type: 'fx',
    twelveData: 'EUR/USD', yahoo: 'EURUSD=X', stooq: 'eurusd',
    pip: 0.0001, unit: 'USD per EUR',
    brief: {
      headline: 'EURUSD is the most traded currency pair in the world.',
      drivers: [
        'ECB vs Fed policy divergence — rate expectations move the pair.',
        'Interest-rate differentials (2yr yields spread).',
        'Eurozone growth & inflation data (CPI, PMIs).',
        'US data: NFP, CPI, FOMC decisions & minutes.',
        'Risk sentiment — EURUSD can behave as a risk barometer.'
      ],
      sessions: [
        'Asia: thin liquidity, drift; news from China matters.',
        'London: most active; Eurozone data releases.',
        'New York: US data & Fed speakers; strong overlap with London (13:00–17:00 GMT).'
      ],
      correlations: [
        'Positive to risk sentiment, negative to USD strength.',
        'Highly sensitive to US-German yield spread.',
        'Inverse to DXY (US Dollar Index).'
      ]
    }
  },
  USOIL: {
    name: 'WTI Crude Oil', ticker: 'USOIL', type: 'fx',
    twelveData: 'WTI', yahoo: 'CL=F', stooq: 'cl.f',
    pip: 0.01, unit: 'USD/barrel',
    brief: {
      headline: 'WTI crude is driven by supply, demand, and geopolitics.',
      drivers: [
        'OPEC+ production decisions & quotas.',
        'US inventories (EIA weekly report Wed 10:30 ET, API Tue).',
        'Global demand / economic growth expectations.',
        'Geopolitical supply disruptions (Middle East, Russia, shipping lanes).',
        'USD strength and risk sentiment.'
      ],
      sessions: [
        'Asia: quieter; reacts to weekend headlines.',
        'London: European demand & inventory trading.',
        'New York: EIA/API data, pit close at 14:30 ET — the highest-volatility window.'
      ],
      correlations: [
        'Positive to inflation expectations.',
        'Inverse (often) to USD; positive to energy equities.',
        'Spillovers into CAD, NOK, RUB and airline/bond markets.'
      ]
    }
  },
  GBPJPY: {
    name: 'Pound / Yen', ticker: 'GBPJPY', type: 'fx',
    twelveData: 'GBP/JPY', yahoo: 'GBPJPY=X', stooq: 'gbpjpy',
    pip: 0.01, unit: 'JPY per GBP',
    brief: {
      headline: 'GBPJPY is a high-beta carry pair — a classic risk barometer.',
      drivers: [
        'BoE vs BoJ policy divergence (yield spread).',
        'Carry-trade flows: risk-on lifts GBPJPY, risk-off slams it.',
        'UK data: inflation, GDP, BoE decisions.',
        'BoJ intervention risk & yield-curve-control headlines.',
        'Global equity & bond-market risk appetite.'
      ],
      sessions: [
        'Asia: JPY crosses are most active here; Tokyo fix & BoJ watch.',
        'London: UK data & BoE speakers.',
        'New York: risk sentiment swings, US yields; thinner than Asia for JPY pairs.'
      ],
      correlations: [
        'Very sensitive to global risk sentiment & equity indices.',
        'Sensitive to UK-Japan yield spread.',
        'Often moves with EURJPY & USDJPY.'
      ]
    }
  },
  BTCUSD: {
    name: 'Bitcoin', ticker: 'BTCUSD', type: 'crypto',
    binance: 'BTCUSDT', twelveData: 'BTC/USD', yahoo: 'BTC-USD', coingecko: 'bitcoin',
    pip: 1, unit: 'USD',
    brief: {
      headline: 'Bitcoin trades 24/7 and is dominated by liquidity, halving cycles & risk appetite.',
      drivers: [
        'Spot ETF flows & institutional adoption.',
        'Halving supply cycles (approx. every 4 years).',
        'Global liquidity & USD strength.',
        'Risk sentiment — behaves like a high-beta risk asset.',
        'Regulatory headlines & exchange events.'
      ],
      sessions: [
        'Asia: strong flows; weekend moves matter (no TradFi anchor).',
        'London: European & institutional participation.',
        'New York: ETF flows, US macro data, highest volatility.'
      ],
      correlations: [
        'High beta to Nasdaq & risk appetite.',
        'Sensitive to USD & real yields.',
        'Inverse to DXY over many regimes.'
      ]
    }
  },
  ETHUSD: {
    name: 'Ethereum', ticker: 'ETHUSD', type: 'crypto',
    binance: 'ETHUSDT', twelveData: 'ETH/USD', yahoo: 'ETH-USD', coingecko: 'ethereum',
    pip: 0.1, unit: 'USD',
    brief: {
      headline: 'Ethereum is the leading smart-contract platform — higher beta than BTC.',
      drivers: [
        'Network activity, gas fees, DeFi & NFT usage.',
        'ETH supply dynamics (staking, burns via EIP-1559).',
        'Bitcoin correlation — BTC often leads, ETH amplifies.',
        'Layer-2 adoption & upgrade roadmap.',
        'Risk sentiment & crypto ETF flows.'
      ],
      sessions: [
        'Asia: active, liquid crypto session.',
        'London: European on-ramps & DeFi activity.',
        'New York: US ETF flows & macro-driven volatility.'
      ],
      correlations: [
        'Strongly correlated to BTC (high beta).',
        'Sensitive to risk appetite & Nasdaq.',
        'Ecosystem-specific catalysts decouple it at times.'
      ]
    }
  }
};

/* ------------------------------------------------------------------ *
 * Timeframes
 * ------------------------------------------------------------------ */
TL.TF_KEYS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

TL.TIMEFRAMES = {
  '1m':  { minutes: 1,    binance: '1m',   twelve: '1min',  yahoo: '1m',  yahooRange: '5d' },
  '3m':  { minutes: 3,    binance: '3m',   twelve: null,    yahoo: null,  aggregate: { base: '1m', factor: 3 }, baseYahooRange: '5d' },
  '5m':  { minutes: 5,    binance: '5m',   twelve: '5min',  yahoo: '5m',  yahooRange: '1mo' },
  '15m': { minutes: 15,   binance: '15m',  twelve: '15min', yahoo: '15m', yahooRange: '1mo' },
  '30m': { minutes: 30,   binance: '30m',  twelve: '30min', yahoo: '30m', yahooRange: '1mo' },
  '1h':  { minutes: 60,   binance: '1h',   twelve: '1h',    yahoo: '60m', yahooRange: '3mo' },
  '4h':  { minutes: 240,  binance: '4h',   twelve: '4h',    yahoo: null,  aggregate: { base: '1h', factor: 4 }, baseYahooRange: '6mo' },
  '1d':  { minutes: 1440, binance: '1d',   twelve: '1day',  yahoo: '1d',  yahooRange: '2y' }
};

TL.BAR_COUNTS = [100, 200, 300, 500];

/* ------------------------------------------------------------------ *
 * Default user settings (deep-merged with stored values)
 * ------------------------------------------------------------------ */
TL.DEFAULT_SETTINGS = {
  asset: 'XAUUSD',
  timeframe: '15m',
  barCount: 200,

  /* every chart layer + subcharts */
  overlays: {
    candles: true,
    volume: true,
    ema9: true,
    ema21: true,
    ema50: true,
    ema200: true,
    sma20: false,
    bb: false,
    vwap: true,
    pivots: false,
    swings: true,
    structure: true,
    bos: true,
    sr: true,
    supply: true,
    demand: true,
    fvg: true,
    orderBlocks: true,
    vp: true,
    fib: false,
    tradeLevels: true
  },

  /* which oscillator draws in the indicator subchart */
  indicator: 'RSI',

  tools: {
    fib: {
      showRet: true,
      showExt: true,
      ratios: '0.236,0.382,0.5,0.618,0.786',
      extRatios: '1.272,1.414,1.618,2.0,2.618'
    },
    chart: {
      defaultBars: 120,
      scrollSpeed: 2,
      zoomSpeed: 1.2,
      candleGap: 0.15
    },
    vp: {
      bins: 40,
      valueArea: 0.7,
      width: 60
    },
    swings: { strength: 2 },
    fvg: { lookback: 5 },
    bb: { period: 20, mult: 2 },
    rsi: { period: 14, ob: 70, os: 30 },
    trade: { riskFill: 'market', showTP2: true, showTP3: true }
  },

  risk: {
    account: 10000,
    riskPct: 1,
    slAtrMult: 1.5,
    tpRR: [2, 3, 5]
  },

  keys: {
    twelveDataKey: '',
    supabaseUrl: '',
    supabaseAnonKey: ''
  },

  journal: []
};

/* CORS proxies tried (in order) when a direct fetch is blocked. */
TL.CORS_PROXIES = [
  function direct(u) { return u; },
  function corsproxy(u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); },
  function allorigins(u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }
];

/* Marked as educational tooling only. */
TL.DISCLAIMER = 'Educational use only — not financial advice. Techlysis is a technical-analysis study tool and never constitutes a recommendation to buy or sell any asset. Trading involves substantial risk of loss.';
