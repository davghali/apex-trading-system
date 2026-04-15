import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Target, Zap,
  CheckCircle2, AlertCircle, Activity, ArrowRight,
  Crosshair, Layers, Waves, Eye, Compass, Shield, Ruler,
} from 'lucide-react';
import { useStore } from '@/store';

type BiasDir = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

// Regles specifiques par instrument
const TRADER_RULES: Record<string, { maxSLPips: number; rr: number; pipValue: number }> = {
  EURUSD: { maxSLPips: 15, rr: 2, pipValue: 10 },
  GBPUSD: { maxSLPips: 18, rr: 2, pipValue: 10 },
  XAUUSD: { maxSLPips: 30, rr: 2, pipValue: 10 },
  NAS100: { maxSLPips: 40, rr: 2, pipValue: 1 },
  US30:   { maxSLPips: 40, rr: 2, pipValue: 1 },
};

interface SessionPlan {
  name: 'LONDON' | 'NY_AM';
  label: string;
  hoursNY: string;
  hoursParis: string;
  active: boolean;
  upcoming: boolean;
  countdown: string;
  role: string; // MANIPULATION or DISTRIBUTION
  model: string;
  modelDesc: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  htfPOI: string; // Ce qu'on cherche sur HTF
  ltfConfirm: string; // BB+IFVG (toujours LTF confirmation)
  watchFor: string[];
  target: string;
  tradesRemaining: number;
}

