import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import * as Icons from 'lucide-react';
import { COMPONENT_MAP } from '@/game/componentTypes';
import type { NodeStatus } from '@/game/types';

const STATUS_COLORS: Record<NodeStatus, { border: string; glow: string; badge: string; badgeText: string }> = {
  idle: { border: '', glow: '', badge: '', badgeText: '' },
  active: { border: '#10b981', glow: '0 0 12px #10b98160', badge: 'bg-emerald-500/20 text-emerald-300', badgeText: 'ACTIVO' },
  overloaded: { border: '#ef4444', glow: '0 0 20px #ef444480', badge: 'bg-red-500/30 text-red-300', badgeText: 'SOBRECARGADO' },
  down: { border: '#64748b', glow: '0 0 10px #64748b60', badge: 'bg-slate-600/40 text-slate-300', badgeText: 'CAÍDO' },
};

function UsageBar({ label, value, danger }: { label: string; value: number; danger: boolean }) {
  const color = danger ? '#ef4444' : value > 80 ? '#f59e0b' : value > 50 ? '#10b981' : '#3b82f6';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-slate-500 w-7">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-slate-700/60 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[8px] font-semibold w-6 text-right" style={{ color }}>{value}%</span>
    </div>
  );
}

function ArchitectureNode({ data, selected }: NodeProps) {
  const componentType = COMPONENT_MAP[data.componentType];
  if (!componentType) return null;

  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[componentType.icon];
  const label = data.label || componentType.label;
  const status: NodeStatus = data.status ?? 'idle';
  const instances: number = data.instances ?? 1;
  const statusStyle = STATUS_COLORS[status];

  const isDown = status === 'down';
  const isOverloaded = status === 'overloaded';

  const borderColor = isDown ? '#64748b' : isOverloaded ? '#ef4444' : selected ? '#fff' : componentType.color;
  const boxShadow = isDown
    ? '0 4px 12px #64748b40'
    : isOverloaded
      ? `0 0 0 2px #ef4444, ${statusStyle.glow}`
      : selected
        ? `0 0 0 2px #fff, 0 0 20px ${componentType.color}80`
        : `0 4px 20px ${componentType.color}30`;

  const cpuUsage: number = data.cpuUsage ?? 0;
  const ramUsage: number = data.ramUsage ?? 0;
  const netUsage: number = data.networkUsage ?? 0;
  const receivedRps: number = data.receivedRps ?? 0;
  const errors: number = data.errors ?? 0;
  const showMetrics = status !== 'idle';

  return (
    <div
      className={`relative rounded-xl border-2 px-4 py-3 min-w-[170px] transition-all duration-300 ${isDown ? 'opacity-50' : ''} ${isOverloaded ? 'animate-pulse' : ''}`}
      style={{
        borderColor,
        background: `linear-gradient(135deg, ${componentType.color}25, ${componentType.color}10)`,
        boxShadow,
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-white !border-2" style={{ borderColor: componentType.color }} />

      <div className="flex items-center gap-2">
        {Icon && <Icon size={20} style={{ color: componentType.color }} />}
        <div className="flex flex-col flex-1">
          <span className="text-sm font-bold text-white leading-tight">{label}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">{componentType.category}</span>
        </div>
        {componentType.scalable && instances > 1 && (
          <span className="text-[10px] font-bold text-slate-300 bg-slate-700/60 rounded px-1.5 py-0.5">
            x{instances}
          </span>
        )}
      </div>

      {status !== 'idle' && (
        <div className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${statusStyle.badge}`}>
          {statusStyle.badgeText}
        </div>
      )}

      {showMetrics && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-slate-400">{receivedRps} req/s</span>
            {errors > 0 && <span className="text-red-400 font-semibold">{errors} err/s</span>}
          </div>
          <UsageBar label="CPU" value={cpuUsage} danger={cpuUsage > 90} />
          <UsageBar label="RAM" value={ramUsage} danger={ramUsage > 90} />
          <UsageBar label="NET" value={netUsage} danger={netUsage > 90} />
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-white !border-2" style={{ borderColor: componentType.color }} />
    </div>
  );
}

export default memo(ArchitectureNode);
