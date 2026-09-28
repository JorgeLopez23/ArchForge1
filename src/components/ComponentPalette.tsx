import { COMPONENT_TYPES } from '@/game/componentTypes';
import * as Icons from 'lucide-react';

export function ComponentPalette() {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
        Componentes
      </h3>
      {COMPONENT_TYPES.map((ct) => {
        const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[ct.icon];
        return (
          <div
            key={ct.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/reactflow', ct.type);
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="group flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 cursor-grab hover:border-slate-500 hover:bg-slate-700/50 transition-all"
          >
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ background: `${ct.color}20`, border: `1px solid ${ct.color}40` }}
            >
              {Icon && <Icon size={18} style={{ color: ct.color }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">{ct.label}</div>
              <div className="text-[10px] text-slate-400 truncate">{ct.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