export default function TradingCoach() {
  const weeklyBias = useStore((s) => s.weeklyBias);
  const dailyBias = useStore((s) => s.dailyBias);
  const po3 = useStore((s) => s.po3);
  const currentKillzone = useStore((s) => s.currentKillzone);
  const nextKillzone = useStore((s) => s.nextKillzone);
  const liquidityMap = useStore((s) => s.liquidityMap);
  const activePOIs = useStore((s) => s.activePOICount);
  const correlation = useStore((s) => s.correlation);
  const smtDivergence = useStore((s) => s.smtDivergence);
  const instrument = useStore((s) => s.instrument);

  const bias: BiasDir = (dailyBias?.direction || 'NEUTRAL') as BiasDir;
  const weeklyDir: BiasDir = (weeklyBias?.direction || 'NEUTRAL') as BiasDir;
  const biasAligned = bias === weeklyDir && bias !== 'NEUTRAL';
  const rules = TRADER_RULES[instrument] || { maxSLPips: 20, rr: 2, pipValue: 10 };
  const isEUR = instrument === 'EURUSD';

  // Sessions (London + NY)
  const sessions: SessionPlan[] = useMemo(() => {
    const currentName = currentKillzone?.name;
    const isLondonActive = currentName === 'LONDON';
    const isNYActive = currentName === 'NY_AM';
    const nextName = nextKillzone?.name;
    const nextIn = Math.floor((nextKillzone?.startsIn ?? 0) / 60);

    const formatIn = (min: number) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return h > 0 ? `${h}h${m}m` : `${m}m`;
    };

    const londonCountdown = isLondonActive
      ? `ACTIVE · ${Math.floor((currentKillzone?.remainingSeconds ?? 0) / 60)}m restant`
      : nextName === 'LONDON'
        ? `Dans ${formatIn(nextIn)}`
        : 'Plus tard';

    const nyCountdown = isNYActive
      ? `ACTIVE · ${Math.floor((currentKillzone?.remainingSeconds ?? 0) / 60)}m restant`
      : nextName === 'NY_AM'
        ? `Dans ${formatIn(nextIn)}`
        : 'Plus tard';

    // LONDON = MANIPULATION phase (sweep liquidite puis reverse)
    const london: SessionPlan = {
      name: 'LONDON',
      label: 'London Killzone',
      hoursNY: '02:00 - 05:00 NY',
      hoursParis: '08:00 - 11:00 Paris',
      active: isLondonActive,
      upcoming: nextName === 'LONDON',
      countdown: londonCountdown,
      role: 'MANIPULATION',
      model: bias === 'NEUTRAL' ? 'ATTENDRE BIAIS' : 'LONDON REVERSAL',
      modelDesc: bias === 'BULLISH'
        ? 'Sweep SSL (Asian Low / PDL) puis reversal BULLISH'
        : bias === 'BEARISH'
          ? 'Sweep BSL (Asian High / PDH) puis reversal BEARISH'
          : 'Attendre confirmation du biais',
      direction: bias === 'BULLISH' ? 'LONG' : bias === 'BEARISH' ? 'SHORT' : 'WAIT',
      htfPOI: bias === 'BULLISH' ? 'Bullish OB/FVG H4 ou Breaker H4' : bias === 'BEARISH' ? 'Bearish OB/FVG H4 ou Breaker H4' : 'N/A',
      ltfConfirm: 'BB + IFVG sur M15/M5',
      watchFor: bias === 'BULLISH' ? [
        '1. Prix descend sous PDL ou Asian Low (prise SSL)',
        '2. CHoCH bullish sur M15 → confirme le retournement',
        '3. Breaker Block forme (ancien bearish OB casse)',
        '4. Attendre IFVG bullish dans BB pour entree',
        '5. Entree au CE (50%) de l\'IFVG',
      ] : bias === 'BEARISH' ? [
        '1. Prix monte au-dessus PDH ou Asian High (prise BSL)',
        '2. CHoCH bearish sur M15 → confirme le retournement',
        '3. Breaker Block forme (ancien bullish OB casse)',
        '4. Attendre IFVG bearish dans BB pour entree',
        '5. Entree au CE (50%) de l\'IFVG',
      ] : [
        'Biais daily pas encore confirme',
        'Ne pas trader avant validation du biais',
      ],
      target: bias === 'BULLISH' ? 'PDH / Asian High (RR 2:1)' : bias === 'BEARISH' ? 'PDL / Asian Low (RR 2:1)' : 'N/A',
      tradesRemaining: 2,
    };

    // NY AM = DISTRIBUTION phase (vrai move - continuation)
    const ny: SessionPlan = {
      name: 'NY_AM',
      label: 'New York AM',
      hoursNY: '07:00 - 10:00 NY',
      hoursParis: '13:00 - 16:00 Paris',
      active: isNYActive,
      upcoming: nextName === 'NY_AM',
      countdown: nyCountdown,
      role: 'DISTRIBUTION',
      model: bias === 'NEUTRAL' ? 'ATTENDRE BIAIS' : 'NY CONTINUATION',
      modelDesc: bias === 'BULLISH'
        ? 'Continuation BULLISH - Pullback dans OB/FVG H4'
        : bias === 'BEARISH'
          ? 'Continuation BEARISH - Pullback dans OB/FVG H4'
          : 'Suivre ce que London a fait',
      direction: bias === 'BULLISH' ? 'LONG' : bias === 'BEARISH' ? 'SHORT' : 'WAIT',
      htfPOI: bias === 'BULLISH' ? 'Bullish OB + FVG H4 (pullback)' : bias === 'BEARISH' ? 'Bearish OB + FVG H4 (pullback)' : 'N/A',
      ltfConfirm: 'BB + IFVG sur M15/M5 (dans l\'OB H4)',
      watchFor: bias === 'BULLISH' ? [
        '1. Prix pullback dans Bullish OB + FVG H4',
        '2. Drill-down sur M15 → chercher mini sweep SSL',
        '3. CHoCH bullish sur M15 dans le pullback',
        '4. BB + IFVG bullish forme sur M15/M5',
        '5. Entree au CE (50%) de l\'IFVG',
      ] : bias === 'BEARISH' ? [
        '1. Prix pullback dans Bearish OB + FVG H4',
        '2. Drill-down sur M15 → chercher mini sweep BSL',
        '3. CHoCH bearish sur M15 dans le pullback',
        '4. BB + IFVG bearish forme sur M15/M5',
        '5. Entree au CE (50%) de l\'IFVG',
      ] : [
        'Suivre la direction donnee par London',
        'Si London a reverse, continuer dans ce sens',
      ],
      target: bias === 'BULLISH' ? 'PDH ou BSL suivant (RR 2:1)' : bias === 'BEARISH' ? 'PDL ou SSL suivant (RR 2:1)' : 'N/A',
      tradesRemaining: 2,
    };

    return [london, ny];
  }, [bias, currentKillzone, nextKillzone]);

  // Criteres A+ (H4 minimum pour HTF POI, LTF confirmation BB+IFVG, liquidite time-based)
  const aPlusCriteria = useMemo(() => {
    const bsl = liquidityMap?.bsl || [];
    const ssl = liquidityMap?.ssl || [];
    const sweptBSL = bsl.filter((l: any) => l.swept).length;
    const sweptSSL = ssl.filter((l: any) => l.swept).length;
    const hasLiquiditySweep = sweptBSL > 0 || sweptSSL > 0;

    return [
      {
        label: 'Biais Daily confirme',
        desc: bias !== 'NEUTRAL' ? `${bias} (${dailyBias?.conviction})` : 'Attente',
        done: bias !== 'NEUTRAL' && (dailyBias?.conviction === 'HIGH' || dailyBias?.conviction === 'MEDIUM'),
        icon: Compass,
      },
      {
        label: 'TF Alignment (D > H4 > H1)',
        desc: biasAligned ? 'Weekly + Daily alignes' : 'Alignement incomplet',
        done: biasAligned,
        icon: Layers,
      },
      {
        label: 'HTF POI identifie (H4+)',
        desc: activePOIs > 0 ? `${activePOIs} POIs H4+ actifs` : 'Aucun POI H4+',
        done: activePOIs > 0,
        icon: Target,
      },
      {
        label: 'Liquidite time-based swept',
        desc: hasLiquiditySweep ? `${sweptBSL + sweptSSL} niveaux (PDH/PDL/PWH/PWL/PMH/PML)` : 'Aucun sweep recent',
        done: hasLiquiditySweep,
        icon: Waves,
      },
      {
        label: 'PO3 Phase active',
        desc: po3?.current && po3.current !== 'NONE' ? `${po3.current}` : 'Pas de phase claire',
        done: Boolean(po3?.current && po3.current !== 'NONE'),
        icon: Activity,
      },
      ...(isEUR ? [{
        label: 'DXY Correlation (EURUSD)',
        desc: correlation === 'CONFIRMS'
          ? 'DXY confirme inversement'
          : smtDivergence
            ? 'SMT Divergence detectee'
            : 'DXY diverge ou pas verifie',
        done: correlation === 'CONFIRMS' || Boolean(smtDivergence),
        icon: Zap,
      }] : [{
        label: 'SMT Divergence (DXY)',
        desc: smtDivergence ? 'Divergence detectee' : 'Pas de SMT',
        done: Boolean(smtDivergence),
        icon: Zap,
      }]),
    ];
  }, [bias, dailyBias, biasAligned, po3, activePOIs, liquidityMap, smtDivergence, correlation, isEUR]);

  const criteriaMet = aPlusCriteria.filter(c => c.done).length;
  const totalCriteria = aPlusCriteria.length;
  const setupQuality = criteriaMet >= totalCriteria - 1 ? 'A+' : criteriaMet >= totalCriteria - 2 ? 'A' : criteriaMet >= 3 ? 'B' : 'NOT YET';

  return (
    <div className="space-y-4">
      {/* BIAIS DU JOUR — Header Master */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        className={`relative overflow-hidden rounded-2xl border-2 ${
          bias === 'BULLISH' ? 'border-ict-bullish' :
          bias === 'BEARISH' ? 'border-ict-bearish' :
          'border-ict-neutral'
        }`}
        style={{
          background: `linear-gradient(135deg,
            ${bias === 'BULLISH' ? 'rgba(0, 200, 83, 0.15)' : bias === 'BEARISH' ? 'rgba(255, 23, 68, 0.15)' : 'rgba(255, 214, 0, 0.15)'},
            rgba(10, 10, 15, 0.98))`,
        }}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className={`flex items-center justify-center w-16 h-16 rounded-xl ${
              bias === 'BULLISH' ? 'bg-ict-bullish/20 border border-ict-bullish/40' :
              bias === 'BEARISH' ? 'bg-ict-bearish/20 border border-ict-bearish/40' :
              'bg-ict-neutral/20 border border-ict-neutral/40'
            }`}>
              {bias === 'BULLISH' && <TrendingUp size={32} className="text-ict-bullish" />}
              {bias === 'BEARISH' && <TrendingDown size={32} className="text-ict-bearish" />}
              {bias === 'NEUTRAL' && <Activity size={32} className="text-ict-neutral" />}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-1">
                Plan du Jour · {instrument}
              </div>
              <h2 className={`text-3xl font-bold ${
                bias === 'BULLISH' ? 'text-ict-bullish' :
                bias === 'BEARISH' ? 'text-ict-bearish' :
                'text-ict-neutral'
              }`}>
                BIAIS {bias}
              </h2>
              <p className="text-sm text-ict-muted mt-1">
                Weekly: <span className={weeklyDir === bias ? 'text-ict-bullish' : 'text-ict-muted'}>{weeklyDir}</span>
                <span className="mx-2">·</span>
                Daily: <span className="font-medium text-ict-text">{bias}</span> ({dailyBias?.conviction || 'LOW'})
                <span className="mx-2">·</span>
                PO3: <span className="text-ict-accent">{po3?.current || 'NONE'}</span>
              </p>
            </div>
          </div>

          {/* Setup Quality + Rules */}
          <div className="flex items-center gap-6">
            <div className="text-right border-r border-ict-border/50 pr-6">
              <div className="text-[10px] uppercase tracking-widest text-ict-muted mb-1">Regles</div>
              <div className="text-xs text-ict-text space-y-0.5">
                <div>RR: <span className="text-ict-bullish font-bold">{rules.rr}:1</span></div>
                <div>SL max: <span className="text-ict-bearish font-bold">{rules.maxSLPips} pips</span></div>
                <div>Trades: <span className="text-ict-accent font-bold">2/session</span></div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-widest text-ict-muted mb-1">
                Setup Quality
              </div>
              <div className={`text-4xl font-bold ${
                setupQuality === 'A+' ? 'text-ict-bullish' :
                setupQuality === 'A' ? 'text-ict-bullish/80' :
                setupQuality === 'B' ? 'text-ict-neutral' :
                'text-ict-muted'
              }`}>
                {setupQuality}
              </div>
              <div className="text-xs text-ict-muted mt-1">
                {criteriaMet}/{totalCriteria} criteres
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2 SESSIONS: LONDON (Manipulation) + NY (Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sessions.map((session) => {
          const statusColor = session.active
            ? '#00BCD4'
            : session.upcoming
              ? '#FFD600'
              : '#6B7280';
          const statusLabel = session.active
            ? 'EN COURS'
            : session.upcoming
              ? 'A VENIR'
              : 'PLUS TARD';

          return (
            <motion.div
              key={session.name}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              className={`relative overflow-hidden rounded-2xl border ${
                session.active ? 'border-ict-accent shadow-glow' : 'border-ict-border/60'
              }`}
              style={{
                background: session.active
                  ? 'linear-gradient(135deg, rgba(0, 188, 212, 0.1), rgba(10, 10, 15, 0.98))'
                  : 'linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(10, 10, 15, 0.98))',
              }}
            >
              {session.active && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ict-accent via-ict-bullish to-ict-accent animate-pulse" />
              )}

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                        style={{ backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}
                      >
                        {statusLabel}
                      </span>
                      <h3 className="text-lg font-bold text-ict-text">{session.label}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-ict-muted/10 text-ict-muted uppercase tracking-wider">
                        {session.role}
                      </span>
                    </div>
                    <p className="text-xs text-ict-muted">
                      {session.hoursNY} · {session.hoursParis}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-ict-muted">Timing</div>
                    <div className="text-sm font-mono font-medium text-ict-text">
                      {session.countdown}
                    </div>
                  </div>
                </div>

                {/* Model */}
                <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-ict-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-widest text-ict-muted">Modele ICT</span>
                    {session.direction !== 'WAIT' && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        session.direction === 'LONG'
                          ? 'bg-ict-bullish/20 text-ict-bullish'
                          : 'bg-ict-bearish/20 text-ict-bearish'
                      }`}>
                        {session.direction}
                      </span>
                    )}
                  </div>
                  <div className="text-base font-semibold text-ict-accent">
                    {session.model}
                  </div>
                  <div className="text-xs text-ict-text/70 mt-1">
                    {session.modelDesc}
                  </div>
                </div>

                {/* TF Alignment: HTF POI + LTF Confirmation */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers size={12} className="text-ict-accent" />
                    <span className="text-[10px] uppercase tracking-widest text-ict-muted">
                      Time Frame Alignment
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-ict-bullish/5 border border-ict-bullish/20">
                      <div className="text-[9px] uppercase text-ict-muted">HTF POI (H4+)</div>
                      <div className="text-[11px] text-ict-text font-medium">{session.htfPOI}</div>
                    </div>
                    <div className="p-2 rounded bg-ict-accent/5 border border-ict-accent/20">
                      <div className="text-[9px] uppercase text-ict-muted">LTF Confirmation</div>
                      <div className="text-[11px] text-ict-text font-medium">{session.ltfConfirm}</div>
                    </div>
                  </div>
                </div>

                {/* Etapes a suivre */}
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-widest text-ict-muted mb-2">
                    Etapes a suivre
                  </div>
                  <ul className="space-y-1.5">
                    {session.watchFor.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ict-text/80">
                        <ArrowRight size={12} className="text-ict-accent mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Target + Trades */}
                <div className="flex items-center justify-between pt-3 border-t border-ict-border/30">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-ict-muted">Target</div>
                    <div className="text-xs font-medium text-ict-text">{session.target}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-ict-muted">Max trades</div>
                    <div className="text-sm font-bold text-ict-bullish">2</div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CRITERES A+ + REGLES DU TRADER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Criteres A+ */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-ict-border/60"
          style={{ background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(10, 10, 15, 0.98))' }}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crosshair size={16} className="text-ict-accent" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-ict-text">
                  Criteres A+ Confirmation
                </h3>
              </div>
              <span className="text-xs text-ict-muted">
                {criteriaMet}/{totalCriteria} valides
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {aPlusCriteria.map((c, i) => {
                const CIcon = c.icon;
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      c.done
                        ? 'bg-ict-bullish/5 border-ict-bullish/30'
                        : 'bg-white/[0.02] border-ict-border/30'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {c.done
                          ? <CheckCircle2 size={16} className="text-ict-bullish" />
                          : <AlertCircle size={16} className="text-ict-muted" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CIcon size={11} className={c.done ? 'text-ict-bullish' : 'text-ict-muted'} />
                          <div className={`text-[11px] font-semibold ${c.done ? 'text-ict-text' : 'text-ict-muted'}`}>
                            {c.label}
                          </div>
                        </div>
                        <div className="text-[10px] text-ict-muted">
                          {c.desc}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Regles du Trader */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          className="relative overflow-hidden rounded-2xl border border-ict-bullish/30"
          style={{ background: 'linear-gradient(135deg, rgba(0, 200, 83, 0.05), rgba(10, 10, 15, 0.98))' }}
        >
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} className="text-ict-bullish" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-ict-text">
                Mes Regles
              </h3>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <Ruler size={12} className="text-ict-bullish mt-0.5" />
                <div>
                  <div className="text-ict-text font-semibold">RR 2:1 STRICT</div>
                  <div className="text-ict-muted">Pas de sortie prematuree</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield size={12} className="text-ict-bullish mt-0.5" />
                <div>
                  <div className="text-ict-text font-semibold">SL max {rules.maxSLPips} pips</div>
                  <div className="text-ict-muted">Sur {instrument}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Target size={12} className="text-ict-bullish mt-0.5" />
                <div>
                  <div className="text-ict-text font-semibold">2 trades MAX par session</div>
                  <div className="text-ict-muted">Par asset</div>
                </div>
              </div>
              {isEUR && (
                <div className="flex items-start gap-2">
                  <Zap size={12} className="text-ict-bullish mt-0.5" />
                  <div>
                    <div className="text-ict-text font-semibold">DXY Correlation OBLIGATOIRE</div>
                    <div className="text-ict-muted">Verifier inverse pour EURUSD</div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Eye size={12} className="text-ict-bullish mt-0.5" />
                <div>
                  <div className="text-ict-text font-semibold">Trader QUE en killzone</div>
                  <div className="text-ict-muted">London + NY uniquement</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* METHODOLOGIE RAPPEL */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        className="relative overflow-hidden rounded-xl border border-ict-border/40 bg-white/[0.02]"
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye size={14} className="text-ict-muted" />
            <span className="text-[11px] uppercase tracking-widest text-ict-muted font-semibold">
              Ma Methodologie ICT · 3 etapes
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="font-bold text-ict-accent mb-1">1. ANALYSE HTF (H4+)</div>
              <p className="text-ict-text/70 leading-relaxed">
                Biais Weekly + Daily + PO3. Identifier OB/FVG ou Breaker sur H4 et plus. Mapper la liquidite time-based (PDH, PDL, PWH, PWL, PMH, PML). Verifier DXY pour EURUSD.
              </p>
            </div>
            <div>
              <div className="font-bold text-ict-accent mb-1">2. ATTENTE KILLZONE</div>
              <p className="text-ict-text/70 leading-relaxed">
                <strong>London = MANIPULATION</strong> (sweep liquidite). <strong>NY = DISTRIBUTION</strong> (vrai move). Le prix doit venir au POI H4 ET sweeper la liquidite time-based.
              </p>
            </div>
            <div>
              <div className="font-bold text-ict-accent mb-1">3. CONFIRMATION LTF (M15/M5)</div>
              <p className="text-ict-text/70 leading-relaxed">
                Dans le POI HTF, attendre <strong>BB + IFVG</strong> sur UT confirmation. Entree au CE (50%) de l'IFVG. SL serre (max {rules.maxSLPips} pips sur {instrument}). TP a RR 2:1.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
