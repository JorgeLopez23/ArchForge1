import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { LEVELS } from '@/game/levels';
import type { EvaluationResult, Level, SimulationResult, IncidentType, SimulationNodeState, SecurityControlType, WorkloadType } from '@/game/types';
import { COMPONENT_MAP } from '@/game/componentTypes';
import { evaluateArchitecture } from '@/game/evaluationEngine';
import { runSimulation } from '@/game/simulationEngine';
import ArchitectureNode from '@/components/ArchitectureNode';
import { ComponentPalette } from '@/components/ComponentPalette';
import { ScoreBoard } from '@/components/ScoreBoard';
import { EvaluationResults } from '@/components/EvaluationResults';
import { LevelInfo } from '@/components/LevelInfo';
import { LevelSelector } from '@/components/LevelSelector';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { SimulationPanel } from '@/components/SimulationPanel';
import { Play, Trash2, RotateCcw, Trophy, Undo2 } from 'lucide-react';

let nodeIdCounter = 1;

const nodeTypes = { architectureNode: ArchitectureNode };

const STORAGE_KEY = 'archforge-progress';

interface SavedProgress {
  completedLevels: number[];
  currentLevelId: number;
}

function loadProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedProgress;
  } catch { /* ignore */ }
  return { completedLevels: [], currentLevelId: 1 };
}

function saveProgress(completedLevels: Set<number>, currentLevelId: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completedLevels: [...completedLevels],
      currentLevelId,
    }));
  } catch { /* ignore */ }
}

interface UndoEntry {
  nodes: Node[];
  edges: Edge[];
}

