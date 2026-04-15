import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import Card from '@/components/common/Card';
import Gauge from '@/components/common/Gauge';
import Badge from '@/components/common/Badge';
import ProgressBar from '@/components/common/ProgressBar';
import { useStore } from '@/store';
import type { Grade } from '@/store/slices/confluenceSlice';

function getGradeVariant(grade: Grade): 'bullish' | 'neutral' | 'bearish' | 'muted' {
  if (grade === 'A+' || grade === 'A' || grade === 'B+') return 'bullish';
  if (grade === 'B' || grade === 'C') return 'neutral';
  if (grade === 'D' || grade === 'F') return 'bearish';
  return 'muted';
}

function getBarColor(score: number, maxScore: number): 'bullish' | 'neutral' | 'bearish' | 'accent' {
  if (maxScore <= 0) return 'neutral';
  const pct = (score / maxScore) * 100;
  if (pct >= 70) return 'bullish';
  if (pct >= 40) return 'neutral';
  return 'bearish';
}

function getGaugeGlowColor(grade: Grade): string {
  switch (grade) {
    case 'A+': case 'A': return '#00C853';
    case 'B+': return '#4CAF50';
    case 'B': return '#8BC34A';
    case 'C': return '#FFD600';
    case 'D': return '#FF9800';
    case 'F': return '#FF1744';
    default: return '#6B7280';
  }
}

export default function ConfluenceWidget() {
  try {
    const score = useStore((s) => s.score);
    const grade = useStore((s) => s.grade);
    const recommendation = useStore((s) => s.recommendation);
    const categories = useStore((s) => s.categories);

    const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0;
    const safeGrade = grade || 'F';
    const safeRec = recommendation || 'Awaiting analysis...';
    const safeCats = Array.isArray(categories) ? categories : [];
    const glowColor = getGaugeGlowColor(safeGrade);

    return (
      <Card title="Confluence Score" accent="cyan">
        <div className="space-y-4">
          {/* Gauge with smooth animation */}
          <div className="flex justify-center">
            <Gauge
              value={safeScore}
              grade={safeGrade}
              label="confluence"
              size={130}
              strokeWidth={8}
            />
          </div>

          {/* Recommendation with grade-colored background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center px-3 py-2 rounded-lg"
            style={{
              backgroundColor: `${glowColor}08`,
              border: `1px solid ${glowColor}18`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <Target size={12} className="text-ict-accent" />
              <Badge variant={getGradeVariant(safeGrade)} size="xs">
                Grade {safeGrade}
              </Badge>
            </div>
            <p className="text-[11px] text-ict-muted leading-relaxed font-medium">
              {safeRec}
            </p>
          </motion.div>

          {/* Category bars with fill animation */}
          <div className="space-y-2.5">
            {safeCats.map((cat, i) => {
              const catScore = typeof cat.score === 'number' ? cat.score : 0;
              const catMax = typeof cat.maxScore === 'number' && cat.maxScore > 0 ? cat.maxScore : 1;

              return (
                <motion.div
                  key={cat.name || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-ict-muted">{cat.name || 'Unknown'}</span>
                    <span className="text-[10px] font-mono text-ict-text">
                      {catScore}/{catMax}
                    </span>
                  </div>
                  <ProgressBar
                    value={catScore}
                    max={catMax}
                    color={getBarColor(catScore, catMax)}
                    height="sm"
                    animated
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  } catch {
    return (
      <Card title="Confluence Score" accent="cyan">
        <div className="text-center py-6">
          <span className="text-xs text-ict-muted">Unable to load confluence data</span>
        </div>
      </Card>
    );
  }
}
