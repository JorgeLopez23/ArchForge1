import type { Level } from '@/game/types';
import { Users, Clock, Gauge, Lock, DollarSign, Lightbulb, Activity, Wallet } from 'lucide-react';

interface Props {
  level: Level;
}

export function LevelInfo({ level }: Props) {
  const reqs = [
    { icon: Users, label: 'Usuarios', value: level.requirements.users },
    { icon: Clock, label: 'Disponibilidad', value: level.requirements.availability },
    { icon: Gauge, label: 'Rendimiento', value: level.requirements.performance },
    { icon: Lock, label: 'Seguridad', value: level.requirements.security },
    { icon: DollarSign, label: 'Costo', value: level.requirements.cost },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-white">{level.title}</h2>
        <p className="text-xs text-slate-400">{level.subtitle}</p>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-4">{level.scenario}</p>

      {/* Traffic & Budget highlights */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} className="text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tráfico</span>
          </div>
          <span className="text-sm font-bold text-white">{level.requestsPerSecond} req/s</span>
        </div>
        <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-pink-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Presupuesto</span>
          </div>
          <span className="text-sm font-bold text-white">${level.budget}/mes</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {reqs.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.label} className="flex items-start gap-2">
              <Icon size={14} className="shrink-0 mt-0.5 text-slate-400" />
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{r.label}: </span>
                <span className="text-xs text-slate-300">{r.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb size={14} className="text-blue-400" />
          <span className="text-xs font-bold text-blue-300">Pistas</span>
        </div>
        <ul className="space-y-1">
          {level.hints.map((hint, idx) => (
            <li key={idx} className="text-xs text-slate-400 leading-relaxed pl-4 relative">
              <span className="absolute left-0 text-blue-500">•</span>
              {hint}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
