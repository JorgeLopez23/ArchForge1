import type { Edge, Node } from 'reactflow';
import type { SimulationResult, SimulationNodeState, NodeStatus, IncidentType, WorkloadType } from './types';
import { COMPONENT_MAP } from './componentTypes';
import { calculateResourceUsage } from './workloadEngine';

interface SimNode {
  id: string;
  componentType: string;
  instances: number;
  securityControls: string[];
}

interface SimEdge {
  source: string;
  target: string;
}

export function runSimulation(
  rfNodes: Node[],
  rfEdges: Edge[],
  levelRps: number,
  activeIncident: IncidentType | null,
  workload: WorkloadType = 'cpu-bound',
  readWriteRatio: number = 0.7
): SimulationResult {
  const nodes: SimNode[] = rfNodes.map((n) => ({
    id: n.id,
    componentType: n.data.componentType,
    instances: n.data.instances ?? 1,
    securityControls: n.data.securityControls ?? [],
  }));
  const edges: SimEdge[] = rfEdges.map((e) => ({ source: e.source, target: e.target }));

  // Build adjacency list (forward)
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  // Find entry points
  const hasIncoming = new Set<string>();
  edges.forEach((e) => hasIncoming.add(e.target));
  const entryNodes = nodes.filter((n) => !hasIncoming.has(n.id));

  // Initialize received traffic
  const received = new Map<string, number>();
  nodes.forEach((n) => received.set(n.id, 0));

  const frontends = entryNodes.filter((n) => n.componentType === 'frontend');
  const otherEntries = entryNodes.filter((n) => n.componentType !== 'frontend');

  if (frontends.length > 0) {
    const perFrontend = levelRps / frontends.length;
    frontends.forEach((n) => received.set(n.id, perFrontend));
  }
  if (frontends.length === 0 && otherEntries.length > 0) {
    const perEntry = levelRps / otherEntries.length;
    otherEntries.forEach((n) => received.set(n.id, perEntry));
  }

  // BFS to propagate traffic
  const visited = new Set<string>();
  const queue = [...entryNodes.map((n) => n.id)];

  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);

    const curNode = nodes.find((n) => n.id === curId);
    if (!curNode) continue;

    const curReceived = received.get(curId) || 0;
    const children = adj.get(curId) || [];
    if (children.length === 0) continue;

    let forwardRatio = 1.0;
    if (curNode.componentType === 'redis') forwardRatio = 0.3;
    if (curNode.componentType === 'postgresql') forwardRatio = 0;
    if (curNode.componentType === 'kafka') forwardRatio = 0;
    if (curNode.componentType === 'queue') forwardRatio = 0;

    const forwardTraffic = curReceived * forwardRatio;
    const perChild = forwardTraffic / children.length;

    children.forEach((childId) => {
      received.set(childId, (received.get(childId) || 0) + perChild);
      queue.push(childId);
    });
  }

  // Apply incident effects
  const downedNodes = new Set<string>();
  let rpsMultiplier = 1;

  if (activeIncident) {
    switch (activeIncident) {
      case 'backend-down': {
        const backends = nodes.filter((n) => n.componentType === 'backend');
        if (backends.length > 0) {
          const target = backends[0];
          if (target.instances > 1) {
            target.instances -= 1;
          } else {
            downedNodes.add(target.id);
          }
        }
        break;
      }
      case 'backend-saturated':
        rpsMultiplier = 2;
        break;
      case 'redis-down': {
        const redisNodes = nodes.filter((n) => n.componentType === 'redis');
        redisNodes.forEach((n) => downedNodes.add(n.id));
        break;
      }
      case 'postgresql-saturated':
        rpsMultiplier = 2;
        break;
      case 'traffic-spike':
        rpsMultiplier = levelRps > 1000 ? 5 : 3;
        break;
    }
  }

  if (rpsMultiplier > 1) {
    received.forEach((val, key) => received.set(key, val * rpsMultiplier));
  }

  // Build simulation states with resource usage
  const simNodes: SimulationNodeState[] = nodes.map((n) => {
    const ct = COMPONENT_MAP[n.componentType];
    if (!ct) {
      return {
        id: n.id,
        componentType: n.componentType,
        instances: n.instances,
        capacityPerInstance: 0,
        totalCapacity: 0,
        receivedRps: 0,
        outputRps: 0,
        status: 'idle' as NodeStatus,
        latency: 0,
        availability: 0,
        cost: 0,
        vcpu: 0,
        ram: 0,
        network: 0,
        cpuUsage: 0,
        ramUsage: 0,
        networkUsage: 0,
        errors: 0,
        oomRisk: false,
      };
    }

    const capacityPerInstance = ct.baseCapacity;
    const totalCapacity = capacityPerInstance * n.instances;
    const receivedRps = downedNodes.has(n.id) ? 0 : (received.get(n.id) || 0);

    let status: NodeStatus = 'idle';
    if (downedNodes.has(n.id)) {
      status = 'down';
    } else if (receivedRps > totalCapacity) {
      status = 'overloaded';
    } else if (receivedRps > 0) {
      status = 'active';
    }

    const baseLatency = ct.baseLatency;
    const latency = baseLatency + (status === 'overloaded' ? 200 : 0);
    const availability = ct.baseAvailability - (status === 'overloaded' ? 5 : 0);
    const cost = ct.baseCost * n.instances;

    // Calculate resource usage based on workload
    const { cpuUsage, ramUsage, networkUsage, oomRisk } = calculateResourceUsage(
      n.componentType,
      receivedRps,
      totalCapacity,
      workload,
      n.instances,
      ct.resources.vcpu,
      ct.resources.ram,
      ct.resources.network
    );

    // Calculate errors: if overloaded, the excess traffic becomes errors
    const errors = status === 'overloaded'
      ? Math.round(receivedRps - totalCapacity)
      : status === 'down'
        ? Math.round(receivedRps)
        : 0;

    // Output: what gets forwarded to children
    let outputRps = receivedRps;
    if (n.componentType === 'redis') outputRps = receivedRps * 0.3;
    if (n.componentType === 'postgresql' || n.componentType === 'kafka' || n.componentType === 'queue') outputRps = 0;
    if (status === 'overloaded') outputRps = totalCapacity * (n.componentType === 'redis' ? 0.3 : 1);
    if (status === 'down') outputRps = 0;

    const baseState: SimulationNodeState = {
      id: n.id,
      componentType: n.componentType,
      instances: n.instances,
      capacityPerInstance,
      totalCapacity,
      receivedRps: Math.round(receivedRps),
      outputRps: Math.round(outputRps),
      status,
      latency,
      availability,
      cost,
      vcpu: ct.resources.vcpu * n.instances,
      ram: ct.resources.ram * n.instances,
      network: ct.resources.network * n.instances,
      cpuUsage,
      ramUsage,
      networkUsage,
      errors,
      oomRisk,
    };

    // Redis-specific metrics
    if (n.componentType === 'redis') {
      const cacheHitRate = status === 'down' ? 0 : Math.min(0.95, 0.6 + (receivedRps / Math.max(1, totalCapacity)) * 0.3);
      baseState.cacheHitRate = Math.round(cacheHitRate * 100);
      baseState.evictions = ramUsage > 80 ? Math.round((ramUsage - 80) * 10) : 0;
    }

    // PostgreSQL-specific metrics
    if (n.componentType === 'postgresql') {
      const readsPerSec = Math.round(receivedRps * readWriteRatio);
      const writesPerSec = Math.round(receivedRps * (1 - readWriteRatio));
      baseState.connections = Math.min(100, Math.round(receivedRps / 10));
      baseState.maxConnections = 100;
      baseState.readsPerSec = readsPerSec;
      baseState.writesPerSec = writesPerSec;
      baseState.storage = 500; // GB
      baseState.iops = Math.min(3000, Math.round(receivedRps * 3));
      baseState.readLatency = status === 'overloaded' ? 50 : 15;
      baseState.writeLatency = status === 'overloaded' ? 80 : 25;
    }

    return baseState;
  });

  const totalCost = simNodes.reduce((sum, n) => sum + n.cost, 0);
  const hasOverload = simNodes.some((n) => n.status === 'overloaded');
  const hasDown = simNodes.some((n) => n.status === 'down');
  const totalErrors = simNodes.reduce((sum, n) => sum + n.errors, 0);

  // Detect bottleneck: the node with highest CPU or most errors
  let bottleneck: string | null = null;
  let maxLoad = 0;
  simNodes.forEach((n) => {
    if (n.status === 'down') {
      bottleneck = `${COMPONENT_MAP[n.componentType]?.label ?? n.componentType} (CAÍDO)`;
      maxLoad = 999;
    } else if (n.cpuUsage > maxLoad && n.cpuUsage > 80) {
      bottleneck = `${COMPONENT_MAP[n.componentType]?.label ?? n.componentType} (CPU ${n.cpuUsage}%)`;
      maxLoad = n.cpuUsage;
    } else if (n.errors > 0 && n.errors > maxLoad) {
      bottleneck = `${COMPONENT_MAP[n.componentType]?.label ?? n.componentType} (${n.errors} errores/s)`;
      maxLoad = n.errors;
    }
  });

  const activeNodes = simNodes.filter((n) => n.status === 'active' || n.status === 'overloaded');
  const totalLatency = activeNodes.length > 0
    ? Math.round(activeNodes.reduce((sum, n) => sum + n.latency, 0) / activeNodes.length)
    : 0;
  const throughput = simNodes.reduce((sum, n) => sum + n.outputRps, 0);

  return {
    nodes: simNodes,
    totalRps: levelRps * rpsMultiplier,
    totalCost,
    hasOverload,
    hasDown,
    bottleneck,
    totalErrors,
    totalLatency,
    throughput,
  };
}

export function buildComparatorData(sim: SimulationResult | null): import('./types').ComparatorData {
  if (!sim) {
    return { cpu: 0, ram: 0, latency: 0, throughput: 0, errors: 0, cost: 0, availability: 99 };
  }
  const avgCpu = sim.nodes.length > 0
    ? Math.round(sim.nodes.reduce((s, n) => s + n.cpuUsage, 0) / sim.nodes.length)
    : 0;
  const avgRam = sim.nodes.length > 0
    ? Math.round(sim.nodes.reduce((s, n) => s + n.ramUsage, 0) / sim.nodes.length)
    : 0;
  const avgAvail = sim.nodes.length > 0
    ? Math.round(sim.nodes.reduce((s, n) => s + n.availability, 0) / sim.nodes.length * 100) / 100
    : 99;
  return {
    cpu: avgCpu,
    ram: avgRam,
    latency: sim.totalLatency,
    throughput: sim.throughput,
    errors: sim.totalErrors,
    cost: sim.totalCost,
    availability: avgAvail,
  };
}
