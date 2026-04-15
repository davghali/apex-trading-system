import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Target, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, Activity, Zap, Shield, Timer,
  ArrowRight, DollarSign, BarChart3,
} from 'lucide-react';
import { useStore } from '@/store';

type Action = 'WAIT' | 'PREPARE' | 'SCAN' | 'READY' | 'MANAGE' | 'BLOCKED';

interface CoachDecision {
  action: Action;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  borderColor: string;
  icon: typeof Clock;
  countdown?: string;
  direction?: 'LONG' | 'SHORT' | null;
  steps: Array<{ done: boolean; text: string; active?: boolean }>;
  tradePlan?: {
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    slPips: number;
    lots: number;
    risk: number;
  };
  why: string[];
  whatNext: string;
}

export default function TradingCoach() {
  const weeklyBias = useStore((s) => s.weeklyBias);
  const dailyBias = useStore((s) => s.dailyBias);
  const po3 = useStore((s) => s.po3);
  const currentKillzone = useStore((s) => s.currentKillzone);
  const nextKillzone = useStore((s) => s.nextKillzone);
  const confluenceScore = useStore((s) => s.score);
  const confluenceGrade = useStore((s) => s.grade);
  const activePOIs = useStore((s) => s.activePOICount);
  const currentPrice = useStore((s) => s.currentPrice);
  const instrument = useStore((s) => s.instrument);

  const decision: CoachDecision = useMemo(() => {
    const kzActive = currentKillzone?.active ?? false;
    const kzName = currentKillzone?.label || currentKillzone?.name || 'Off Session';
    const remainingSec = (currentKillzone?.remainingSeconds ?? 0);
    const timeRemaining = Math.floor(remainingSec / 60); // minutes
    const nextKzName = nextKillzone?.label || nextKillzone?.name;
    const nextKzSec = nextKillzone?.startsIn ?? 0;
    const nextKzIn = Math.floor(nextKzSec / 60); // minutes
    const bias = dailyBias?.direction || 'NEUTRAL';
    const biasConv = dailyBias?.conviction || 'LOW';
    const weeklyDir = weeklyBias?.direction || 'NEUTRAL';
    const aligned = bias === weeklyDir && bias !== 'NEUTRAL';

    // HIGH CONVICTION SETUP READY
    if (confluenceScore >= 75 && kzActive && bias !== 'NEUTRAL') {
      const isLong = bias === 'BULLISH';
      return {
        action: 'READY',
        title: `OPPORTUNITE ${isLong ? 'LONG' : 'SHORT'} ${instrument}`,
        subtitle: `Setup Grade ${confluenceGrade} - ${confluenceScore}/100`,
        color: '#00C853',
        bg: 'from-green-500/20 to-emerald-500/10',
        borderColor: 'border-ict-bullish',
        icon: Target,
        direction: isLong ? 'LONG' : 'SHORT',
        steps: [
          { done: true, text: `Biais Daily ${bias} confirme (${biasConv})` },
          { done: aligned, text: `Biais Weekly ${aligned ? 'aligne' : 'diverge'}` },
          { done: true, text: `Killzone ${kzName} active` },
          { done: activePOIs > 0, text: `${activePOIs} POIs detectes` },
          { done: false, active: true, text: `Executer le trade maintenant` },
        ],
        why: [
          `Structure alignee (${confluenceScore}/100)`,
          `${kzName} - fenetre optimale`,
          `PO3: ${po3?.current || 'phase active'}`,
          `${activePOIs} zones d'interet identifiees`,
        ],
        whatNext: 'Execute le plan ci-dessous ou attends une meilleure entree',
      };
    }

    // SCAN - Killzone active, cherche opportunite
    if (kzActive) {
      const hrs = Math.floor(timeRemaining / 60);
      const mins = timeRemaining % 60;
      return {
        action: 'SCAN',
        title: `${kzName} ACTIVE - CHERCHE L'ENTREE`,
        subtitle: `Temps restant: ${hrs}h${mins}min`,
        color: '#00BCD4',
        bg: 'from-cyan-500/20 to-blue-500/10',
        borderColor: 'border-ict-accent',
        icon: Activity,
        countdown: `${hrs}h${mins}m`,
        direction: bias === 'BULLISH' ? 'LONG' : bias === 'BEARISH' ? 'SHORT' : null,
        steps: [
          { done: true, text: `Killzone ${kzName} commencee` },
          { done: bias !== 'NEUTRAL', text: `Biais Daily: ${bias}` },
          { done: activePOIs > 0, text: `POIs detectes: ${activePOIs}` },
          { done: confluenceScore >= 65, active: true, text: `Confluence: ${confluenceScore}/100 (besoin 75+)` },
          { done: false, text: `Attendre validation de tous les criteres` },
        ],
        why: [
          `Nous sommes dans ${kzName}`,
          `Biais du jour: ${bias} (${biasConv})`,
          `${activePOIs} POIs surveilles`,
          confluenceScore < 75
            ? 'Confluence insuffisante - ne pas forcer'
            : 'Confluence OK - chercher le trigger',
        ],
        whatNext: confluenceScore >= 75
          ? 'Attends que le prix atteigne une POI et valide le setup'
          : 'Patience - tous les criteres ne sont pas encore reunis',
      };
    }

    // PREPARE - Killzone bientot
    if (nextKzIn && nextKzIn <= 60) {
      const hrs = Math.floor(nextKzIn / 60);
      const mins = nextKzIn % 60;
      return {
        action: 'PREPARE',
        title: `PREPARATION - ${nextKzName} DANS ${hrs > 0 ? hrs + 'h' : ''}${mins}m`,
        subtitle: 'Analyse le marche maintenant',
        color: '#FFD600',
        bg: 'from-yellow-500/20 to-amber-500/10',
        borderColor: 'border-ict-neutral',
        icon: Timer,
        countdown: hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`,
        direction: bias === 'BULLISH' ? 'LONG' : bias === 'BEARISH' ? 'SHORT' : null,
        steps: [
          { done: bias !== 'NEUTRAL', text: `Biais Daily identifie: ${bias}` },
          { done: aligned, text: `Weekly ${aligned ? 'confirme' : 'attention'}` },
          { done: activePOIs > 0, text: `POIs mappes: ${activePOIs}` },
          { done: false, active: true, text: `Definir les niveaux cles (PDH/PDL)` },
          { done: false, text: `Preparer le plan de trade` },
        ],
        why: [
          `${nextKzName} commence dans ${nextKzIn} minutes`,
          `Biais etabli: ${bias} (${biasConv})`,
          `${activePOIs} zones POI a surveiller`,
          'Profite de ce temps pour analyser calmement',
        ],
        whatNext: `Identifie tes niveaux d'entree potentiels et ecris ton plan AVANT que la killzone commence`,
      };
    }

    // WAIT - Pas de killzone
    const hrs = Math.floor(nextKzIn / 60);
    const mins = nextKzIn % 60;
    return {
      action: 'WAIT',
      title: 'EN ATTENTE',
      subtitle: nextKzName
        ? `Prochaine killzone: ${nextKzName} dans ${hrs}h${mins}m`
        : 'Aucune killzone prevue prochainement',
      color: '#6B7280',
      bg: 'from-gray-600/20 to-gray-500/10',
      borderColor: 'border-ict-border',
      icon: Clock,
      countdown: nextKzIn > 0 ? `${hrs}h${mins}m` : undefined,
      direction: bias === 'BULLISH' ? 'LONG' : bias === 'BEARISH' ? 'SHORT' : null,
      steps: [
        { done: bias !== 'NEUTRAL', text: `Biais Daily: ${bias}` },
        { done: aligned, text: `Weekly ${aligned ? 'confirme' : 'diverge'}` },
        { done: activePOIs > 0, text: `${activePOIs} POIs actifs` },
        { done: false, active: true, text: `Attendre la prochaine killzone` },
      ],
      why: [
        'Hors killzone - probabilites faibles',
        `Biais du jour: ${bias}`,
        `${activePOIs} POIs en surveillance`,
        'Les pros ne tradent QUE en killzone',
      ],
      whatNext: nextKzName
        ? `Reviens dans ${hrs}h${mins}m pour ${nextKzName}`
        : 'Profites-en pour etudier - reviens plus tard',
    };
  }, [dailyBias, weeklyBias, po3, currentKillzone, nextKillzone, confluenceScore, confluenceGrade, activePOIs, currentPrice, instrument]);

  const Icon = decision.icon;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      className={`relative overflow-hidden rounded-2xl border-2 ${decision.borderColor}`}
      style={{
        background: `linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(10, 10, 15, 0.98))`,
      }}
    >
      {/* Animated background glow */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${decision.bg} pointer-events-none`}
        style={{ opacity: 0.6 }}
      />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-4">
            <motion.div
              animate={{
                scale: decision.action === 'READY' ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 2,
                repeat: decision.action === 'READY' ? Infinity : 0,
              }}
              className="flex items-center justify-center w-14 h-14 rounded-xl"
              style={{ backgroundColor: `${decision.color}20`, border: `1px solid ${decision.color}40` }}
            >
              <Icon size={28} style={{ color: decision.color }} />
            </motion.div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-1">
                Trading Coach
              </div>
              <h2 className="text-2xl font-bold text-ict-text mb-1">
                {decision.title}
              </h2>
              <p className="text-sm text-ict-muted">{decision.subtitle}</p>
            </div>
          </div>

          {decision.countdown && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-ict-muted mb-1">
                Countdown
              </div>
              <div className="text-3xl font-mono font-bold" style={{ color: decision.color }}>
                {decision.countdown}
              </div>
            </div>
          )}

          {decision.direction && (
            <div className={`px-4 py-2 rounded-lg border ${
              decision.direction === 'LONG'
                ? 'bg-ict-bullish/10 border-ict-bullish/40 text-ict-bullish'
                : 'bg-ict-bearish/10 border-ict-bearish/40 text-ict-bearish'
            }`}>
              <div className="flex items-center gap-2">
                {decision.direction === 'LONG'
                  ? <TrendingUp size={20} />
                  : <TrendingDown size={20} />
                }
                <span className="text-lg font-bold">{decision.direction}</span>
              </div>
            </div>
          )}
        </div>

        {/* Steps to follow */}
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-3 flex items-center gap-2">
            <Zap size={12} />
            ETAPES A SUIVRE
          </div>
          <div className="space-y-2">
            {decision.steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  step.active
                    ? 'bg-ict-accent/10 border-ict-accent/50 shadow-glow'
                    : step.done
                      ? 'bg-ict-bullish/5 border-ict-bullish/20'
                      : 'bg-white/[0.02] border-ict-border/30'
                }`}
              >
                <div className="flex-shrink-0">
                  {step.done
                    ? <CheckCircle2 size={18} className="text-ict-bullish" />
                    : step.active
                      ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                          <Activity size={18} className="text-ict-accent" />
                        </motion.div>
                      )
                      : <div className="w-[18px] h-[18px] rounded-full border-2 border-ict-muted/40" />
                  }
                </div>
                <span className={`text-sm flex-1 ${
                  step.active ? 'text-ict-accent font-medium' : step.done ? 'text-ict-text' : 'text-ict-muted'
                }`}>
                  {step.text}
                </span>
                {step.active && (
                  <span className="text-[10px] uppercase tracking-wider text-ict-accent font-bold">
                    MAINTENANT
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Why this decision */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-2 flex items-center gap-2">
              <BarChart3 size={12} />
              POURQUOI
            </div>
            <ul className="space-y-1">
              {decision.why.map((reason, i) => (
                <li key={i} className="text-sm text-ict-text/80 flex items-start gap-2">
                  <ArrowRight size={14} className="text-ict-accent mt-1 flex-shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-2 flex items-center gap-2">
              <Shield size={12} />
              PROCHAINE ETAPE
            </div>
            <div className="bg-ict-accent/5 border border-ict-accent/20 rounded-lg p-4">
              <p className="text-sm text-ict-text leading-relaxed">
                {decision.whatNext}
              </p>
            </div>
          </div>
        </div>

        {/* Trade plan (only when READY) */}
        <AnimatePresence>
          {decision.tradePlan && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-5 pt-5 border-t border-ict-border/50"
            >
              <div className="text-[11px] uppercase tracking-widest text-ict-muted mb-3 flex items-center gap-2">
                <DollarSign size={12} />
                PLAN DE TRADE
              </div>
              <div className="grid grid-cols-6 gap-3">
                <div className="bg-white/[0.03] p-3 rounded-lg">
                  <div className="text-[10px] text-ict-muted uppercase">Entry</div>
                  <div className="text-lg font-mono font-bold text-ict-text">
                    {decision.tradePlan.entry.toFixed(5)}
                  </div>
                </div>
                <div className="bg-ict-bearish/5 p-3 rounded-lg border border-ict-bearish/20">
                  <div className="text-[10px] text-ict-muted uppercase">SL</div>
                  <div className="text-lg font-mono font-bold text-ict-bearish">
                    {decision.tradePlan.sl.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-ict-muted">
                    {decision.tradePlan.slPips} pips
                  </div>
                </div>
                <div className="bg-ict-bullish/5 p-3 rounded-lg border border-ict-bullish/20">
                  <div className="text-[10px] text-ict-muted uppercase">TP1 (1:1)</div>
                  <div className="text-lg font-mono font-bold text-ict-bullish">
                    {decision.tradePlan.tp1.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-ict-muted">Close 40%</div>
                </div>
                <div className="bg-ict-bullish/10 p-3 rounded-lg border border-ict-bullish/30">
                  <div className="text-[10px] text-ict-muted uppercase">TP2 (2:1)</div>
                  <div className="text-lg font-mono font-bold text-ict-bullish">
                    {decision.tradePlan.tp2.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-ict-muted">Close 40%</div>
                </div>
                <div className="bg-ict-bullish/15 p-3 rounded-lg border border-ict-bullish/40">
                  <div className="text-[10px] text-ict-muted uppercase">TP3 (3:1)</div>
                  <div className="text-lg font-mono font-bold text-ict-bullish">
                    {decision.tradePlan.tp3.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-ict-muted">Close 20%</div>
                </div>
                <div className="bg-ict-accent/10 p-3 rounded-lg border border-ict-accent/30">
                  <div className="text-[10px] text-ict-muted uppercase">Size</div>
                  <div className="text-lg font-mono font-bold text-ict-accent">
                    {decision.tradePlan.lots} lots
                  </div>
                  <div className="text-[10px] text-ict-muted">
                    Risk ${decision.tradePlan.risk}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