export function GameScreen() {
  const initialProgress = useRef(loadProgress());
  const [currentLevel, setCurrentLevel] = useState<Level>(
    LEVELS.find((l) => l.id === initialProgress.current.currentLevelId) ?? LEVELS[0]
  );
  const [completedLevels, setCompletedLevels] = useState<Set<number>>(
    new Set(initialProgress.current.completedLevels)
  );
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [showVictory, setShowVictory] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeIncident, setActiveIncident] = useState<IncidentType | null>(null);
  const [simInterval, setSimInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Save progress
  useEffect(() => {
    saveProgress(completedLevels, currentLevel.id);
  }, [completedLevels, currentLevel.id]);

  // Cleanup simulation interval
  useEffect(() => {
    return () => {
      if (simInterval) clearInterval(simInterval);
    };
  }, [simInterval]);

  // Push to undo stack before a mutation
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-19), { nodes, edges }]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setNodes(last.nodes);
      setEdges(last.edges);
      setEvaluation(null);
      setSelectedNodeId(null);
      return prev.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z = undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Delete / Backspace = delete selected node (but not when editing text)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedNodeId, undo]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      pushUndo();
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }, eds));
      setEvaluation(null);
    },
    [pushUndo]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const componentType = e.dataTransfer.getData('application/reactflow');
      if (!componentType || !COMPONENT_MAP[componentType]) return;

      const position = rfInstance.current?.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      if (!position) return;

      const ct = COMPONENT_MAP[componentType];
      const newNode: Node = {
        id: `${componentType}-${nodeIdCounter++}`,
        type: 'architectureNode',
        position,
        data: {
          componentType,
          label: ct.label,
          instances: 1,
          status: 'idle',
          vcpuPerInstance: ct.resources.vcpu,
          ramPerInstance: ct.resources.ram,
          networkPerInstance: ct.resources.network,
          securityControls: [],
        },
      };

      pushUndo();
      setNodes((nds) => [...nds, newNode]);
      setEvaluation(null);
    },
    [pushUndo]
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance;
  }, []);

  const getWorkload = useCallback((): WorkloadType => {
    return currentLevel.workload ?? 'cpu-bound';
  }, [currentLevel]);

  const getReadWriteRatio = useCallback((): number => {
    return currentLevel.readWriteRatio ?? 0.7;
  }, [currentLevel]);

  // Run simulation and apply to nodes
  const runSim = useCallback(() => {
    const wl = getWorkload();
    const rwr = getReadWriteRatio();
    const sim = runSimulation(nodes, edges, currentLevel.requestsPerSecond, activeIncident, wl, rwr);
    setSimulation(sim);
    setNodes((nds) =>
      nds.map((n) => {
        const sn = sim.nodes.find((s) => s.id === n.id);
        if (!sn) return n;
        return {
          ...n,
          data: {
            ...n.data,
            status: sn.status,
            cpuUsage: sn.cpuUsage,
            ramUsage: sn.ramUsage,
            networkUsage: sn.networkUsage,
            receivedRps: sn.receivedRps,
            errors: sn.errors,
          },
        };
      })
    );
    return sim;
  }, [nodes, edges, currentLevel, activeIncident, getWorkload, getReadWriteRatio]);

  const handleSimulate = useCallback(() => {
    runSim();
    setIsSimulating(true);
    const interval = setInterval(() => {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: true,
          style: { ...e.style, stroke: simulation?.hasOverload ? '#ef4444' : '#10b981', strokeWidth: 2 },
        }))
      );
    }, 500);
    setSimInterval(interval);
  }, [runSim, simulation]);

  const handleStopSimulation = useCallback(() => {
    setIsSimulating(false);
    if (simInterval) {
      clearInterval(simInterval);
      setSimInterval(null);
    }
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle', cpuUsage: 0, ramUsage: 0, networkUsage: 0, receivedRps: 0, errors: 0 } }))
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: { stroke: '#64748b', strokeWidth: 2 },
      }))
    );
    setSimulation(null);
  }, [simInterval]);

  const handleEvaluate = useCallback(() => {
    const result = evaluateArchitecture(nodes, edges, currentLevel.id);
    setEvaluation(result);
    if (result.passed && !currentLevel.isLab) {
      setCompletedLevels((prev) => {
        const next = new Set(prev);
        next.add(currentLevel.id);
        return next;
      });
      if (currentLevel.id === LEVELS.filter(l => !l.isLab).length && !completedLevels.has(currentLevel.id)) {
        setShowVictory(true);
      }
    }
  }, [nodes, edges, currentLevel, completedLevels]);

  const handleClear = useCallback(() => {
    pushUndo();
    setNodes([]);
    setEdges([]);
    setEvaluation(null);
    setSimulation(null);
    setSelectedNodeId(null);
    setActiveIncident(null);
    if (simInterval) { clearInterval(simInterval); setSimInterval(null); }
    setIsSimulating(false);
  }, [simInterval, pushUndo]);

  const handleResetLevel = useCallback(() => {
    pushUndo();
    setNodes([]);
    setEdges([]);
    setEvaluation(null);
    setSimulation(null);
    setSelectedNodeId(null);
    setActiveIncident(null);
    if (simInterval) { clearInterval(simInterval); setSimInterval(null); }
    setIsSimulating(false);
  }, [simInterval, pushUndo]);

  const handleSelectLevel = useCallback((level: Level) => {
    setCurrentLevel(level);
    setNodes([]);
    setEdges([]);
    setEvaluation(null);
    setSimulation(null);
    setSelectedNodeId(null);
    setActiveIncident(null);
    setShowVictory(false);
    setUndoStack([]);
    if (simInterval) { clearInterval(simInterval); setSimInterval(null); }
    setIsSimulating(false);
  }, [simInterval]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    pushUndo();
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setEvaluation(null);
    setSelectedNodeId(null);
  }, [pushUndo]);

  const handleAdjustInstances = useCallback((nodeId: string, delta: number) => {
    pushUndo();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const current = n.data.instances ?? 1;
        const next = Math.max(1, current + delta);
        return { ...n, data: { ...n.data, instances: next } };
      })
    );
    setEvaluation(null);
    if (isSimulating) {
      setTimeout(() => {
        setNodes((nds) => {
          const wl = getWorkload();
          const rwr = getReadWriteRatio();
          const sim = runSimulation(nds, edges, currentLevel.requestsPerSecond, activeIncident, wl, rwr);
          setSimulation(sim);
          return nds.map((n) => {
            const sn = sim.nodes.find((s) => s.id === n.id);
            if (!sn) return n;
            return { ...n, data: { ...n.data, status: sn.status, cpuUsage: sn.cpuUsage, ramUsage: sn.ramUsage, networkUsage: sn.networkUsage, receivedRps: sn.receivedRps, errors: sn.errors } };
          });
        });
      }, 0);
    }
  }, [edges, isSimulating, currentLevel, activeIncident, pushUndo, getWorkload, getReadWriteRatio]);

  const handleAdjustResource = useCallback((nodeId: string, resource: 'vcpu' | 'ram', delta: number) => {
    pushUndo();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const key = resource === 'vcpu' ? 'vcpuPerInstance' : 'ramPerInstance';
        const current = (n.data as Record<string, number>)[key] ?? 1;
        const next = Math.max(1, current + delta);
        return { ...n, data: { ...n.data, [key]: next } };
      })
    );
    setEvaluation(null);
  }, [pushUndo]);

  const handleToggleSecurity = useCallback((nodeId: string, control: SecurityControlType) => {
    pushUndo();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const controls: SecurityControlType[] = n.data.securityControls ?? [];
        const has = controls.includes(control);
        return {
          ...n,
          data: {
            ...n.data,
            securityControls: has ? controls.filter((c) => c !== control) : [...controls, control],
          },
        };
      })
    );
    setEvaluation(null);
  }, [pushUndo]);

  const handleTriggerIncident = useCallback((incident: IncidentType) => {
    setActiveIncident(incident);
    const wl = getWorkload();
    const rwr = getReadWriteRatio();
    const sim = runSimulation(nodes, edges, currentLevel.requestsPerSecond, incident, wl, rwr);
    setSimulation(sim);
    setNodes((nds) =>
      nds.map((n) => {
        const sn = sim.nodes.find((s) => s.id === n.id);
        if (!sn) return n;
        return { ...n, data: { ...n.data, status: sn.status, cpuUsage: sn.cpuUsage, ramUsage: sn.ramUsage, networkUsage: sn.networkUsage, receivedRps: sn.receivedRps, errors: sn.errors } };
      })
    );
  }, [nodes, edges, currentLevel, getWorkload, getReadWriteRatio]);

  const handleClearIncident = useCallback(() => {
    setActiveIncident(null);
    if (isSimulating) {
      const wl = getWorkload();
      const rwr = getReadWriteRatio();
      const sim = runSimulation(nodes, edges, currentLevel.requestsPerSecond, null, wl, rwr);
      setSimulation(sim);
      setNodes((nds) =>
        nds.map((n) => {
          const sn = sim.nodes.find((s) => s.id === n.id);
          if (!sn) return n;
          return { ...n, data: { ...n.data, status: sn.status, cpuUsage: sn.cpuUsage, ramUsage: sn.ramUsage, networkUsage: sn.networkUsage, receivedRps: sn.receivedRps, errors: sn.errors } };
        })
      );
    } else {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle', cpuUsage: 0, ramUsage: 0, networkUsage: 0, receivedRps: 0, errors: 0 } }))
      );
      setSimulation(null);
    }
  }, [nodes, edges, currentLevel, isSimulating, getWorkload, getReadWriteRatio]);

  // Selected node state
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedSimNode: SimulationNodeState | null = (() => {
    if (!selectedNodeId || !simulation) return null;
    return simulation.nodes.find((n) => n.id === selectedNodeId) ?? null;
  })();
  const selectedNodeState: SimulationNodeState | null = (() => {
    if (!selectedNode) return null;
    if (selectedSimNode) return selectedSimNode;
    const ct = COMPONENT_MAP[selectedNode.data.componentType];
    if (!ct) return null;
    const instances = selectedNode.data.instances ?? 1;
    const vcpuPer = (selectedNode.data as Record<string, number>).vcpuPerInstance ?? ct.resources.vcpu;
    const ramPer = (selectedNode.data as Record<string, number>).ramPerInstance ?? ct.resources.ram;
    const netPer = (selectedNode.data as Record<string, number>).networkPerInstance ?? ct.resources.network;
    return {
      id: selectedNode.id,
      componentType: selectedNode.data.componentType,
      instances,
      capacityPerInstance: ct.baseCapacity,
      totalCapacity: ct.baseCapacity * instances,
      receivedRps: 0,
      outputRps: 0,
      status: 'idle',
      latency: ct.baseLatency,
      availability: ct.baseAvailability,
      cost: ct.baseCost * instances,
      vcpu: vcpuPer * instances,
      ram: ramPer * instances,
      network: netPer * instances,
      cpuUsage: 0,
      ramUsage: 0,
      networkUsage: 0,
      errors: 0,
      oomRisk: false,
    };
  })();

  // Detect if deleting the selected node would also remove connections
  const selectedNodeEdgeCount = selectedNodeId
    ? edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId).length
    : 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
              <Trophy size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-tight tracking-tight">
                Arch<span className="text-blue-400">Forge</span>
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Laboratorio de arquitectura de software</p>
            </div>
          </div>

          <LevelSelector
            currentLevel={currentLevel.id}
            completedLevels={completedLevels}
            onSelect={handleSelectLevel}
          />
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto flex flex-col gap-4">
          <LevelInfo level={currentLevel} />
          <ComponentPalette />
        </aside>

        {/* Center: React Flow board */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/30">
            <p className="text-xs text-slate-500">
              Arrastra componentes desde la izquierda. Conéctalos arrastrando desde los bordes. Selecciona un nodo y presiona Supr para eliminarlo. Ctrl+Z deshace.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Deshacer (Ctrl+Z)"
              >
                <Undo2 size={13} />
                Deshacer
              </button>
              <button
                onClick={handleResetLevel}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <RotateCcw size={13} />
                Reiniciar
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <Trash2 size={13} />
                Limpiar
              </button>
              <button
                onClick={handleEvaluate}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-500 transition-all"
              >
                <Play size={13} />
                Evaluar Arquitectura
              </button>
            </div>
          </div>

          {/* Flow canvas */}
          <div ref={wrapperRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={onInit}
              onNodeClick={(_, n) => setSelectedNodeId(n.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              onEdgeClick={(_, e) => {
                pushUndo();
                setEdges((eds) => eds.filter((ed) => ed.id !== e.id));
                setEvaluation(null);
              }}
              fitView
              defaultEdgeOptions={{ animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }}
              className="bg-slate-950"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
              <Controls className="!bg-slate-800 !border-slate-700" />
              <MiniMap
                className="!bg-slate-800 !border-slate-700"
                nodeColor={(n) => {
                  const ct = COMPONENT_MAP[n.data?.componentType as string];
                  return ct?.color || '#475569';
                }}
                maskColor="rgba(15, 23, 42, 0.7)"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="w-80 shrink-0 border-l border-slate-800 bg-slate-900/50 p-4 overflow-y-auto flex flex-col gap-4">
          <ScoreBoard
            scores={evaluation?.scores ?? null}
            details={evaluation?.scoreDetails ?? null}
            targetScore={currentLevel.targetScore}
            totalCost={evaluation?.totalCost ?? 0}
            budget={currentLevel.budget}
          />
          <SimulationPanel
            simulation={simulation}
            isSimulating={isSimulating}
            onSimulate={handleSimulate}
            onStop={handleStopSimulation}
            levelRps={currentLevel.requestsPerSecond}
            budget={currentLevel.budget}
            activeIncident={activeIncident}
            incidents={currentLevel.incidents}
            onTriggerIncident={handleTriggerIncident}
            onClearIncident={handleClearIncident}
          />
          {selectedNodeState && (
            <PropertiesPanel
              node={selectedNodeState}
              onClose={() => setSelectedNodeId(null)}
              onAdjustInstances={handleAdjustInstances}
              onAdjustResource={handleAdjustResource}
              onToggleSecurity={handleToggleSecurity}
              onDelete={handleDeleteNode}
            />
          )}
          <EvaluationResults result={evaluation} />
        </aside>
      </div>

      {/* Victory modal */}
      {showVictory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 max-w-md text-center shadow-2xl">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 mx-auto mb-4 shadow-lg shadow-amber-500/30">
              <Trophy size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">¡Felicidades!</h2>
            <p className="text-sm text-slate-400 mb-6">
              Has completado todos los casos de ArchForge. Ahora entiendes los fundamentos de arquitectura de software y system design. El Laboratorio sigue abierto para seguir experimentando.
            </p>
            <button
              onClick={() => setShowVictory(false)}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
