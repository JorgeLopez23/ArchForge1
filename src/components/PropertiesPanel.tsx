import type { SimulationNodeState } from '@/game/types';
import { COMPONENT_MAP } from '@/game/componentTypes';
import * as Icons from 'lucide-react';
import { X, Plus, Minus, Gauge, DollarSign, Clock, ShieldCheck, Activity } from 'lucide-react';

interface Props {
  node: SimulationNodeState | null;
  onClose: () => void;
  onAdjustInstances: (nodeId: string, delta: number) => void;
}

export function PropertiesPanel({ node, onClose, onAdjustInstances }: Props) {
  if (!node) return null;

  const ct = COMPONENT_MAP[node.componentType];
  if (!ct) return null;

  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[ct.icon];

  const statusColor =
    node.status === 'overloaded' ? 'text-red-400'
    : node.status === 'down' ? 'text-slate-400'
    : node.status === 'active' ? 'text-emerald-400'
    : 'text-slate-500';

  const statusLabel =
    node.status === 'overloaded' ? 'Sobrecargado'
    : node.status === 'down' ? 'Caído'
    : node.status === 'active' ? 'Activo'
    : 'Inactivo';

  const props = [
    { icon: Gauge, label: 'Capacidad por instancia', value: `${node.capacityPerInstance} req/s` },
    { icon: Activity, label: 'Capacidad total', value: `${node.totalCapacity} req/s` },
    { icon: Activity, label: 'Tráfico recibido', value: `${node.receivedRps} req/s` },
    { icon: Clock, label: 'Latencia', value: `${node.latency} ms` },
    { icon: ShieldCheck, label: 'Disponibilidad', value: `${node.availability}%` },
    { icon: DollarSign, label: 'Costo mensual', value: `$${node.cost}` },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} style={{ color: ct.color }} />}
          <h3 className="text-sm font-bold text-white">{ct.label}</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="mb-3">
        <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="space-y-2 mb-4">
        {props.map((p) => {
          const PIcon = p.icon;
          return (
            <div key={p.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PIcon size={12} className="text-slate-500" />
                <span className="text-xs text-slate-400">{p.label}</span>
              </div>
              <span className="text-xs font-semibold text-white">{p.value}</span>
            </div>
          );
        })}
      </div>

      {ct.scalable && (
        <div className="border-t border-slate-700 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Instancias</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAdjustInstances(node.id, -1)}
                disabled={node.instances <= 1}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-bold text-white w-6 text-center">{node.instances}</span>
              <button
                onClick={() => onAdjustInstances(node.id, 1)}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            Capacidad total: {node.capacityPerInstance * node.instances} req/s · Costo: ${ct.baseCost * node.instances}/mes
          </p>
        </div>
      )}

      {!ct.scalable && (
        <div className="border-t border-slate-700 pt-3">
          <p className="text-[10px] text-slate-500">Este componente no es escalable horizontalmente.</p>
        </div>
      )}
    </div>
  );
}
