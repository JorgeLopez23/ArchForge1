import { LEVELS } from '@/game/levels';
import type { Level } from '@/game/types';
import { CheckCircle2, Lock } from 'lucide-react';

interface Props {
  currentLevel: number;
  completedLevels: Set<number>;
  onSelect: (level: Level) => void;
}

export function LevelSelector({ currentLevel, completedLevels, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2">
      {LEVELS.map((level) => {
        const isCurrent = level.id === currentLevel;
        const isCompleted = completedLevels.has(level.id);
        const isUnlocked = level.id === 1 || completedLevels.has(level.id - 1);

        return (
          <button
            key={level.id}
            disabled={!isUnlocked}
            onClick={() => isUnlocked && onSelect(level)}
            className={`
              relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all
              ${isCurrent
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : isUnlocked
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-slate-800/30 text-slate-600 cursor-not-allowed border border-slate-800'
              }
            `}
          >
            {isCompleted && <CheckCircle2 size={14} className="text-emerald-400" />}
            {!isUnlocked && <Lock size={12} />}
            <span>Nivel {level.id}</span>
          </button>
        );
      })}
    </div>
  );
}
