import type { Edge, Node } from 'reactflow';
import type { EvaluationResult, EvaluationIssue, ScoreBreakdown, ScoreDetail, ScoreExplanation, IssueSeverity, SecurityFinding } from './types';
import { LEVELS } from './levels';
import { COMPONENT_MAP } from './componentTypes';
import { analyzeSecurity } from './securityEngine';

interface BoardNode {
  id: string;
  type: string;
  instances: number;
}

interface BoardEdge {
  source: string;
  target: string;
}

function hasComponent(nodes: BoardNode[], type: string): boolean {
  return nodes.some((n) => n.type === type);
}

function countComponent(nodes: BoardNode[], type: string): number {
  return nodes.filter((n) => n.type === type).length;
}

function totalInstances(nodes: BoardNode[], type: string): number {
  return nodes.filter((n) => n.type === type).reduce((sum, n) => sum + n.instances, 0);
}

function isConnectedTo(edges: BoardEdge[], nodes: BoardNode[], fromType: string, toType: string): boolean {
  const fromIds = nodes.filter((n) => n.type === fromType).map((n) => n.id);
  const toIds = nodes.filter((n) => n.type === toType).map((n) => n.id);
  return edges.some((e) => fromIds.includes(e.source) && toIds.includes(e.target));
}

function isAnyConnectedTo(edges: BoardEdge[], nodes: BoardNode[], toType: string): boolean {
  const toIds = nodes.filter((n) => n.type === toType).map((n) => n.id);
  return edges.some((e) => toIds.includes(e.target));
}

function hasPath(edges: BoardEdge[], nodes: BoardNode[], fromType: string, toType: string): boolean {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });
  const startIds = nodes.filter((n) => n.type === fromType).map((n) => n.id);
  const targetIds = new Set(nodes.filter((n) => n.type === toType).map((n) => n.id));
  const visited = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (targetIds.has(cur)) return true;
    const neighbors = adj.get(cur) || [];
    queue.push(...neighbors);
  }
  return false;
}

function hasCycle(edges: BoardEdge[], nodes: BoardNode[]): boolean {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });
  const nodeIds = nodes.map((n) => n.id);
  const visited = new Set<string>();
  const recStack = new Set<string>();
  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    const neighbors = adj.get(node) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        if (dfs(n)) return true;
      } else if (recStack.has(n)) return true;
    }
    recStack.delete(node);
    return false;
  }
  for (const id of nodeIds) {
    if (!visited.has(id)) {
      if (dfs(id)) return true;
    }
  }
  return false;
}

function findOrphans(edges: BoardEdge[], nodes: BoardNode[]): string[] {
  const connectedIds = new Set<string>();
  edges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target); });
  return nodes.filter((n) => !connectedIds.has(n.id)).map((n) => n.type);
}

