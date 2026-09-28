import type { EvaluationResult } from '@/game/types';
import { CheckCircle2, AlertTriangle, XCircle, Check } from 'lucide-react';

interface Props {
  result: EvaluationResult | null;
}

const ICON_MAP = {
  good: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

export function EvaluationResults({ result }: Props) {
  if (!result) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <h3 className="text-sm font-bold text-white mb-2">Evaluación</h3>
        <p className="text-xs text-slate-400">
          Construye tu arquitectura y presiona "Evaluar Arquitectura" para ver el análisis.
        </p>
      </div>
    );
  }

  const goodCount = result.issues.filter((i) => i.severity === 'good').length;
  const warnCount = result.issues.filter((i) => i.severity === 'warning').length;
  const errCount = result.issues.filter((i) => i.severity === 'error').length;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 max-h-[500px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Evaluación</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400">{goodCount} bien</span>
          <span className="text-amber-400">{warnCount} adv.</span>
          <span className="text-red-400">{errCount} error</span>
        </div>
      </div>

      {/* Summary banner */}
      <div className={`rounded-lg p-3 mb-3 border ${result.passed ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
        <div className="flex items-center gap-2">
          {result.passed ? (
            <Check size={18} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={18} className="text-amber-400" />
          )}
          <p className={`text-xs font-semibold ${result.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
            {result.summary}
          </p>
        </div>
      </div>

      {/* Issues list */}
      <div className="space-y-2">
        {result.issues.map((issue, idx) => {
          const Icon = ICON_MAP[issue.severity];
          const colorClass =
            issue.severity === 'good' ? 'text-emerald-400'
            : issue.severity === 'warning' ? 'text-amber-400'
            : 'text-red-400';
          const bgClass =
            issue.severity === 'good' ? 'border-emerald-500/20 bg-emerald-500/5'
            : issue.severity === 'warning' ? 'border-amber-500/20 bg-amber-500/5'
            : 'border-red-500/20 bg-red-500/5';

          return (
            <div key={idx} className={`rounded-lg border p-2.5 ${bgClass}`}>
              <div className="flex gap-2">
                <Icon size={14} className={`shrink-0 mt-0.5 ${colorClass}`} />
                <p className="text-xs text-slate-300 leading-relaxed">{issue.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
