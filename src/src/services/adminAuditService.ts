import crypto from 'node:crypto';
import type { Request } from 'express';
import { qAll, txRun, withTx } from '../db';
import { logError } from '../utils/logger';
import { buildRedactedAuditDiff, redactAuditText, redactAuditValue } from '../utils/auditRedaction';
import { getLegacyAdminAuditAction, type AdminAuditAction } from './adminAuditActions';

type AuditTx = Parameters<typeof txRun>[0];

type AuditActor = {
  type?: string | null;
  id?: string | number | bigint | null;
  name?: string | null;
  role?: string | null;
};

type AuditEntity = {
  type?: string | null;
  id?: string | number | bigint | null;
};

type AuditScope = {
  type?: string | null;
  id?: string | number | bigint | null;
};

export type WriteAdminAuditEventInput = {
  req?: Request;
  tx?: AuditTx | null;
  tenantId?: number | null;
  action: AdminAuditAction | string;
  legacyAction?: string;
  legacyDetails: string;
  reason?: string | null;
  actor?: AuditActor;
  entity?: AuditEntity;
  scope?: AuditScope;
  metadata?: Record<string, unknown> | null;
  before?: unknown;
  after?: unknown;
};

export type ListAdminAuditEventsFilters = {
  tenantId?: number;
  action?: string | null;
  requestId?: string | null;
  sessionFingerprint?: string | null;
  entityType?: string | null;
  entityId?: string | number | bigint | null;
  scopeType?: string | null;
  scopeId?: string | number | bigint | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
};

export type AdminAuditEventRow = {
  id: number;
  tenant_id: number | null;
  scope_type: string | null;
  scope_id: string | null;
  actor_type: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  legacy_action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  request_id: string | null;
  session_fingerprint: string | null;
  request_method: string | null;
  request_path: string | null;
  summary: string | null;
  metadata_json: Record<string, unknown> | null;
  before_json: Record<string, unknown> | unknown[] | string | number | boolean | null;
  after_json: Record<string, unknown> | unknown[] | string | number | boolean | null;
  created_at: string;
};

type PreparedAuditWrite = {
  tenantId: number | null;
  scopeType: string | null;
  scopeId: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  legacyAction: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  sessionFingerprint: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  summary: string | null;
  legacyMirrorDetails: string | null;
  metadata: Record<string, unknown> | null;
  before: Record<string, unknown> | unknown[] | string | number | boolean | null;
  after: Record<string, unknown> | unknown[] | string | number | boolean | null;
};

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeOptionalId(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeTenantId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('tenantId invalido para auditoria admin');
  }
  return normalized;
}

