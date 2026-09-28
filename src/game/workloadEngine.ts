import type { WorkloadType } from './types';

export interface WorkloadProfile {
  label: string;
  description: string;
  cpuWeight: number;
  ramWeight: number;
  networkWeight: number;
  ioWeight: number;
  dbWeight: number;
}

export const WORKLOAD_PROFILES: Record<WorkloadType, WorkloadProfile> = {
  'cpu-bound': {
    label: 'CPU-bound',
    description: 'Cálculos intensivos: encriptado, compresión, procesamiento de imágenes.',
    cpuWeight: 0.7,
    ramWeight: 0.1,
    networkWeight: 0.05,
    ioWeight: 0.05,
    dbWeight: 0.1,
  },
  'memory-bound': {
    label: 'Memory-bound',
    description: 'Maneja grandes estructuras en memoria: caches, sesiones, agregaciones.',
    cpuWeight: 0.15,
    ramWeight: 0.6,
    networkWeight: 0.1,
    ioWeight: 0.05,
    dbWeight: 0.1,
  },
  'database-bound': {
    label: 'Database-bound',
    description: 'Consultas pesadas a la base de datos: reportes, joins, agregaciones.',
    cpuWeight: 0.15,
    ramWeight: 0.15,
    networkWeight: 0.05,
    ioWeight: 0.1,
    dbWeight: 0.55,
  },
  'network-bound': {
    label: 'Network-bound',
    description: 'Transfiere muchos datos: streaming, descargas, APIs con payloads grandes.',
    cpuWeight: 0.1,
    ramWeight: 0.1,
    networkWeight: 0.6,
    ioWeight: 0.1,
    dbWeight: 0.1,
  },
  'io-bound': {
    label: 'IO-bound',
    description: 'Muchas operaciones de disco: logs, lectura/escritura de archivos.',
    cpuWeight: 0.1,
    ramWeight: 0.1,
    networkWeight: 0.1,
    ioWeight: 0.6,
    dbWeight: 0.1,
  },
};

export function getWorkloadProfile(workload: WorkloadType): WorkloadProfile {
  return WORKLOAD_PROFILES[workload];
}

export function calculateResourceUsage(
  componentType: string,
  receivedRps: number,
  totalCapacity: number,
  workload: WorkloadType,
  instances: number,
  vcpu: number,
  ram: number,
  network: number
): { cpuUsage: number; ramUsage: number; networkUsage: number; oomRisk: boolean } {
  const profile = getWorkloadProfile(workload);
  const loadRatio = Math.min(1, receivedRps / Math.max(1, totalCapacity));

  // Each resource is consumed based on the workload profile weights
  // More instances = more total resources, so per-instance load decreases
  const totalVcpu = vcpu * instances;
  const totalRam = ram * instances;
  const totalNetwork = network * instances;

  // CPU usage: driven by cpuWeight, scaled by load
  const cpuUsage = Math.min(100, loadRatio * profile.cpuWeight * 100 * (1 + (1 - profile.cpuWeight) * 0.3));

  // RAM usage: driven by ramWeight, scaled by load
  // If workload is memory-bound, RAM fills faster
  const ramUsage = Math.min(100, loadRatio * profile.ramWeight * 100 * (1 + (1 - profile.ramWeight) * 0.3));

  // Network usage: driven by networkWeight
  const networkUsage = Math.min(100, loadRatio * profile.networkWeight * 100 * (1 + (1 - profile.networkWeight) * 0.3));

  // OOM risk: if RAM usage > 90% and workload is memory-bound
  const oomRisk = ramUsage > 90 && profile.ramWeight > 0.4;

  // If CPU-bound, adding RAM won't help CPU usage
  // This is implicit: cpuUsage depends on cpuWeight, not ram

  return {
    cpuUsage: Math.round(cpuUsage),
    ramUsage: Math.round(ramUsage),
    networkUsage: Math.round(networkUsage),
    oomRisk,
  };
}
