import { q1, query } from '../db';
import { ensureWhatsAppInstancesTable } from '../db/migrations/whatsappInstances';

type WhatsAppInstanceRow = {
  id: string;
  tenant_id: number;
  instance_name: string;
  status: string | null;
  connected: boolean;
  created_at: string | Date;
};

export type WhatsAppInstanceRecord = {
  id: string;
  tenantId: number;
  instanceName: string;
  status: string | null;
  connected: boolean;
  createdAt: string;
};

export type CreateInstanceRecordInput = {
  tenantId: number | string;
  instanceName: string;
};

export type UpdateInstanceStatusInput = {
  instanceName: string;
  status: string;
  connected: boolean;
};

function normalizeTenantId(value: number | string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('tenantId invalido');
  }

  return parsed;
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} obrigatorio`);
  }

  return normalized;
}

function mapWhatsAppInstanceRow(row: WhatsAppInstanceRow): WhatsAppInstanceRecord {
  return {
    id: row.id,
    tenantId: Number(row.tenant_id),
    instanceName: row.instance_name,
    status: row.status,
    connected: Boolean(row.connected),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function buildDatabaseError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export async function createInstanceRecord({
  tenantId,
  instanceName,
}: CreateInstanceRecordInput): Promise<WhatsAppInstanceRecord> {
  await ensureWhatsAppInstancesTable();

  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  try {
    const result = await query<WhatsAppInstanceRow>(
      `
        INSERT INTO whatsapp_instances (
          tenant_id,
          instance_name
        )
        VALUES (?, ?)
        RETURNING id, tenant_id, instance_name, status, connected, created_at
      `,
      [normalizedTenantId, normalizedInstanceName]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Nao foi possivel criar o registro da instancia');
    }

    return mapWhatsAppInstanceRow(row);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      String((error as { code?: unknown }).code) === '23505'
    ) {
      throw new Error('instanceName ja cadastrado');
    }

    throw new Error(buildDatabaseError(error, 'Erro ao criar registro da instancia WhatsApp'));
  }
}

export async function getInstanceByTenant(tenantId: number | string): Promise<WhatsAppInstanceRecord | null> {
  await ensureWhatsAppInstancesTable();

  const normalizedTenantId = normalizeTenantId(tenantId);

  try {
    const row = await q1<WhatsAppInstanceRow>(
      `
        SELECT id, tenant_id, instance_name, status, connected, created_at
        FROM whatsapp_instances
        WHERE tenant_id=?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [normalizedTenantId]
    );

    return row ? mapWhatsAppInstanceRow(row) : null;
  } catch (error) {
    throw new Error(buildDatabaseError(error, 'Erro ao buscar instancia WhatsApp por tenant'));
  }
}

export async function getInstanceByName(instanceName: string): Promise<WhatsAppInstanceRecord | null> {
  await ensureWhatsAppInstancesTable();

  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  try {
    const row = await q1<WhatsAppInstanceRow>(
      `
        SELECT id, tenant_id, instance_name, status, connected, created_at
        FROM whatsapp_instances
        WHERE instance_name=?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [normalizedInstanceName]
    );

    return row ? mapWhatsAppInstanceRow(row) : null;
  } catch (error) {
    throw new Error(buildDatabaseError(error, 'Erro ao buscar instancia WhatsApp por nome'));
  }
}

export async function updateInstanceStatus({
  instanceName,
  status,
  connected,
}: UpdateInstanceStatusInput): Promise<WhatsAppInstanceRecord | null> {
  await ensureWhatsAppInstancesTable();

  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');
  const normalizedStatus = normalizeRequiredText(status, 'status');

  try {
    const result = await query<WhatsAppInstanceRow>(
      `
        UPDATE whatsapp_instances
        SET status=?, connected=?
        WHERE instance_name=?
        RETURNING id, tenant_id, instance_name, status, connected, created_at
      `,
      [normalizedStatus, connected, normalizedInstanceName]
    );

    const row = result.rows[0];
    return row ? mapWhatsAppInstanceRow(row) : null;
  } catch (error) {
    throw new Error(buildDatabaseError(error, 'Erro ao atualizar status da instancia WhatsApp'));
  }
}