function getBearerToken(req?: Request): string | null {
  const raw = req?.headers?.authorization;
  const authHeader = Array.isArray(raw) ? raw[0] : raw;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^\s*Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

function buildSessionFingerprint(req?: Request): string | null {
  const bearer = getBearerToken(req);
  if (!bearer) return null;

  const secret =
    process.env.ADMIN_AUDIT_HMAC_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-admin-audit-hmac';

  return crypto.createHmac('sha256', secret).update(bearer).digest('hex').slice(0, 24);
}

function normalizeRequestPath(req?: Request): string | null {
  const originalUrl = normalizeOptionalText(req?.originalUrl);
  if (!originalUrl) return null;
  const [pathOnly] = originalUrl.split('?');
  return pathOnly || null;
}

function resolveScope(input: WriteAdminAuditEventInput, tenantId: number | null) {
  const explicitScopeType = normalizeOptionalText(input.scope?.type);
  const explicitScopeId = normalizeOptionalId(input.scope?.id);

  if (explicitScopeType && !explicitScopeId) {
    throw new Error('scope_id obrigatorio quando scope_type for informado');
  }

  if (!explicitScopeType && explicitScopeId) {
    throw new Error('scope_type obrigatorio quando scope_id for informado');
  }

  if (explicitScopeType && explicitScopeId) {
    return {
      scopeType: explicitScopeType,
      scopeId: explicitScopeId,
    };
  }

  if (tenantId != null) {
    return {
      scopeType: 'tenant',
      scopeId: String(tenantId),
    };
  }

  throw new Error('Eventos admin sem tenant_id precisam informar scope_type e scope_id');
}

function buildLegacyMirrorDetails(
  legacyDetails: string | null,
  tenantId: number | null,
  scopeType: string | null,
  scopeId: string | null
): string | null {
  const details = normalizeOptionalText(legacyDetails);
  if (!details) return null;
  if (tenantId != null || !scopeType || !scopeId) return details;
  return `${details} [scope=${scopeType}:${scopeId}]`;
}

function prepareAuditWrite(input: WriteAdminAuditEventInput): PreparedAuditWrite {
  const tenantId = normalizeTenantId(input.tenantId);
  const { scopeType, scopeId } = resolveScope(input, tenantId);
  const action = normalizeOptionalText(input.action);
  if (!action) {
    throw new Error('action obrigatorio para auditoria admin');
  }

  const legacyAction =
    normalizeOptionalText(input.legacyAction) || getLegacyAdminAuditAction(action);
  const diff = buildRedactedAuditDiff(input.before, input.after);
  const actorType = normalizeOptionalText(input.actor?.type) || 'platform_admin';
  const actorId = normalizeOptionalId(input.actor?.id);
  const actorName = normalizeOptionalText(input.actor?.name) || 'Admin';
  const actorRole = normalizeOptionalText(input.actor?.role) || 'admin';
  const entityType = normalizeOptionalText(input.entity?.type);
  const entityId = normalizeOptionalId(input.entity?.id);
  const reason = redactAuditText(normalizeOptionalText(input.reason));
  const requestId = normalizeOptionalText(input.req?.requestId);
  const sessionFingerprint = buildSessionFingerprint(input.req);
  const requestMethod = normalizeOptionalText(input.req?.method)?.toUpperCase() || null;
  const requestPath = normalizeRequestPath(input.req);
  const summary = redactAuditText(normalizeOptionalText(input.legacyDetails));
  const legacyMirrorDetails = redactAuditText(
    buildLegacyMirrorDetails(summary, tenantId, scopeType, scopeId)
  );
  const metadata =
    input.metadata && Object.keys(input.metadata).length > 0
      ? (redactAuditValue(input.metadata) as Record<string, unknown>)
      : null;

  return {
    tenantId,
    scopeType,
    scopeId,
    actorType,
    actorId,
    actorName,
    actorRole,
    action,
    legacyAction,
    entityType,
    entityId,
    reason,
    requestId,
    sessionFingerprint,
    requestMethod,
    requestPath,
    summary,
    legacyMirrorDetails,
    metadata,
    before: diff.before,
    after: diff.after,
  };
}

async function persistPreparedAuditWrite(
  run: (sql: string, params: unknown[]) => Promise<unknown>,
  prepared: PreparedAuditWrite
) {
  await run(
    `INSERT INTO admin_audit_events (
      tenant_id, scope_type, scope_id,
      actor_type, actor_id, actor_name, actor_role,
      action, legacy_action, entity_type, entity_id, reason,
      request_id, session_fingerprint, request_method, request_path,
      summary, metadata_json, before_json, after_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      prepared.tenantId,
      prepared.scopeType,
      prepared.scopeId,
      prepared.actorType,
      prepared.actorId,
      prepared.actorName,
      prepared.actorRole,
      prepared.action,
      prepared.legacyAction,
      prepared.entityType,
      prepared.entityId,
      prepared.reason,
      prepared.requestId,
      prepared.sessionFingerprint,
      prepared.requestMethod,
      prepared.requestPath,
      prepared.summary,
      prepared.metadata,
      prepared.before,
      prepared.after,
    ]
  );

  await run(
    'INSERT INTO system_logs (tenant_id,usuario_nome,cargo,acao,detalhes) VALUES (?,?,?,?,?)',
    [
      prepared.tenantId,
      prepared.actorName,
      prepared.actorRole,
      prepared.legacyAction,
      prepared.legacyMirrorDetails,
    ]
  );
}

export async function writeAdminAuditEvent(input: WriteAdminAuditEventInput): Promise<void> {
  const prepared = prepareAuditWrite(input);

  try {
    if (input.tx) {
      await persistPreparedAuditWrite((sql, params) => txRun(input.tx as AuditTx, sql, params), prepared);
      return;
    }

    await withTx(async (client) => {
      await persistPreparedAuditWrite((sql, params) => txRun(client, sql, params), prepared);
    });
  } catch (error) {
    logError('services.adminAuditService.writeAdminAuditEvent', error, {
      tenantId: prepared.tenantId,
      scopeType: prepared.scopeType,
      scopeId: prepared.scopeId,
      action: prepared.action,
      legacyAction: prepared.legacyAction,
      requestId: prepared.requestId,
    });
    throw error;
  }
}

export async function listAdminAuditEvents(filters: ListAdminAuditEventsFilters): Promise<AdminAuditEventRow[]> {
  const clauses = [
    `SELECT
      id,
      tenant_id,
      scope_type,
      scope_id,
      actor_type,
      actor_id,
      actor_name,
      actor_role,
      action,
      legacy_action,
      entity_type,
      entity_id,
      reason,
      request_id,
      session_fingerprint,
      request_method,
      request_path,
      summary,
      metadata_json,
      before_json,
      after_json,
      created_at
     FROM admin_audit_events
     WHERE 1=1`,
  ];
  const params: unknown[] = [];

  if (filters.tenantId != null) {
    clauses.push('AND tenant_id=?');
    params.push(filters.tenantId);
  }

  if (normalizeOptionalText(filters.action)) {
    clauses.push('AND action=?');
    params.push(normalizeOptionalText(filters.action));
  }

  if (normalizeOptionalText(filters.requestId)) {
    clauses.push('AND request_id=?');
    params.push(normalizeOptionalText(filters.requestId));
  }

  if (normalizeOptionalText(filters.sessionFingerprint)) {
    clauses.push('AND session_fingerprint=?');
    params.push(normalizeOptionalText(filters.sessionFingerprint));
  }

  if (normalizeOptionalText(filters.entityType)) {
    clauses.push('AND entity_type=?');
    params.push(normalizeOptionalText(filters.entityType));
  }

  if (filters.entityId != null && String(filters.entityId).trim() !== '') {
    clauses.push('AND entity_id=?');
    params.push(String(filters.entityId).trim());
  }

  if (normalizeOptionalText(filters.scopeType)) {
    clauses.push('AND scope_type=?');
    params.push(normalizeOptionalText(filters.scopeType));
  }

  if (filters.scopeId != null && String(filters.scopeId).trim() !== '') {
    clauses.push('AND scope_id=?');
    params.push(String(filters.scopeId).trim());
  }

  if (normalizeOptionalText(filters.dateFrom)) {
    clauses.push('AND created_at >= ?');
    params.push(normalizeOptionalText(filters.dateFrom));
  }

  if (normalizeOptionalText(filters.dateTo)) {
    clauses.push('AND created_at <= ?');
    params.push(normalizeOptionalText(filters.dateTo));
  }

  clauses.push('ORDER BY created_at DESC LIMIT ?');
  params.push(Math.min(Math.max(1, Number(filters.limit) || 100), 200));

  return qAll<AdminAuditEventRow>(clauses.join('\n'), params);
}
