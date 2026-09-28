import { useState } from 'react';
import type { ScoreBreakdown, ScoreDetail, ScoreExplanation } from '@/game/types';
import { TrendingUp, ShieldCheck, Lock, DollarSign, GitBranch, Target, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  scores: ScoreBreakdown | null;
  details: ScoreDetail | null;
  targetScore: number;
  totalCost: number;
  budget: number;
}

const METRICS = [
  { key: 'scalability', label: 'Escalabilidad', icon: TrendingUp, color: '#3b82f6' },
  { key: 'availability', label: 'Disponibilidad', icon: ShieldCheck, color: '#10b981' },
  { key: 'security', label: 'Seguridad', icon: Lock, color: '#f59e0b' },
  { key: 'cost', label: 'Costo', icon: DollarSign, color: '#ec4899' },
  { key: 'complexity', label: 'Complejidad', icon: GitBranch, color: '#8b5cf6' },
] as const;

function ScoreExplanationList({ explanations }: { explanations: ScoreExplanation[] }) {
  if (explanations.length === 0) return null;
  return (
    <div className="ml-6 mt-1 space-y-0.5">
      {explanations.map((exp, idx) => (
        <div key={idx} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
          <span className={`font-bold shrink-0 ${exp.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {exp.delta > 0 ? `+${exp.delta}` : exp.delta}
          </span>
          <span className="text-slate-400">{exp.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ScoreBoard({ scores, details, targetScore, totalCost, budget }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const budgetExceeded = totalCost > budget;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Puntuación</h3>
        {scores && (
          <div className="flex items-center gap-2">
            <Target size={14} className="text-slate-400" />
            <span className="text-xs text-slate-400">Meta: {targetScore}</span>
          </div>
        )}
      </div>

      {/* Total score */}
      <div className="mb-3">
        <div className="flex items-end gap-2 mb-1">
          <span className={`text-4xl font-black ${scores ? (scores.total >= targetScore ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-600'}`}>
            {scores ? scores.total : '—'}
          </span>
          <span className="text-sm text-slate-500 mb-1">/ 100</span>
        </div>
        {scores && (
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${scores.total >= targetScore ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${scores.total}%` }}
            />
          </div>
        )}
      </div>

      {/* Budget */}
      {scores && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Presupuesto</span>
          <span className={`text-xs font-bold ${budgetExceeded ? 'text-red-400' : 'text-emerald-400'}`}>
            ${totalCost} / ${budget}
          </span>
        </div>
      )}

      {/* Individual metrics with expandable explanations */}
      <div className="space-y-2">
        {METRICS.map((m) => {
          const value = scores ? scores[m.key] : 0;
          const Icon = m.icon;
          const isExpanded = expanded === m.key;
          const hasDetails = details && details[m.key].length > 0;

          return (
            <div key={m.key}>
              <button
                onClick={() => hasDetails && setExpanded(isExpanded ? null : m.key)}
                className={`w-full ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!hasDetails}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {hasDetails && (isExpanded ? <ChevronDown size={11} className="text-slate-500" /> : <ChevronRight size={11} className="text-slate-500" />)}
                    <Icon size={13} style={{ color: m.color }} />
                    <span className="text-xs text-slate-300">{m.label}</span>
                  </div>
                  <span className="text-xs font-bold text-white">{scores ? value : '—'}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${scores ? value : 0}%`, background: m.color }}
                  />
                </div>
              </button>
              {isExpanded && details && <ScoreExplanationList explanations={details[m.key]} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
