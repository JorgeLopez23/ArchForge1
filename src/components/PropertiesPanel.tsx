import { useState } from 'react';
import type { SimulationNodeState, SecurityControlType } from '@/game/types';
import { COMPONENT_MAP, SECURITY_CONTROLS } from '@/game/componentTypes';
import * as Icons from 'lucide-react';
import {
  X, Plus, Minus, Gauge, DollarSign, Clock, ShieldCheck, Activity,
  Cpu, MemoryStick, Wifi, Trash2, ChevronDown, ChevronRight, AlertTriangle,
  Lightbulb, BookOpen, Lock,
} from 'lucide-react';

interface Props {
  node: SimulationNodeState | null;
  onClose: () => void;
  onAdjustInstances: (nodeId: string, delta: number) => void;
  onAdjustResource: (nodeId: string, resource: 'vcpu' | 'ram', delta: number) => void;
  onToggleSecurity: (nodeId: string, control: SecurityControlType) => void;
  onDelete: (nodeId: string) => void;
}

export function PropertiesPanel({ node, onClose, onAdjustInstances, onAdjustResource, onToggleSecurity, onDelete }: Props) {
  const [showEdu, setShowEdu] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

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

  const baseProps = [
    { icon: Activity, label: 'Tráfico recibido', value: `${node.receivedRps} req/s` },
    { icon: Activity, label: 'Tráfico procesado', value: `${node.outputRps} req/s` },
    { icon: Clock, label: 'Latencia', value: `${node.latency} ms` },
    { icon: ShieldCheck, label: 'Disponibilidad', value: `${node.availability}%` },
  ];

  const resourceProps = [
    { icon: Cpu, label: 'vCPU', value: `${node.vcpu} vCPU` },
    { icon: MemoryStick, label: 'RAM', value: `${node.ram} GB` },
    { icon: Wifi, label: 'Red', value: `${node.network} Mbps` },
    { icon: Gauge, label: 'CPU %', value: `${node.cpuUsage}%`, danger: node.cpuUsage > 90 },
    { icon: Gauge, label: 'RAM %', value: `${node.ramUsage}%`, danger: node.ramUsage > 90 },
    { icon: Gauge, label: 'Red %', value: `${node.networkUsage}%`, danger: node.networkUsage > 90 },
    { icon: DollarSign, label: 'Costo mensual', value: `$${node.cost}` },
  ];

  // Component-specific metrics
  const extraMetrics: { icon: typeof Gauge; label: string; value: string }[] = [];
  if (node.cacheHitRate !== undefined) {
    extraMetrics.push({ icon: Activity, label: 'Cache Hit Rate', value: `${node.cacheHitRate}%` });
    extraMetrics.push({ icon: Gauge, label: 'Evictions', value: `${node.evictions ?? 0}/s` });
  }
  if (node.connections !== undefined) {
    extraMetrics.push({ icon: Activity, label: 'Conexiones', value: `${node.connections}/${node.maxConnections}` });
    extraMetrics.push({ icon: Activity, label: 'Reads', value: `${node.readsPerSec ?? 0}/s` });
    extraMetrics.push({ icon: Activity, label: 'Writes', value: `${node.writesPerSec ?? 0}/s` });
    extraMetrics.push({ icon: Gauge, label: 'IOPS', value: `${node.iops ?? 0}` });
    extraMetrics.push({ icon: Clock, label: 'Read Latency', value: `${node.readLatency ?? 0} ms` });
    extraMetrics.push({ icon: Clock, label: 'Write Latency', value: `${node.writeLatency ?? 0} ms` });
  }
  if (node.errors > 0) {
    extraMetrics.push({ icon: AlertTriangle, label: 'Errores', value: `${node.errors} req/s` });
  }
  if (node.oomRisk) {
    extraMetrics.push({ icon: AlertTriangle, label: 'OOM Risk', value: 'PELIGRO' });
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} style={{ color: ct.color }} />}
          <h3 className="text-sm font-bold text-white">{ct.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDelete(node.id)}
            className="flex items-center gap-1 rounded-lg border border-red-800/50 bg-red-900/30 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-900/50 transition-colors"
            title="Eliminar componente"
          >
            <Trash2 size={11} />
            Eliminar
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* Base metrics */}
      <div className="space-y-2 mb-4">
        {baseProps.map((p) => {
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

      {/* Resource metrics */}
      <div className="border-t border-slate-700 pt-3 mb-4">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Recursos</h4>
        <div className="space-y-2">
          {resourceProps.map((p) => {
            const PIcon = p.icon;
            const danger = p.danger;
            return (
              <div key={p.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PIcon size={12} className={danger ? 'text-red-400' : 'text-slate-500'} />
                  <span className="text-xs text-slate-400">{p.label}</span>
                </div>
                <span className={`text-xs font-semibold ${danger ? 'text-red-400' : 'text-white'}`}>{p.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra component-specific metrics */}
      {extraMetrics.length > 0 && (
        <div className="border-t border-slate-700 pt-3 mb-4">
          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Métricas específicas</h4>
          <div className="space-y-2">
            {extraMetrics.map((p) => {
              const PIcon = p.icon;
              const isWarning = p.value === 'PELIGRO' || p.label === 'Errores';
              return (
                <div key={p.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PIcon size={12} className={isWarning ? 'text-red-400' : 'text-slate-500'} />
                    <span className="text-xs text-slate-400">{p.label}</span>
                  </div>
                  <span className={`text-xs font-semibold ${isWarning ? 'text-red-400' : 'text-white'}`}>{p.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Instance control */}
      {ct.scalable && (
        <div className="border-t border-slate-700 pt-3 mb-4">
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
            Capacidad: {node.capacityPerInstance * node.instances} req/s · Costo: ${ct.baseCost * node.instances}/mes
          </p>
        </div>
      )}

      {/* Resource configuration */}
      <div className="border-t border-slate-700 pt-3 mb-4">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Configuración</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={12} className="text-slate-500" />
              <span className="text-xs text-slate-400">vCPU por instancia</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAdjustResource(node.id, 'vcpu', -1)}
                disabled={node.vcpu / node.instances <= 1}
                className="flex items-center justify-center w-6 h-6 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >
                <Minus size={11} />
              </button>
              <span className="text-xs font-bold text-white w-8 text-center">{node.vcpu / node.instances}</span>
              <button
                onClick={() => onAdjustResource(node.id, 'vcpu', 1)}
                className="flex items-center justify-center w-6 h-6 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MemoryStick size={12} className="text-slate-500" />
              <span className="text-xs text-slate-400">RAM por instancia (GB)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAdjustResource(node.id, 'ram', -2)}
                disabled={node.ram / node.instances <= 1}
                className="flex items-center justify-center w-6 h-6 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >
                <Minus size={11} />
              </button>
              <span className="text-xs font-bold text-white w-8 text-center">{node.ram / node.instances}</span>
              <button
                onClick={() => onAdjustResource(node.id, 'ram', 2)}
                className="flex items-center justify-center w-6 h-6 rounded border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">
          Aumentar vCPU mejora la capacidad de procesamiento. Aumentar RAM solo ayuda si el workload es memory-bound.
        </p>
      </div>

      {/* Security controls */}
      <div className="border-t border-slate-700 pt-3 mb-4">
        <button
          onClick={() => setShowSecurity(!showSecurity)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold hover:text-slate-400 transition-colors"
        >
          {showSecurity ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Lock size={11} />
          Controles de Seguridad
        </button>
        {showSecurity && (
          <div className="mt-2 space-y-1.5">
            {ct.securityControls.map((ctrl) => {
              const sc = SECURITY_CONTROLS[ctrl];
              const active = (node as unknown as { securityControls?: SecurityControlType[] }).securityControls?.includes(ctrl) ?? false;
              return (
                <button
                  key={ctrl}
                  onClick={() => onToggleSecurity(node.id, ctrl)}
                  className={`w-full text-left rounded-lg border p-2 transition-all ${
                    active
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-900/40 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-semibold ${active ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {sc.label}
                    </span>
                    <span className={`text-[9px] font-bold ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {active ? 'ACTIVO' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">{sc.description}</p>
                  <p className="text-[9px] text-amber-500/70 leading-tight mt-0.5">Riesgo: {sc.riskMitigated}</p>
                  <p className="text-[9px] text-slate-600 leading-tight">Costo: +${sc.cost}/mes</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Educational info */}
      <div className="border-t border-slate-700 pt-3">
        <button
          onClick={() => setShowEdu(!showEdu)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold hover:text-slate-400 transition-colors"
        >
          {showEdu ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <BookOpen size={11} />
          Información Educativa
        </button>
        {showEdu && (
          <div className="mt-2 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Lightbulb size={11} className="text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">¿Qué es?</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{ct.educational.what}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-400">¿Para qué sirve?</span>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">{ct.educational.purpose}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-400">¿Cuándo utilizarlo?</span>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">{ct.educational.whenToUse}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-red-400">¿Cuándo NO utilizarlo?</span>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">{ct.educational.whenNotToUse}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-400">Problemas que resuelve</span>
              <ul className="mt-0.5 space-y-0.5">
                {ct.educational.problemsSolved.map((p, i) => (
                  <li key={i} className="text-[11px] text-slate-300 leading-relaxed pl-3 relative">
                    <span className="absolute left-0 text-blue-500">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-400">Cuellos de botella</span>
              <ul className="mt-0.5 space-y-0.5">
                {ct.educational.bottlenecks.map((p, i) => (
                  <li key={i} className="text-[11px] text-slate-300 leading-relaxed pl-3 relative">
                    <span className="absolute left-0 text-amber-500">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-[10px] font-bold text-red-400">Riesgos de seguridad</span>
              <ul className="mt-0.5 space-y-0.5">
                {ct.educational.securityRisks.map((p, i) => (
                  <li key={i} className="text-[11px] text-slate-300 leading-relaxed pl-3 relative">
                    <span className="absolute left-0 text-red-500">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            {/* Contextual simulation insight */}
            {node.status !== 'idle' && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
                <span className="text-[10px] font-bold text-blue-300">Contexto actual</span>
                <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                  {node.status === 'overloaded' && `Este componente está sobrecargado: recibe ${node.receivedRps} req/s pero solo procesa ${node.outputRps} req/s. CPU al ${node.cpuUsage}%, RAM al ${node.ramUsage}%.`}
                  {node.status === 'down' && `Este componente está caído. Las ${node.receivedRps} req/s que recibe se convierten en ${node.errors} errores/s.`}
                  {node.status === 'active' && `Funcionando con ${node.receivedRps} req/s a ${node.latency}ms de latencia. CPU ${node.cpuUsage}%, RAM ${node.ramUsage}%.`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
