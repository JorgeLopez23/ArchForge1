import type { Edge, Node } from 'reactflow';
import type {
  SimulationResult,
  SimulationNodeState,
  NodeStatus,
  IncidentType,
  WorkloadType,
  ComparatorData,
} from './types';
import { COMPONENT_MAP } from './componentTypes';
import { getWorkloadProfile } from './workloadEngine';

/**
 * Deterministic simulation engine.
 *
 * Model assumptions:
 * - Each node has a fixed per-instance capacity (req/s) derived from its
 *   component type and the vCPU/RAM the user configured.
 * - Traffic flows from entry nodes (no incoming edges) downstream via BFS.
 *   Redis absorbs a fraction of read traffic (cache hit); sinks (DB, Kafka,
 *   Queue) absorb everything they receive.
 * - A node that is "down" receives traffic but processes zero — all
 *   received requests become failed. Its children receive nothing from it,
 *   so requests don't "disappear", they are counted as failed at the down
 *   node.
 * - A node that is "overloaded" processes up to its capacity; the excess is
 *   counted as rejected. Children only receive what was actually processed.
 * - Throughput is the sum of *processed* requests at the terminal nodes
 *   (sinks), avoiding double-counting intermediate hops.
 * - Resource usage (CPU/RAM/Network %) depends on the workload profile and
 *   the ratio of received requests to effective capacity. Adding RAM does
 *   not reduce CPU usage under a CPU-bound workload.
 */

interface SimNodeInput {
  id: string;
  componentType: string;
  instances: number;
  vcpuPerInstance: number;
  ramPerInstance: number;
  networkPerInstance: number;
}

interface SimEdgeInput {
  source: string;
  target: string;
}

/** Requests received, processed, rejected, failed, and queued per node. */
interface NodeTraffic {
  received: number;
  processed: number;
  rejected: number;
  failed: number;
  queued: number;
}

/**
 * Effective per-instance capacity in req/s.
 * Scales the base capacity by the ratio of configured vCPU to the component's
 * baseline vCPU, so upgrading vCPU genuinely increases throughput.
 */
function effectiveCapacityPerInstance(
  baseCapacity: number,
  baseVcpu: number,
  actualVcpu: number,
  workload: WorkloadType,
  componentType: string,
): number {
  // For database-bound workloads on backend/api-gateway, adding vCPU has
  // diminishing returns — the bottleneck is the DB, not the CPU.
  const profile = getWorkloadProfile(workload);
  let cpuFactor: number;
  if (componentType === 'backend' || componentType === 'api-gateway') {
    cpuFactor = profile.cpuWeight < 0.3 ? 0.3 + profile.cpuWeight : 1.0;
  } else {
    cpuFactor = 1.0;
  }
  const vcpuRatio = actualVcpu / Math.max(1, baseVcpu);
  return Math.round(baseCapacity * (0.5 + 0.5 * vcpuRatio * cpuFactor));
}

/**
 * Latency for a node given its load ratio and workload.
 * Deterministic: base + queueing delay proportional to utilization.
 */
function nodeLatency(
  baseLatency: number,
  loadRatio: number,
  status: NodeStatus,
  workload: WorkloadType,
  componentType: string,
): number {
  if (status === 'down') return 0;
  const profile = getWorkloadProfile(workload);
  let latency = baseLatency;
  // Queueing delay grows non-linearly as utilization approaches 100%
  if (loadRatio > 0.7) {
    const queueFactor = Math.pow(loadRatio / 0.7, 3);
    latency += baseLatency * (queueFactor - 1) * 0.5;
  }
  // Database-bound: backend latency increases more from DB wait time
  if (componentType === 'backend' && profile.dbWeight > 0.4) {
    latency += loadRatio * 30 * profile.dbWeight;
  }
  if (status === 'overloaded') {
    latency += 200;
  }
  return Math.round(latency);
}

function nodeStatus(
  isDown: boolean,
  received: number,
  capacity: number,
): NodeStatus {
  if (isDown) return 'down';
  if (received > capacity) return 'overloaded';
  if (received > 0) return 'active';
  return 'idle';
}

