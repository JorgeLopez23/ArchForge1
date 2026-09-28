import type { SimulationResult, IncidentDef, IncidentType } from '@/game/types';
import * as Icons from 'lucide-react';
import { Play, Square, AlertTriangle, Zap, Activity, DollarSign } from 'lucide-react';

interface Props {
  simulation: SimulationResult | null;
  isSimulating: boolean;
  onSimulate: () => void;
  onStop: () => void;
  levelRps: number;
  budget: number;
  activeIncident: IncidentType | null;
  incidents: IncidentDef[];
  onTriggerIncident: (incident: IncidentType) => void;
  onClearIncident: () => void;
}

export function SimulationPanel({
  simulation,
  isSimulating,
  onSimulate,
  onStop,
  levelRps,
  budget,
  activeIncident,
  incidents,
  onTriggerIncident,
  onClearIncident,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <h3 className="text-sm font-bold text-white mb-3">Simulación de Tráfico</h3>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Activity size={11} className="text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Tráfico</span>
          </div>
          <span className="text-sm font-bold text-white">{simulation ? simulation.totalRps : levelRps} req/s</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <DollarSign size={11} className="text-pink-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Costo</span>
          </div>
          <span className={`text-sm font-bold ${simulation && simulation.totalCost > budget ? 'text-red-400' : 'text-white'}`}>
            ${simulation ? simulation.totalCost : 0}/${budget}
          </span>
        </div>
      </div>

      {/* Simulate button */}
      {!isSimulating ? (
        <button
          onClick={onSimulate}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 transition-all"
        >
          <Play size={14} />
          Simular
        </button>
      ) : (
        <button
          onClick={onStop}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 transition-all"
        >
          <Square size={14} />
          Detener
        </button>
      )}

      {/* Simulation status */}
      {simulation && (
        <div className="mt-3 space-y-1.5">
          {simulation.hasDown && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
              <span className="text-xs text-red-300">Nodos caídos detectados</span>
            </div>
          )}
          {simulation.hasOverload && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
              <Zap size={12} className="text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300">Componentes sobrecargados</span>
            </div>
          )}
          {!simulation.hasOverload && !simulation.hasDown && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
              <Icons.CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">Sistema funcionando correctamente</span>
            </div>
          )}
        </div>
      )}

      {/* Incidents */}
      <div className="mt-4 pt-3 border-t border-slate-700">
        <h4 className="text-xs font-bold text-white mb-2">Incidentes</h4>
        <div className="space-y-1.5">
          {incidents.map((inc) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[inc.icon] || AlertTriangle;
            const isActive = activeIncident === inc.type;
            return (
              <button
                key={inc.type}
                onClick={() => isActive ? onClearIncident() : onTriggerIncident(inc.type)}
                className={`w-full flex items-start gap-2 rounded-lg border p-2 text-left transition-all ${
                  isActive
                    ? 'border-red-500/50 bg-red-500/15'
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/50'
                }`}
              >
                <Icon size={14} className={`shrink-0 mt-0.5 ${isActive ? 'text-red-400' : 'text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-semibold ${isActive ? 'text-red-300' : 'text-slate-300'}`}>
                    {inc.label}
                    {isActive && ' (Activo)'}
                  </span>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{inc.description}</p>
                </div>
              </button>
            );
          })}
          {activeIncident && (
            <button
              onClick={onClearIncident}
              className="w-full text-center text-[10px] text-slate-400 hover:text-slate-300 pt-1"
            >
              Limpiar incidente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
