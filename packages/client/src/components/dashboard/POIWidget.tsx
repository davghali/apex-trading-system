import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import { formatPrice } from '@/lib/formatters';
import type { POI, LiquidityLevel } from '@/store/slices/poiSlice';

function POITypeBadge({ type }: { type: string }) {
  const variant = type === 'OB' ? 'accent' : type === 'FVG' ? 'info' : type === 'BB' ? 'neutral' : 'muted';
  return <Badge variant={variant} size="xs">{type || '--'}</Badge>;
}

function TFBadge({ tf }: { tf: string }) {
  return (
    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-ict-border/20 text-ict-muted">
      {tf || '--'}
    </span>
  );
}

function POIRow({ poi, instrument }: { poi: POI; instrument: string }) {
  const isBuy = poi.side === 'BUY';
  const safeDistance = typeof poi.distance === 'number' && !isNaN(poi.distance) ? poi.distance : null;
  const safeStrength = typeof poi.strength === 'number' ? poi.strength : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`
        flex items-center justify-between py-1.5 px-2 rounded-lg
        ${isBuy ? 'bg-ict-bullish/[0.03]' : 'bg-ict-bearish/[0.03]'}
        hover:bg-white/[0.03] transition-colors
      `}
    >
      <div className="flex items-center gap-1.5">
        <POITypeBadge type={poi.type} />
        <TFBadge tf={poi.timeframe} />
        <span className="text-xs font-mono text-ict-text">
          {formatPrice(poi.priceHigh, instrument)}
          {poi.priceLow !== poi.priceHigh && (
            <span className="text-ict-muted"> - {formatPrice(poi.priceLow, instrument)}</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {safeDistance !== null && (
          <span className="text-[10px] font-mono text-ict-muted">
            {safeDistance.toFixed(1)}p
          </span>
        )}
        {/* Quality score dot */}
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: safeStrength > 70 ? '#00C853' : safeStrength > 40 ? '#FFD600' : '#6B7280',
            boxShadow: safeStrength > 70
              ? '0 0 6px rgba(0,200,83,0.5)'
              : safeStrength > 40
              ? '0 0 6px rgba(255,214,0,0.3)'
              : 'none',
          }}
        />
        <span className="text-[9px] font-mono text-ict-muted w-6 text-right">{safeStrength}%</span>
      </div>
    </motion.div>
  );
}

function LiquidityZone({
  levels,
  instrument,
  type,
}: {
  levels: LiquidityLevel[];
  instrument: string;
  type: 'above' | 'below';
}) {
  const isAbove = type === 'above';
  const filteredLevels = levels.filter((l) => !l.swept).slice(0, 3);

  if (filteredLevels.length === 0) return null;

  return (
    <div className={`px-2 py-1.5 rounded-lg ${
      isAbove
        ? 'bg-ict-bearish/[0.04] border border-ict-bearish/10'
        : 'bg-ict-bullish/[0.04] border border-ict-bullish/10'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        {isAbove ? (
          <ArrowUp size={10} className="text-ict-bearish" />
        ) : (
          <ArrowDown size={10} className="text-ict-bullish" />
        )}
        <span className={`text-[9px] font-semibold uppercase ${
          isAbove ? 'text-ict-bearish' : 'text-ict-bullish'
        }`}>
          {isAbove ? 'BSL / Sell-side' : 'SSL / Buy-side'}
        </span>
      </div>
      {filteredLevels.map((level, i) => (
        <div key={i} className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-ict-muted uppercase">{level.type}</span>
          </div>
          <span className="text-xs font-mono text-ict-text">{formatPrice(level.price, instrument)}</span>
        </div>
      ))}
    </div>
  );
}

export default function POIWidget() {
  try {
    const pois = useStore((s) => s.pois);
    const liquidityMap = useStore((s) => s.liquidityMap);
    const currentPrice = useStore((s) => s.currentPrice);
    const instrument = useStore((s) => s.instrument);

    const activePois = useMemo(
      () => (Array.isArray(pois) ? pois.filter((p) => !p.mitigated).slice(0, 8) : []),
      [pois]
    );

    const abovePois = activePois.filter((p) => p.priceHigh > currentPrice);
    const belowPois = activePois.filter((p) => p.priceLow <= currentPrice);

    const safeBSL = Array.isArray(liquidityMap?.bsl) ? liquidityMap.bsl : [];
    const safeSSL = Array.isArray(liquidityMap?.ssl) ? liquidityMap.ssl : [];

    return (
      <Card
        title="Points of Interest"
        accent="cyan"
        headerRight={
          <span className="text-[10px] font-mono text-ict-muted">{activePois.length} active</span>
        }
      >
        <div className="space-y-2">
          {/* BSL Zone */}
          <LiquidityZone levels={safeBSL} instrument={instrument} type="above" />

          {/* Above price POIs */}
          {abovePois.length > 0 && (
            <div className="space-y-1">
              {abovePois.map((poi) => (
                <POIRow key={poi.id} poi={poi} instrument={instrument} />
              ))}
            </div>
          )}

          {/* Current price line */}
          <div className="flex items-center gap-2 py-1.5">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ict-accent/50 to-transparent" />
            <motion.span
              className="text-xs font-mono font-bold text-ict-accent px-3 py-0.5 rounded-full bg-ict-accent/10 border border-ict-accent/20"
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {currentPrice > 0 ? formatPrice(currentPrice, instrument) : '---'}
            </motion.span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ict-accent/50 to-transparent" />
          </div>

          {/* Below price POIs */}
          {belowPois.length > 0 && (
            <div className="space-y-1">
              {belowPois.map((poi) => (
                <POIRow key={poi.id} poi={poi} instrument={instrument} />
              ))}
            </div>
          )}

          {/* SSL Zone */}
          <LiquidityZone levels={safeSSL} instrument={instrument} type="below" />

          {/* Empty state */}
          {activePois.length === 0 && safeBSL.length === 0 && safeSSL.length === 0 && (
            <div className="text-center py-4">
              <span className="text-xs text-ict-muted">No active POIs detected</span>
            </div>
          )}
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Points of Interest" accent="cyan">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load POI data</span>
        </div>
      </Card>
    );
  }
}
