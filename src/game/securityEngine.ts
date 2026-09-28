import type { Edge, Node } from 'reactflow';
import type { SecurityFinding, SecurityControlType } from './types';
import { SECURITY_CONTROLS } from './componentTypes';

interface BoardNode {
  id: string;
  type: string;
  securityControls: SecurityControlType[];
}

interface BoardEdge {
  source: string;
  target: string;
}

export function analyzeSecurity(
  rfNodes: Node[],
  rfEdges: Edge[]
): SecurityFinding[] {
  const nodes: BoardNode[] = rfNodes.map((n) => ({
    id: n.id,
    type: n.data.componentType,
    securityControls: n.data.securityControls ?? [],
  }));
  const edges: BoardEdge[] = rfEdges.map((e) => ({ source: e.source, target: e.target }));

  const findings: SecurityFinding[] = [];

  const has = (t: string) => nodes.some((n) => n.type === t);
  const hasControl = (t: string, c: SecurityControlType) =>
    nodes.some((n) => n.type === t && n.data?.securityControls?.includes(c));

  // TLS check: frontend must have TLS
  const frontendNodes = nodes.filter((n) => n.type === 'frontend');
  frontendNodes.forEach((fn) => {
    const controls = nodes.find((n) => n.id === fn.id)?.securityControls ?? [];
    if (!controls.includes('tls')) {
      findings.push({
        severity: 'error',
        control: 'tls',
        message: 'El Frontend no tiene TLS/HTTPS. El tráfico viaja en texto plano.',
        risk: SECURITY_CONTROLS['tls'].riskMitigated,
      });
    }
  });

  // Authentication check: backend must have authentication
  const backendNodes = nodes.filter((n) => n.type === 'backend');
  backendNodes.forEach((bn) => {
    const controls = nodes.find((n) => n.id === bn.id)?.securityControls ?? [];
    if (!controls.includes('authentication')) {
      findings.push({
        severity: 'error',
        control: 'authentication',
        message: 'El Backend no tiene autenticación. Cualquiera puede acceder a la API.',
        risk: SECURITY_CONTROLS['authentication'].riskMitigated,
      });
    }
  });

  // Rate limiting check: if API Gateway exists, should have rate limiting
  const gatewayNodes = nodes.filter((n) => n.type === 'api-gateway');
  gatewayNodes.forEach((gn) => {
    const controls = nodes.find((n) => n.id === gn.id)?.securityControls ?? [];
    if (!controls.includes('rate-limiting')) {
      findings.push({
        severity: 'warning',
        control: 'rate-limiting',
        message: 'El API Gateway no tiene Rate Limiting. Es vulnerable a abuso de API y DoS.',
        risk: SECURITY_CONTROLS['rate-limiting'].riskMitigated,
      });
    }
    if (!controls.includes('waf')) {
      findings.push({
        severity: 'warning',
        control: 'waf',
        message: 'El API Gateway no tiene WAF. Las peticiones maliciosas (SQL injection, XSS) no se filtran.',
        risk: SECURITY_CONTROLS['waf'].riskMitigated,
      });
    }
  });

  // PostgreSQL should not be publicly accessible (needs firewall or private-network)
  const pgNodes = nodes.filter((n) => n.type === 'postgresql');
  pgNodes.forEach((pn) => {
    const controls = nodes.find((n) => n.id === pn.id)?.securityControls ?? [];
    if (!controls.includes('firewall') && !controls.includes('private-network')) {
      findings.push({
        severity: 'error',
        control: 'firewall',
        message: 'PostgreSQL no tiene Firewall ni Private Network. Es accesible desde Internet.',
        risk: 'Acceso no autorizado a la base de datos desde cualquier IP.',
      });
    }
    if (!controls.includes('encryption-rest')) {
      findings.push({
        severity: 'warning',
        control: 'encryption-rest',
        message: 'PostgreSQL no tiene cifrado en reposo. Los datos en disco están sin proteger.',
        risk: SECURITY_CONTROLS['encryption-rest'].riskMitigated,
      });
    }
  });

  // Redis should not be publicly accessible
  const redisNodes = nodes.filter((n) => n.type === 'redis');
  redisNodes.forEach((rn) => {
    const controls = nodes.find((n) => n.id === rn.id)?.securityControls ?? [];
    if (!controls.includes('firewall') && !controls.includes('private-network')) {
      findings.push({
        severity: 'error',
        control: 'firewall',
        message: 'Redis no tiene Firewall ni Private Network. Es accesible desde Internet.',
        risk: 'Acceso no autorizado al caché. Redis sin autenticación es un vector de ataque común.',
      });
    }
  });

  // Kafka should have TLS and authentication
  const kafkaNodes = nodes.filter((n) => n.type === 'kafka');
  kafkaNodes.forEach((kn) => {
    const controls = nodes.find((n) => n.id === kn.id)?.securityControls ?? [];
    if (!controls.includes('tls')) {
      findings.push({
        severity: 'warning',
        control: 'tls',
        message: 'Kafka no tiene TLS. Los mensajes viajan en claro entre servicios.',
        risk: SECURITY_CONTROLS['tls'].riskMitigated,
      });
    }
    if (!controls.includes('authentication')) {
      findings.push({
        severity: 'warning',
        control: 'authentication',
        message: 'Kafka no tiene autenticación. Cualquier servicio puede producir/consumir mensajes.',
        risk: SECURITY_CONTROLS['authentication'].riskMitigated,
      });
    }
  });

  // Audit logs for payment systems (level 3)
  const hasAuditLogs = nodes.some((n) => n.securityControls.includes('audit-logs'));
  if (!hasAuditLogs && (has('kafka') || has('queue'))) {
    findings.push({
      severity: 'warning',
      control: 'audit-logs',
      message: 'No hay Audit Logs configurados. En sistemas de pagos, la trazabilidad es obligatoria.',
      risk: SECURITY_CONTROLS['audit-logs'].riskMitigated,
    });
  }

  // Secrets management check
  const hasSecretsMgmt = nodes.some((n) => n.securityControls.includes('secrets-management'));
  if (!hasSecretsMgmt && backendNodes.length > 0) {
    findings.push({
      severity: 'warning',
      control: 'secrets-management',
      message: 'No hay gestión de secretos. Las credenciales podrían estar hardcodeadas.',
      risk: SECURITY_CONTROLS['secrets-management'].riskMitigated,
    });
  }

  return findings;
}

export function getSecurityCost(controls: SecurityControlType[]): number {
  return controls.reduce((sum, c) => sum + (SECURITY_CONTROLS[c]?.cost ?? 0), 0);
}