export function runSimulation(
  rfNodes: Node[],
  rfEdges: Edge[],
  levelRps: number,
  activeIncident: IncidentType | null,
  workload: WorkloadType = 'cpu-bound',
  readWriteRatio: number = 0.7,
): SimulationResult {
  // --- Parse inputs -------------------------------------------------------
  const nodes: SimNodeInput[] = rfNodes.map((n) => {
    const ct = COMPONENT_MAP[n.data.componentType];
    return {
      id: n.id,
      componentType: n.data.componentType,
      instances: n.data.instances ?? 1,
      vcpuPerInstance: n.data.vcpuPerInstance ?? ct?.resources.vcpu ?? 1,
      ramPerInstance: n.data.ramPerInstance ?? ct?.resources.ram ?? 1,
      networkPerInstance: n.data.networkPerInstance ?? ct?.resources.network ?? 100,
    };
  });
  const edges: SimEdgeInput[] = rfEdges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  // --- Apply incidents (deterministic) -----------------------------------
  const downedNodes = new Set<string>();
  let rpsMultiplier = 1;

  // Work on a copy of instances so incidents don't mutate the real state
  const effectiveInstances = new Map<string, number>();
  nodes.forEach((n) => effectiveInstances.set(n.id, n.instances));

  if (activeIncident) {
    switch (activeIncident) {
      case 'backend-down': {
        const backends = nodes.filter((n) => n.componentType === 'backend');
        if (backends.length > 0) {
          const target = backends[0];
          const cur = effectiveInstances.get(target.id) ?? 1;
          if (cur > 1) {
            effectiveInstances.set(target.id, cur - 1);
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
        nodes
          .filter((n) => n.componentType === 'redis')
          .forEach((n) => downedNodes.add(n.id));
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

  const effectiveRps = levelRps * rpsMultiplier;

  // --- Build graph --------------------------------------------------------
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  const hasIncoming = new Set<string>();
  edges.forEach((e) => hasIncoming.add(e.target));
  const entryNodes = nodes.filter((n) => !hasIncoming.has(n.id));

  // --- Distribute ingress traffic ----------------------------------------
  const traffic = new Map<string, NodeTraffic>();
  nodes.forEach((n) =>
    traffic.set(n.id, { received: 0, processed: 0, rejected: 0, failed: 0, queued: 0 }),
  );

  const frontends = entryNodes.filter((n) => n.componentType === 'frontend');
  const otherEntries = entryNodes.filter((n) => n.componentType !== 'frontend');

  if (frontends.length > 0) {
    const per = effectiveRps / frontends.length;
    frontends.forEach((n) => {
      const t = traffic.get(n.id)!;
      t.received = per;
    });
  } else if (otherEntries.length > 0) {
    const per = effectiveRps / otherEntries.length;
    otherEntries.forEach((n) => {
      const t = traffic.get(n.id)!;
      t.received = per;
    });
  }

  // --- BFS propagation ----------------------------------------------------
  // Process nodes in topological-ish order (BFS from entries). Each node:
  //   1. Determines how many requests it can process (capacity).
  //   2. Excess = rejected (overloaded) or failed (down).
  //   3. Forwards processed requests to children (minus absorption ratio).
  const visited = new Set<string>();
  const queue = [...entryNodes.map((n) => n.id)];

  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);

    const curNode = nodes.find((n) => n.id === curId);
    if (!curNode) continue;

    const ct = COMPONENT_MAP[curNode.componentType];
    const t = traffic.get(curId)!;
    const isDown = downedNodes.has(curId);
    const inst = effectiveInstances.get(curId) ?? 1;

    const capPerInst = ct
      ? effectiveCapacityPerInstance(
          ct.baseCapacity,
          ct.resources.vcpu,
          curNode.vcpuPerInstance,
          workload,
          curNode.componentType,
        )
      : 0;
    const capacity = capPerInst * inst;

    if (isDown) {
      t.failed = t.received;
      t.processed = 0;
      t.rejected = 0;
    } else if (t.received > capacity) {
      t.processed = capacity;
      t.rejected = t.received - capacity;
    } else {
      t.processed = t.received;
      t.rejected = 0;
    }
    t.queued = 0; // no time-stepped queue in this model

    // Forward to children
    const children = adj.get(curId) ?? [];
    if (children.length === 0) continue;

    // Absorption ratio: fraction of *processed* requests that this node
    // does NOT forward downstream.
    let forwardRatio = 1.0;
    if (curNode.componentType === 'redis') {
      // Redis serves 70% from cache; 30% misses go to DB
      forwardRatio = 0.3;
    }
    if (
      curNode.componentType === 'postgresql' ||
      curNode.componentType === 'kafka' ||
      curNode.componentType === 'queue'
    ) {
      forwardRatio = 0; // sinks
    }

    const forwarded = t.processed * forwardRatio;
    const perChild = forwarded / children.length;
    children.forEach((childId) => {
      const ct2 = traffic.get(childId);
      if (ct2) ct2.received += perChild;
      if (!visited.has(childId)) queue.push(childId);
    });
  }

  // --- Build per-node state ----------------------------------------------
  const simNodes: SimulationNodeState[] = nodes.map((n) => {
    const ct = COMPONENT_MAP[n.componentType];
    const t = traffic.get(n.id)!;
    const isDown = downedNodes.has(n.id);
    const inst = effectiveInstances.get(n.id) ?? 1;

    if (!ct) {
      return {
        id: n.id,
        componentType: n.componentType,
        instances: inst,
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

    const capPerInst = effectiveCapacityPerInstance(
      ct.baseCapacity,
      ct.resources.vcpu,
      n.vcpuPerInstance,
      workload,
      n.componentType,
    );
    const capacity = capPerInst * inst;
    const status = nodeStatus(isDown, t.received, capacity);
    const loadRatio = Math.min(1, t.received / Math.max(1, capacity));

    const latency = nodeLatency(ct.baseLatency, loadRatio, status, workload, n.componentType);
    const availability = ct.baseAvailability - (status === 'overloaded' ? 5 : 0) - (isDown ? 100 : 0);
    const cost = ct.baseCost * n.instances;

    // Resource usage
    const profile = getWorkloadProfile(workload);
    const cpuUsage = Math.round(
      Math.min(100, loadRatio * profile.cpuWeight * 100 * (1 + (1 - profile.cpuWeight) * 0.3)),
    );
    const ramUsage = Math.round(
      Math.min(100, loadRatio * profile.ramWeight * 100 * (1 + (1 - profile.ramWeight) * 0.3)),
    );
    const networkUsage = Math.round(
      Math.min(100, loadRatio * profile.networkWeight * 100 * (1 + (1 - profile.networkWeight) * 0.3)),
    );
    const oomRisk = ramUsage > 90 && profile.ramWeight > 0.4;

    const errors = isDown ? Math.round(t.failed) : Math.round(t.rejected);
    const outputRps = Math.round(t.processed * (n.componentType === 'redis' ? 0.3 : n.componentType === 'postgresql' || n.componentType === 'kafka' || n.componentType === 'queue' ? 0 : 1));

    const base: SimulationNodeState = {
      id: n.id,
      componentType: n.componentType,
      instances: n.instances,
      capacityPerInstance: capPerInst,
      totalCapacity: capacity,
      receivedRps: Math.round(t.received),
      outputRps,
      status,
      latency,
      availability: Math.max(0, availability),
      cost,
      vcpu: n.vcpuPerInstance * n.instances,
      ram: n.ramPerInstance * n.instances,
      network: n.networkPerInstance * n.instances,
      cpuUsage,
      ramUsage,
      networkUsage,
      errors,
      oomRisk,
    };

    // Redis-specific
    if (n.componentType === 'redis') {
      const hitRate = isDown ? 0 : Math.min(0.95, 0.6 + loadRatio * 0.3);
      base.cacheHitRate = Math.round(hitRate * 100);
      base.evictions = ramUsage > 80 ? Math.round((ramUsage - 80) * 10) : 0;
    }

    // PostgreSQL-specific
    if (n.componentType === 'postgresql') {
      base.connections = Math.min(100, Math.round(t.received / 10));
      base.maxConnections = 100;
      base.readsPerSec = Math.round(t.processed * readWriteRatio);
      base.writesPerSec = Math.round(t.processed * (1 - readWriteRatio));
      base.storage = 500;
      base.iops = Math.min(3000, Math.round(t.processed * 3));
      base.readLatency = status === 'overloaded' ? 50 : 15;
      base.writeLatency = status === 'overloaded' ? 80 : 25;
    }

    return base;
  });

  // --- Aggregate metrics --------------------------------------------------
  const totalCost = simNodes.reduce((s, n) => s + n.cost, 0);
  const hasOverload = simNodes.some((n) => n.status === 'overloaded');
  const hasDown = simNodes.some((n) => n.status === 'down');
  const totalErrors = simNodes.reduce((s, n) => s + n.errors, 0);

  // Throughput: sum of processed at sink nodes (avoids double-counting)
  const sinkTypes = new Set(['postgresql', 'kafka', 'queue', 'redis']);
  const throughput = simNodes
    .filter((n) => sinkTypes.has(n.componentType))
    .reduce((s, n) => s + n.receivedRps, 0);

  // Bottleneck detection
  let bottleneck: string | null = null;
  let maxScore = 0;
  simNodes.forEach((n) => {
    const label = COMPONENT_MAP[n.componentType]?.label ?? n.componentType;
    let score = 0;
    if (n.status === 'down') score = 1000;
    else if (n.status === 'overloaded') score = 500 + n.errors;
    else if (n.cpuUsage > 80) score = n.cpuUsage;
    if (score > maxScore) {
      maxScore = score;
      if (n.status === 'down') bottleneck = `${label} (CAÍDO)`;
      else if (n.status === 'overloaded') bottleneck = `${label} (CPU ${n.cpuUsage}% · ${n.errors} err/s)`;
      else bottleneck = `${label} (CPU ${n.cpuUsage}%)`;
    }
  });

  // Average latency across active nodes (end-to-end path estimate)
  const activeNodes = simNodes.filter((n) => n.status === 'active' || n.status === 'overloaded');
  const totalLatency = activeNodes.length > 0
    ? Math.round(activeNodes.reduce((s, n) => s + n.latency, 0))
    : 0;

  return {
    nodes: simNodes,
    totalRps: effectiveRps,
    totalCost,
    hasOverload,
    hasDown,
    bottleneck,
    totalErrors,
    totalLatency,
    throughput: Math.round(throughput),
  };
}

export function buildComparatorData(sim: SimulationResult | null): ComparatorData {
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
