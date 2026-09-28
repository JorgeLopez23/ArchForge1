import type { Level, IncidentDef, WorkloadType } from './types';

const INCIDENTS_L1: IncidentDef[] = [
  { type: 'backend-down', label: 'Caída de Backend', description: 'La instancia de Backend se cae. ¿Puede el sistema seguir funcionando?', icon: 'ServerCrash' },
  { type: 'traffic-spike', label: 'Pico de Tráfico', description: 'El tráfico se duplica repentinamente. ¿La arquitectura resiste?', icon: 'TrendingUp' },
];

const INCIDENTS_L2: IncidentDef[] = [
  { type: 'backend-down', label: 'Caída de Backend', description: 'Una instancia de Backend se cae. El tráfico debe redistribuirse.', icon: 'ServerCrash' },
  { type: 'backend-saturated', label: 'Saturación de Backend', description: 'El Backend recibe más tráfico del que puede procesar.', icon: 'Gauge' },
  { type: 'redis-down', label: 'Caída de Redis', description: 'Redis se cae. Todas las lecturas van a PostgreSQL.', icon: 'DatabaseZap' },
  { type: 'traffic-spike', label: 'Pico de Tráfico', description: 'El tráfico se multiplica por 3 durante un evento.', icon: 'TrendingUp' },
];

const INCIDENTS_L3: IncidentDef[] = [
  { type: 'backend-down', label: 'Caída de Backend', description: 'Un Backend cae durante el procesamiento de pagos.', icon: 'ServerCrash' },
  { type: 'backend-saturated', label: 'Saturación de Backend', description: 'Los Backends no dan abasto con las transacciones.', icon: 'Gauge' },
  { type: 'redis-down', label: 'Caída de Redis', description: 'Redis se cae. Las consultas lentas saturan PostgreSQL.', icon: 'DatabaseZap' },
  { type: 'postgresql-saturated', label: 'Saturación de PostgreSQL', description: 'PostgreSQL no soporta el volumen de escrituras.', icon: 'HardDriveDownload' },
  { type: 'traffic-spike', label: 'Pico de Tráfico', description: 'Black Friday: el tráfico se multiplica por 5.', icon: 'TrendingUp' },
];

