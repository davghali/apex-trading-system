import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type Time,
} from 'lightweight-charts';
import { useStore } from '@/store';
import { CHART_COLORS } from '@/lib/colors';

interface TradingChartProps {
  className?: string;
  height?: number;
}

type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

// Generate demo candle data for visual display
function generateDemoCandles(count = 200, tf: Timeframe = 'H1'): CandlestickData[] {
  const candles: CandlestickData[] = [];
  let basePrice = 1.0850;
  const now = Math.floor(Date.now() / 1000);

  const intervals: Record<Timeframe, number> = {
    M1: 60,
    M5: 300,
    M15: 900,
    H1: 3600,
    H4: 14400,
    D1: 86400,
  };

  const interval = intervals[tf] || 3600;
  const volatilityMap: Record<Timeframe, number> = {
    M1: 0.0003,
    M5: 0.0005,
    M15: 0.0008,
    H1: 0.0015,
    H4: 0.003,
    D1: 0.005,
  };

  const volatility = volatilityMap[tf] || 0.0015;

  for (let i = 0; i < count; i++) {
    const time = (now - (count - i) * interval) as Time;
    const trend = Math.sin(i / 30) * 0.001;
    const change = (Math.random() - 0.48) * volatility + trend;

    const open = basePrice;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    candles.push({
      time,
      open: parseFloat(open.toFixed(5)),
      high: parseFloat(high.toFixed(5)),
      low: parseFloat(low.toFixed(5)),
      close: parseFloat(close.toFixed(5)),
    });

    basePrice = close;
  }

  return candles;
}

const timeframeButtons: { label: string; value: Timeframe }[] = [
  { label: 'M1', value: 'M1' },
  { label: 'M5', value: 'M5' },
  { label: 'M15', value: 'M15' },
  { label: 'H1', value: 'H1' },
  { label: 'H4', value: 'H4' },
  { label: 'D1', value: 'D1' },
];

export default function TradingChart({ className = '', height }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [selectedTF, setSelectedTF] = useState<Timeframe>('H1');

  const currentPrice = useStore((s) => s.currentPrice);
  const instrument = useStore((s) => s.instrument);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ignore */ }
      chartRef.current = null;
    }

    try {
      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: height || containerRef.current.clientHeight || 400,
        layout: {
          background: {
            type: ColorType.Solid,
            color: CHART_COLORS.background,
          },
          textColor: '#6B7280',
          fontSize: 11,
          fontFamily: "'Inter', system-ui, sans-serif",
        },
        grid: {
          vertLines: {
            color: 'rgba(42, 42, 74, 0.3)',
            style: 1,
          },
          horzLines: {
            color: 'rgba(42, 42, 74, 0.3)',
            style: 1,
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(0, 188, 212, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: '#1A1A2E',
          },
          horzLine: {
            color: 'rgba(0, 188, 212, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: '#1A1A2E',
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(42, 42, 74, 0.5)',
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: 'rgba(42, 42, 74, 0.5)',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: CHART_COLORS.upColor,
        downColor: CHART_COLORS.downColor,
        wickUpColor: CHART_COLORS.wickUp,
        wickDownColor: CHART_COLORS.wickDown,
        borderVisible: false,
        priceFormat: {
          type: 'price',
          precision: instrument.includes('JPY') ? 3 : instrument.includes('XAU') ? 2 : 5,
          minMove: instrument.includes('JPY') ? 0.001 : instrument.includes('XAU') ? 0.01 : 0.00001,
        },
      });

      // Load demo data for selected timeframe
      const demoData = generateDemoCandles(200, selectedTF);
      candleSeries.setData(demoData);

      // Add current price line if available
      if (currentPrice > 0) {
        try {
          priceLineRef.current = candleSeries.createPriceLine({
            price: currentPrice,
            color: '#00BCD4',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Current',
          });
        } catch { /* ignore price line errors */ }
      }

      chart.timeScale().fitContent();

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
    } catch (err) {
      console.error('[Chart] Failed to initialize:', err);
    }
  }, [instrument, selectedTF, height]);

  // Initialize chart
  useEffect(() => {
    initChart();

    return () => {
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [initChart]);

  // Update price line when price changes without re-creating chart
  useEffect(() => {
    if (!candleSeriesRef.current || currentPrice <= 0) return;

    try {
      // Remove old price line
      if (priceLineRef.current) {
        candleSeriesRef.current.removePriceLine(priceLineRef.current);
      }

      priceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: currentPrice,
        color: '#00BCD4',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Current',
      });
    } catch { /* ignore */ }
  }, [currentPrice]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartRef.current) {
          try {
            const { width, height: h } = entry.contentRect;
            chartRef.current.applyOptions({
              width,
              height: height || h,
            });
          } catch { /* ignore resize errors */ }
        }
      }
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [height]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-ict-border/30 bg-ict-bg ${className}`}>
      {/* Chart header overlay with TF selector */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <span className="text-xs font-semibold text-ict-text/60 bg-ict-bg/80 backdrop-blur-sm px-2 py-1 rounded">
          {instrument}
        </span>

        {/* Timeframe selector buttons */}
        <div className="flex items-center gap-0.5 bg-ict-bg/80 backdrop-blur-sm rounded-md p-0.5">
          {timeframeButtons.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setSelectedTF(value)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all ${
                selectedTF === value
                  ? 'bg-ict-accent/20 text-ict-accent'
                  : 'text-ict-muted hover:text-ict-text hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Current price display */}
      {currentPrice > 0 && (
        <div className="absolute top-3 right-4 z-10">
          <span className="text-xs font-mono font-bold text-ict-accent bg-ict-bg/80 backdrop-blur-sm px-2 py-1 rounded border border-ict-accent/20">
            {currentPrice.toFixed(instrument.includes('JPY') ? 3 : instrument.includes('XAU') ? 2 : 5)}
          </span>
        </div>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: height || '100%', minHeight: 300 }}
      />
    </div>
  );
}
