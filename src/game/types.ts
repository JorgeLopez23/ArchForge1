export type ComponentCategory =
  | 'frontend'
  | 'backend'
  | 'infrastructure'
  | 'database'
  | 'messaging'
  | 'cache';

export type WorkloadType =
  | 'cpu-bound'
  | 'memory-bound'
  | 'database-bound'
  | 'network-bound'
  | 'io-bound';

export type SecurityControlType =
  | 'tls'
  | 'authentication'
  | 'authorization'
  | 'waf'
  | 'rate-limiting'
  | 'firewall'
  | 'private-network'
  | 'encryption-rest'
  | 'secrets-management'
  | 'audit-logs';

export interface SecurityControl {
  type: SecurityControlType;
  label: string;
  description: string;
  riskMitigated: string;
  cost: number;
}

export interface ResourceSpec {
  vcpu: number;
  ram: number;
  network: number;
}

export interface ComponentEducationalInfo {
  what: string;
  purpose: string;
  whenToUse: string;
  whenNotToUse: string;
  problemsSolved: string[];
  bottlenecks: string[];
  securityRisks: string[];
}

export interface ComponentType {
  type: string;
  label: string;
  category: ComponentCategory;
  icon: string;
  color: string;
  description: string;
  baseCapacity: number;
  baseCost: number;
  baseLatency: number;
  baseAvailability: number;
  scalable: boolean;
  resources: ResourceSpec;
  educational: ComponentEducationalInfo;
  securityControls: SecurityControlType[];
}

export interface LevelRequirement {
  users: string;
  availability: string;
  performance: string;
  security: string;
  cost: string;
}

export type IncidentType =
  | 'backend-down'
  | 'backend-saturated'
  | 'redis-down'
  | 'postgresql-saturated'
  | 'traffic-spike';

export interface IncidentDef {
  type: IncidentType;
  label: string;
  description: string;
  icon: string;
}

export interface LabConfig {
  users: number;
  requestsPerSecond: number;
  readWriteRatio: number;
  payloadSize: number;
  workload: WorkloadType;
  externalLatency: number;
}

export interface Level {
  id: number;
  title: string;
  subtitle: string;
  scenario: string;
  requirements: LevelRequirement;
  hints: string[];
  targetScore: number;
  requestsPerSecond: number;
  budget: number;
  incidents: IncidentDef[];
  isLab?: boolean;
  labConfig?: LabConfig;
  readWriteRatio?: number;
  workload?: WorkloadType;
  externalLatency?: number;
}

export interface ScoreBreakdown {
  scalability: number;
  availability: number;
  security: number;
  cost: number;
  complexity: number;
  total: number;
}

export interface ScoreExplanation {
  label: string;
  delta: number;
}

export interface ScoreDetail {
  scalability: ScoreExplanation[];
  availability: ScoreExplanation[];
  security: ScoreExplanation[];
  cost: ScoreExplanation[];
  complexity: ScoreExplanation[];
}

export type IssueSeverity = 'good' | 'warning' | 'error';

export interface EvaluationIssue {
  severity: IssueSeverity;
  message: string;
  component?: string;
}

export interface SecurityFinding {
  severity: IssueSeverity;
  control: SecurityControlType;
  message: string;
  risk: string;
}

export interface EvaluationResult {
  scores: ScoreBreakdown;
  scoreDetails: ScoreDetail;
  issues: EvaluationIssue[];
  securityFindings: SecurityFinding[];
  passed: boolean;
  summary: string;
  totalCost: number;
  budgetExceeded: boolean;
  symptoms: string[];
}

export type NodeStatus = 'idle' | 'active' | 'overloaded' | 'down';

export interface SimulationNodeState {
  id: string;
  componentType: string;
  instances: number;
  capacityPerInstance: number;
  totalCapacity: number;
  receivedRps: number;
  outputRps: number;
  status: NodeStatus;
  latency: number;
  availability: number;
  cost: number;
  vcpu: number;
  ram: number;
  network: number;
  cpuUsage: number;
  ramUsage: number;
  networkUsage: number;
  errors: number;
  oomRisk: boolean;
  cacheHitRate?: number;
  evictions?: number;
  connections?: number;
  maxConnections?: number;
  readsPerSec?: number;
  writesPerSec?: number;
  storage?: number;
  iops?: number;
  readLatency?: number;
  writeLatency?: number;
}

export interface SimulationResult {
  nodes: SimulationNodeState[];
  totalRps: number;
  totalCost: number;
  hasOverload: boolean;
  hasDown: boolean;
  bottleneck: string | null;
  totalErrors: number;
  totalLatency: number;
  throughput: number;
}

export interface ComparatorData {
  cpu: number;
  ram: number;
  latency: number;
  throughput: number;
  errors: number;
  cost: number;
  availability: number;
}

export interface ComparatorSnapshot {
  before: ComparatorData | null;
  after: ComparatorData | null;
}
