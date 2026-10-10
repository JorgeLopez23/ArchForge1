import type { EvaluationResult } from '@/game/types';
import { CheckCircle2, AlertTriangle, XCircle, Check, ShieldAlert } from 'lucide-react';

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

      {/* Symptoms (errors first, as learning prompts) */}
      {result.symptoms.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Síntomas detectados</h4>
          <div className="space-y-1.5">
            {result.symptoms.map((sym, idx) => (
              <div key={idx} className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                <div className="flex gap-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-400" />
                  <p className="text-xs text-slate-300 leading-relaxed">{sym}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security findings */}
      {result.securityFindings.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldAlert size={12} className="text-amber-400" />
            <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Hallazgos de Seguridad</h4>
          </div>
          <div className="space-y-1.5">
            {result.securityFindings.map((f, idx) => {
              const Icon = ICON_MAP[f.severity];
              const colorClass =
                f.severity === 'error' ? 'text-red-400'
                : f.severity === 'warning' ? 'text-amber-400'
                : 'text-emerald-400';
              const bgClass =
                f.severity === 'error' ? 'border-red-500/20 bg-red-500/5'
                : f.severity === 'warning' ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-emerald-500/20 bg-emerald-500/5';
              return (
                <div key={idx} className={`rounded-lg border p-2 ${bgClass}`}>
                  <div className="flex gap-2">
                    <Icon size={12} className={`shrink-0 mt-0.5 ${colorClass}`} />
                    <div>
                      <p className="text-xs text-slate-300 leading-relaxed">{f.message}</p>
                      <p className="text-[10px] text-amber-500/60 leading-tight mt-0.5">Riesgo: {f.risk}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