function cap(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function calcTotalCost(rfNodes: Node[]): number {
  return rfNodes.reduce((sum, n) => {
    const ct = COMPONENT_MAP[n.data.componentType];
    if (!ct) return sum;
    return sum + ct.baseCost * (n.data.instances ?? 1);
  }, 0);
}

export function evaluateArchitecture(
  rfNodes: Node[],
  rfEdges: Edge[],
  levelId: number
): EvaluationResult {
  const nodes: BoardNode[] = rfNodes.map((n) => ({ id: n.id, type: n.data.componentType, instances: n.data.instances ?? 1 }));
  const edges: BoardEdge[] = rfEdges.map((e) => ({ source: e.source, target: e.target }));
  const level = LEVELS.find((l) => l.id === levelId)!;

  const issues: EvaluationIssue[] = [];
  const details: ScoreDetail = {
    scalability: [],
    availability: [],
    security: [],
    cost: [],
    complexity: [],
  };

  const addScore = (cat: keyof ScoreDetail, label: string, delta: number) => {
    details[cat].push({ label, delta });
  };

  const has = (t: string) => hasComponent(nodes, t);
  const count = (t: string) => countComponent(nodes, t);
  const instances = (t: string) => totalInstances(nodes, t);
  const connected = (f: string, t: string) => isConnectedTo(edges, nodes, f, t);
  const path = (f: string, t: string) => hasPath(edges, nodes, f, t);
  const anyConnectedTo = (t: string) => isAnyConnectedTo(edges, nodes, t);

  let scalability = 50;
  let availability = 50;
  let security = 50;
  let cost = 50;
  let complexity = 50;

  const totalCost = calcTotalCost(rfNodes);
  const budgetExceeded = totalCost > level.budget;

  if (nodes.length === 0) {
    return {
      scores: { scalability: 0, availability: 0, security: 0, cost: 0, complexity: 0, total: 0 },
      scoreDetails: details,
      issues: [{ severity: 'error', message: 'El tablero está vacío. Arrastra componentes para empezar.' }],
      securityFindings: [],
      passed: false,
      summary: 'No hay arquitectura que evaluar.',
      totalCost: 0,
      budgetExceeded: false,
      symptoms: [],
    };
  }

  // === Common checks ===
  if (!has('frontend')) {
    issues.push({ severity: 'error', message: 'Falta un Frontend. Los usuarios necesitan una interfaz para interactuar con el sistema.' });
    scalability -= 20; addScore('scalability', 'Falta Frontend', -20);
    availability -= 10; addScore('availability', 'Falta Frontend', -10);
  }
  if (!has('backend')) {
    issues.push({ severity: 'error', message: 'Falta un Backend. Sin lógica de servidor la aplicación no puede funcionar.' });
    scalability -= 20; addScore('scalability', 'Falta Backend', -20);
    availability -= 20; addScore('availability', 'Falta Backend', -20);
  }
  if (!has('postgresql')) {
    issues.push({ severity: 'error', message: 'Falta una base de datos (PostgreSQL). Los datos persistentes son esenciales.' });
    availability -= 20; addScore('availability', 'Falta PostgreSQL', -20);
  }
  if (has('frontend') && has('backend') && !path('frontend', 'backend')) {
    issues.push({ severity: 'error', message: 'El Frontend no está conectado al Backend. No hay camino de datos entre la interfaz y el servidor.' });
    availability -= 15; addScore('availability', 'Frontend sin conexión a Backend', -15);
  }
  if (has('backend') && has('postgresql') && !path('backend', 'postgresql')) {
    issues.push({ severity: 'error', message: 'El Backend no está conectado a PostgreSQL. Los datos no se pueden persistir.' });
    availability -= 15; addScore('availability', 'Backend sin conexión a PostgreSQL', -15);
  }

  const orphans = findOrphans(edges, nodes);
  if (orphans.length > 0) {
    issues.push({ severity: 'warning', message: `Componentes sin conexión: ${orphans.join(', ')}. Todo componente debería integrarse en el flujo de datos.` });
    complexity -= 10; addScore('complexity', `Componentes huérfanos (${orphans.length})`, -10);
    availability -= 5; addScore('availability', 'Componentes huérfanos', -5);
  }
  if (hasCycle(edges, nodes)) {
    issues.push({ severity: 'warning', message: 'Se detectó un ciclo en el grafo. Esto puede causar dependencias circulares y problemas en producción.' });
    complexity -= 10; addScore('complexity', 'Ciclo detectado en el grafo', -10);
  }

  // Budget check
  if (budgetExceeded) {
    issues.push({ severity: 'error', message: `Presupuesto excedido: $${totalCost}/mes vs $${level.budget}/mes de presupuesto. Reduce componentes o instancias.` });
    cost -= 30; addScore('cost', `Presupuesto excedido ($${totalCost} > $${level.budget})`, -30);
  } else {
    const budgetUtilization = totalCost / level.budget;
    if (budgetUtilization < 0.4) {
      issues.push({ severity: 'good', message: `Excelente gestión de presupuesto: $${totalCost}/mes de $${level.budget} disponible.` });
      cost += 20; addScore('cost', `Uso eficiente del presupuesto (${Math.round(budgetUtilization * 100)}%)`, 20);
    } else {
      cost += 10; addScore('cost', `Dentro del presupuesto (${Math.round(budgetUtilization * 100)}%)`, 10);
    }
  }

  // === Level 1 ===
  if (levelId === 1) {
    const backends = count('backend');
    if (backends > 1) {
      issues.push({ severity: 'warning', message: `Tienes ${backends} Backends. Para 1,000 usuarios una sola instancia es suficiente — reduce costos.` });
      cost -= 15; addScore('cost', `Backends excesivos (${backends}) para 1K usuarios`, -15);
    }
    if (has('load-balancer')) {
      issues.push({ severity: 'warning', message: 'Un Load Balancer es innecesario para 1,000 usuarios. Agrega costo sin beneficio real.' });
      cost -= 20; addScore('cost', 'Load Balancer innecesario a esta escala', -20);
    }
    if (has('kafka')) {
      issues.push({ severity: 'warning', message: 'Kafka es excesivo para 1,000 usuarios. Agrega complejidad y costo innecesarios.' });
      cost -= 15; addScore('cost', 'Kafka innecesario a esta escala', -15);
      complexity -= 15; addScore('complexity', 'Kafka innecesario a esta escala', -15);
    }
    if (has('queue')) {
      issues.push({ severity: 'warning', message: 'Una Queue no es necesaria a esta escala. Simplifica tu arquitectura.' });
      cost -= 10; addScore('cost', 'Queue innecesaria a esta escala', -10);
      complexity -= 10; addScore('complexity', 'Queue innecesaria a esta escala', -10);
    }
    if (has('api-gateway')) {
      issues.push({ severity: 'warning', message: 'Un API Gateway es opcional a esta escala. Considera si el costo extra se justifica.' });
      cost -= 5; addScore('cost', 'API Gateway opcional a esta escala', -5);
    }
    if (has('redis')) {
      issues.push({ severity: 'good', message: 'Redis puede ayudar a reducir latencia, pero es opcional a esta escala.' });
      scalability += 5; addScore('scalability', 'Redis para reducir latencia', 5);
    }
    if (has('frontend') && has('backend') && has('postgresql') && nodes.length === 3) {
      issues.push({ severity: 'good', message: 'Arquitectura mínima y eficiente para 1,000 usuarios. Excelente relación costo-beneficio.' });
      cost += 25; addScore('cost', 'Arquitectura mínima eficiente', 25);
      complexity += 20; addScore('complexity', 'Arquitectura mínima eficiente', 20);
    }
    if (has('frontend') && has('backend') && has('postgresql') && path('frontend', 'backend') && path('backend', 'postgresql')) {
      issues.push({ severity: 'good', message: 'Flujo de datos correcto: Frontend → Backend → PostgreSQL.' });
      scalability += 15; addScore('scalability', 'Flujo de datos correcto', 15);
      availability += 15; addScore('availability', 'Flujo de datos correcto', 15);
    }
    scalability += 10; addScore('scalability', 'Base de escalabilidad', 10);
    availability += 10; addScore('availability', 'Base de disponibilidad', 10);
    security += 10; addScore('security', 'Base de seguridad', 10);
    cost += 20; addScore('cost', 'Base de costo', 20);
    complexity += 20; addScore('complexity', 'Base de complejidad', 20);
  }

  // === Level 2 ===
  if (levelId === 2) {
    const backendInstances = instances('backend');
    if (backendInstances < 2) {
      issues.push({ severity: 'error', message: `Solo tienes ${backendInstances} instancia(s) de Backend. Para 100,000 usuarios necesitas múltiples instancias para escalar horizontalmente.` });
      scalability -= 25; addScore('scalability', `Insuficientes instancias Backend (${backendInstances})`, -25);
      availability -= 20; addScore('availability', 'Single point of failure en Backend', -20);
    } else {
      issues.push({ severity: 'good', message: `${backendInstances} instancias de Backend permiten escalar horizontalmente.` });
      scalability += 20; addScore('scalability', `Múltiples instancias Backend (${backendInstances})`, 20);
      availability += 10; addScore('availability', `Redundancia con ${backendInstances} Backends`, 10);
    }
    if (!has('load-balancer')) {
      issues.push({ severity: 'error', message: 'Falta un Load Balancer. Sin él, no puedes distribuir tráfico entre múltiples backends.' });
      availability -= 25; addScore('availability', 'Falta Load Balancer', -25);
      scalability -= 15; addScore('scalability', 'Falta Load Balancer', -15);
    } else {
      issues.push({ severity: 'good', message: 'Load Balancer presente: distribuye tráfico y mejora disponibilidad.' });
      availability += 20; addScore('availability', 'Load Balancer para distribución de tráfico', 20);
      scalability += 10; addScore('scalability', 'Load Balancer para escalado', 10);
    }
    if (has('load-balancer') && has('backend') && !connected('load-balancer', 'backend')) {
      issues.push({ severity: 'error', message: 'El Load Balancer no está conectado a los Backends. Debe enrutar tráfico hacia ellos.' });
      availability -= 15; addScore('availability', 'Load Balancer sin conexión a Backends', -15);
    }
    if (!has('redis')) {
      issues.push({ severity: 'warning', message: 'Sin Redis, cada lectura golpea la base de datos. A 100K usuarios esto causará cuellos de botella.' });
      scalability -= 10; addScore('scalability', 'Falta Redis para caché', -10);
    } else {
      issues.push({ severity: 'good', message: 'Redis presente: reduce latencia y carga en PostgreSQL.' });
      scalability += 15; addScore('scalability', 'Redis para reducir carga en PostgreSQL', 15);
      cost -= 5; addScore('cost', 'Costo de Redis', -5);
    }
    if (has('redis') && has('backend') && !connected('backend', 'redis')) {
      issues.push({ severity: 'warning', message: 'Redis no está conectado al Backend. El caché no se está usando.' });
      scalability -= 10; addScore('scalability', 'Redis sin conexión al Backend', -10);
    }
    if (!has('api-gateway')) {
      issues.push({ severity: 'warning', message: 'Sin API Gateway, la autenticación y rate limiting deben manejarse en cada backend. Considera centralizarlos.' });
      security -= 15; addScore('security', 'Falta API Gateway para seguridad centralizada', -15);
    } else {
      issues.push({ severity: 'good', message: 'API Gateway presente: centraliza autenticación, rate limiting y enrutado.' });
      security += 20; addScore('security', 'API Gateway para seguridad centralizada', 20);
    }
    if (has('api-gateway') && has('frontend') && !path('frontend', 'api-gateway')) {
      issues.push({ severity: 'warning', message: 'El Frontend no pasa por el API Gateway. Debería enrutar el tráfico a través de él.' });
      security -= 10; addScore('security', 'Frontend no enruta vía API Gateway', -10);
    }
    if (has('kafka') || has('queue')) {
      issues.push({ severity: 'good', message: 'Mensajería asíncrona presente: ayuda a desacoplar servicios y absorber picos.' });
      scalability += 10; addScore('scalability', 'Mensajería asíncrona para absorber picos', 10);
      complexity -= 5; addScore('complexity', 'Complejidad de mensajería asíncrona', -5);
    }
    security += 10; addScore('security', 'Base de seguridad', 10);
    cost += 5; addScore('cost', 'Base de costo', 5);
    complexity += 5; addScore('complexity', 'Base de complejidad', 5);
  }

  // === Level 3 ===
  if (levelId === 3) {
    const backendInstances = instances('backend');
    if (backendInstances < 2) {
      issues.push({ severity: 'error', message: 'Una sola instancia de Backend es un punto único de fallo. Para 99.99% necesitas redundancia.' });
      availability -= 30; addScore('availability', 'Backend es Single Point of Failure', -30);
    } else {
      issues.push({ severity: 'good', message: `${backendInstances} instancias de Backend proporcionan redundancia para alta disponibilidad.` });
      availability += 20; addScore('availability', `Redundancia con ${backendInstances} Backends`, 20);
      scalability += 15; addScore('scalability', `Múltiples instancias Backend (${backendInstances})`, 15);
    }
    if (!has('load-balancer')) {
      issues.push({ severity: 'error', message: 'Falta un Load Balancer. Es obligatorio para alta disponibilidad (99.99%).' });
      availability -= 30; addScore('availability', 'Falta Load Balancer para 99.99%', -30);
    } else {
      issues.push({ severity: 'good', message: 'Load Balancer presente: essential para failover automático.' });
      availability += 20; addScore('availability', 'Load Balancer para failover automático', 20);
    }
    if (!has('api-gateway')) {
      issues.push({ severity: 'error', message: 'Sin API Gateway no puedes centralizar seguridad, rate limiting ni auditoría. Crítico para pagos.' });
      security -= 30; addScore('security', 'Falta API Gateway para pagos', -30);
    } else {
      issues.push({ severity: 'good', message: 'API Gateway presente: centraliza seguridad y auditoría de transacciones.' });
      security += 25; addScore('security', 'API Gateway para seguridad y auditoría', 25);
    }
    if (!has('kafka') && !has('queue')) {
      issues.push({ severity: 'error', message: 'No hay sistema de mensajería (Kafka o Queue). Los pagos pueden perderse si un servicio cae.' });
      availability -= 25; addScore('availability', 'Falta mensajería para pagos confiables', -25);
      security -= 15; addScore('security', 'Falta mensajería para durabilidad', -15);
    } else {
      if (has('kafka')) {
        issues.push({ severity: 'good', message: 'Kafka garantiza durabilidad de mensajes: los pagos no se pierden.' });
        availability += 20; addScore('availability', 'Kafka para durabilidad de pagos', 20);
      }
      if (has('queue')) {
        issues.push({ severity: 'good', message: 'Queue para procesamiento asíncrono de pagos: desacopla y protege contra fallos.' });
        availability += 15; addScore('availability', 'Queue para procesamiento asíncrono', 15);
      }
    }
    if (has('kafka') && has('backend') && !anyConnectedTo('kafka')) {
      issues.push({ severity: 'warning', message: 'Kafka no está conectado a ningún componente. Debe integrarse en el flujo de pagos.' });
      availability -= 10; addScore('availability', 'Kafka sin conexiones', -10);
    }
    if (has('queue') && has('backend') && !anyConnectedTo('queue')) {
      issues.push({ severity: 'warning', message: 'La Queue no está conectada. Debe recibir tareas de procesamiento de pagos.' });
      availability -= 10; addScore('availability', 'Queue sin conexiones', -10);
    }
    if (!has('redis')) {
      issues.push({ severity: 'warning', message: 'Sin Redis, las consultas frecuentes golpean PostgreSQL directamente. Reduce latencia con un caché.' });
      scalability -= 10; addScore('scalability', 'Falta Redis para reducir latencia', -10);
    } else {
      issues.push({ severity: 'good', message: 'Redis presente: reduce latencia de consultas y mejora throughput.' });
      scalability += 15; addScore('scalability', 'Redis para reducir latencia', 15);
    }
    if (has('frontend') && has('api-gateway') && !path('frontend', 'api-gateway')) {
      issues.push({ severity: 'error', message: 'El Frontend no enruta a través del API Gateway. Las transacciones no pasan por la capa de seguridad.' });
      security -= 20; addScore('security', 'Frontend no pasa por API Gateway', -20);
    }
    if (has('api-gateway') && has('backend') && !path('api-gateway', 'backend')) {
      issues.push({ severity: 'error', message: 'El API Gateway no está conectado a los Backends. Las peticiones no llegan al servidor.' });
      availability -= 15; addScore('availability', 'API Gateway sin conexión a Backends', -15);
    }
    security += 10; addScore('security', 'Base de seguridad', 10);
    cost += 5; addScore('cost', 'Base de costo', 5);
    complexity -= 10; addScore('complexity', 'Base de complejidad', -10);
  }

  // Cost adjustment based on component count
  const totalComponents = nodes.length;
  if (levelId === 1 && totalComponents > 5) {
    cost -= (totalComponents - 5) * 5; addScore('cost', `Exceso de componentes (${totalComponents})`, -(totalComponents - 5) * 5);
  }
  if (levelId === 2 && totalComponents > 7) {
    cost -= (totalComponents - 7) * 3; addScore('cost', `Exceso de componentes (${totalComponents})`, -(totalComponents - 7) * 3);
  }
  if (levelId === 3 && totalComponents > 8) {
    cost -= (totalComponents - 8) * 2; addScore('cost', `Exceso de componentes (${totalComponents})`, -(totalComponents - 8) * 2);
  }
  const expectedComplexity = levelId === 1 ? 3 : levelId === 2 ? 6 : 7;
  if (totalComponents > expectedComplexity + 2) {
    complexity -= (totalComponents - expectedComplexity - 2) * 5;
    addScore('complexity', `Complejidad por exceso de componentes`, -(totalComponents - expectedComplexity - 2) * 5);
  }

  const cappedScalability = cap(scalability);
  const cappedAvailability = cap(availability);
  const cappedSecurity = cap(security);
  const cappedCost = cap(cost);
  const cappedComplexity = cap(complexity);

  const scores: ScoreBreakdown = {
    scalability: cappedScalability,
    availability: cappedAvailability,
    security: cappedSecurity,
    cost: cappedCost,
    complexity: cappedComplexity,
    total: Math.round((cappedScalability + cappedAvailability + cappedSecurity + cappedCost + cappedComplexity) / 5),
  };

  const passed = scores.total >= level.targetScore;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const passedWithErrors = passed && errorCount === 0 && !budgetExceeded;

  let summary: string;
  if (passedWithErrors) {
    summary = `¡Arquitectura aprobada! Puntuación: ${scores.total}/100. Cumple los requisitos del ${level.title}.`;
  } else if (passed) {
    summary = `Puntuación: ${scores.total}/100. Supera el mínimo (${level.targetScore}) pero tiene ${errorCount} error(es) crítico(s) que debes corregir.`;
  } else {
    summary = `Puntuación: ${scores.total}/100. Necesitas al menos ${level.targetScore} para aprobar. Revisa los errores y vuelve a evaluar.`;
  }

  return { scores, scoreDetails: details, issues, passed: passedWithErrors, summary, totalCost, budgetExceeded };
}

export function severityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'good': return 'text-emerald-400';
    case 'warning': return 'text-amber-400';
    case 'error': return 'text-red-400';
  }
}

export function severityBg(severity: IssueSeverity): string {
  switch (severity) {
    case 'good': return 'border-emerald-500/30 bg-emerald-500/10';
    case 'warning': return 'border-amber-500/30 bg-amber-500/10';
    case 'error': return 'border-red-500/30 bg-red-500/10';
  }
}