export const LEVELS: Level[] = [
  {
    id: 1,
    title: 'Caso A — Startup Web',
    subtitle: 'Comenzando pequeño',
    scenario:
      'Estás construyendo una aplicación web sencilla para una startup. ' +
      'Esperas alrededor de 1,000 usuarios activos. ' +
      'El presupuesto es ajustado, así que necesitas mantener la infraestructura mínima viable sin sacrificar funcionalidad. ' +
      'El objetivo es comprender cómo Frontend, Backend y Database trabajan juntos.',
    requirements: {
      users: '~1,000 usuarios activos',
      availability: '99% (tiempo de inactividad aceptable en horas no pico)',
      performance: 'Respuestas < 500ms',
      security: 'Conexión cifrada, autenticación básica',
      cost: 'Mínimo — sin infraestructura innecesaria',
    },
    hints: [
      'No necesitas un Load Balancer para 1,000 usuarios — una sola instancia basta.',
      'Un API Gateway puede ser excesivo para este nivel.',
      'Redis puede ayudar pero no es crítico a esta escala.',
      'Kafka o colas son innecesarias a este nivel.',
    ],
    targetScore: 70,
    requestsPerSecond: 50,
    budget: 100,
    incidents: INCIDENTS_L1,
    readWriteRatio: 0.7,
    workload: 'cpu-bound',
    externalLatency: 100,
  },
  {
    id: 2,
    title: 'Caso B — E-commerce Black Friday',
    subtitle: 'Escalando con responsabilidad',
    scenario:
      'Tu e-commerce tiene 30,000 usuarios concurrentes. ' +
      'El tráfico normal es de 500 req/s pero durante Black Friday puede llegar a 8,000 req/s. ' +
      'El 70% son lecturas (catálogo), 20% carrito y 10% compras. ' +
      'El jugador debe descubrir los cuellos de botella y experimentar con escalamiento y caché.',
    requirements: {
      users: '~30,000 usuarios concurrentes con picos',
      availability: '99.9% (máximo ~43 min de inactividad/mes)',
      performance: 'Respuestas < 200ms, caché para lecturas',
      security: 'API Gateway para rate limiting y autenticación centralizada',
      cost: 'Moderado — invertir donde reduzca cuellos de botella',
    },
    hints: [
      'Un Load Balancer es esencial para distribuir tráfico entre múltiples backends.',
      'Redis reduce la carga en PostgreSQL y mejora la latencia.',
      'Un API Gateway centraliza autenticación y rate limiting.',
      'Múltiples instancias de Backend permiten escalar horizontalmente.',
    ],
    targetScore: 75,
    requestsPerSecond: 2000,
    budget: 800,
    incidents: INCIDENTS_L2,
    readWriteRatio: 0.7,
    workload: 'database-bound',
    externalLatency: 100,
  },
  {
    id: 3,
    title: 'Caso C — Plataforma de Pagos',
    subtitle: 'Cuando cada segundo cuenta',
    scenario:
      'Operas una plataforma de pagos con 5,000 req/s. ' +
      'No puedes perder transacciones, el sistema debe seguir funcionando si un nodo cae, ' +
      'y los pagos deben procesarse de forma asíncrona y confiable. ' +
      'El proveedor externo de pagos tiene alta latencia y posibles timeouts. ' +
      'Descubre el valor del procesamiento asíncrono, colas, reintentos e idempotencia.',
    requirements: {
      users: 'Alto volumen de transacciones financieras',
      availability: '99.99% (alta disponibilidad con redundancia)',
      performance: 'Procesamiento asíncrono de pagos, baja latencia de consulta',
      security: 'Cifrado extremo a extremo, auditoría, aislamiento de datos',
      cost: 'Alto justificado — la disponibilidad y seguridad son prioritarias',
    },
    hints: [
      'Kafka o una Queue garantizan que los pagos no se pierdan si un servicio cae.',
      'Redis para caché de consultas reduce latencia en lecturas.',
      'El Load Balancer asegura disponibilidad ante fallos de nodos.',
      'El API Gateway centraliza seguridad, rate limiting y auditoría.',
      'Múltiples backends con Load Balancer son esenciales para 99.99%.',
    ],
    targetScore: 80,
    requestsPerSecond: 5000,
    budget: 2000,
    incidents: INCIDENTS_L3,
    readWriteRatio: 0.3,
    workload: 'io-bound',
    externalLatency: 500,
  },
  {
    id: 4,
    title: 'Laboratorio',
    subtitle: 'Experimenta libremente',
    scenario:
      'Modo laboratorio: define tus propios parámetros de tráfico, workload y latencia. ' +
      'Construye cualquier arquitectura y observa cómo se comporta bajo carga. ' +
      'No hay puntuación ni objetivo — el objetivo es aprender observando.',
    requirements: {
      users: 'Configurable',
      availability: 'Configurable',
      performance: 'Configurable',
      security: 'Configurable',
      cost: 'Sin límite',
    },
    hints: [
      'Prueba diferentes workloads (CPU-bound, Memory-bound, Database-bound).',
      'Observa cómo Redis cambia el cache hit rate y reduce la carga en PostgreSQL.',
      'Experimenta con incidentes para ver cómo resiste tu arquitectura.',
      'Usa el comparador para ver el efecto de tus modificaciones.',
    ],
    targetScore: 0,
    requestsPerSecond: 1000,
    budget: 99999,
    incidents: [...INCIDENTS_L1, ...INCIDENTS_L2, ...INCIDENTS_L3],
    isLab: true,
    labConfig: {
      users: 10000,
      requestsPerSecond: 1000,
      readWriteRatio: 0.7,
      payloadSize: 10,
      workload: 'cpu-bound' as WorkloadType,
      externalLatency: 100,
    },
  },
];
