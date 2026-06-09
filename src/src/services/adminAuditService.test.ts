import { beforeEach, describe, expect, it, vi } from 'vitest';

const { qAllMock, txRunMock, withTxMock, logErrorMock } = vi.hoisted(() => ({
  qAllMock: vi.fn(),
  txRunMock: vi.fn(),
  withTxMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('../db', () => ({
  qAll: qAllMock,
  txRun: txRunMock,
  withTx: withTxMock,
}));

vi.mock('../utils/logger', () => ({
  logError: logErrorMock,
}));

import { ADMIN_AUDIT_ACTIONS } from './adminAuditActions';
import { listAdminAuditEvents, writeAdminAuditEvent } from './adminAuditService';

describe('adminAuditService', () => {
  beforeEach(() => {
    qAllMock.mockReset();
    txRunMock.mockReset();
    withTxMock.mockReset();
    logErrorMock.mockReset();

    qAllMock.mockResolvedValue([]);
    txRunMock.mockResolvedValue([]);
    withTxMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn() })
    );
  });

  it('writes the authoritative event and the redacted legacy mirror inside a provided transaction', async () => {
    const tx = { query: vi.fn() };

    await writeAdminAuditEvent({
      tx: tx as any,
      tenantId: 12,
      action: ADMIN_AUDIT_ACTIONS.FORCE_CLOSE_CAIXA,
      legacyDetails: 'Bearer abc.def.ghi email joao@example.com',
      metadata: {
        customerPhone: '11987654321',
      },
    });

    expect(withTxMock).not.toHaveBeenCalled();
    expect(txRunMock).toHaveBeenCalledTimes(2);

    const [, auditSql, auditParams] = txRunMock.mock.calls[0] as [unknown, string, unknown[]];
    expect(auditSql).toContain('INSERT INTO admin_audit_events');
    expect(auditParams[0]).toBe(12);
    expect(auditParams[1]).toBe('tenant');
    expect(auditParams[2]).toBe('12');
    expect(auditParams[7]).toBe(ADMIN_AUDIT_ACTIONS.FORCE_CLOSE_CAIXA);
    expect(auditParams[8]).toBe('ADMIN_FORCE_CLOSE_CAIXA');
    expect(auditParams[16]).toBe('Bearer [REDACTED] email jo***@example.com');
    expect(auditParams[17]).toEqual({
      customerPhone: '***4321',
    });

    const [, legacySql, legacyParams] = txRunMock.mock.calls[1] as [unknown, string, unknown[]];
    expect(legacySql).toContain('INSERT INTO system_logs');
    expect(legacyParams).toEqual([
      12,
      'Admin',
      'admin',
      'ADMIN_FORCE_CLOSE_CAIXA',
      'Bearer [REDACTED] email jo***@example.com',
    ]);
  });

  it('uses an internal transaction for tenantless scoped events and mirrors scope in the legacy details', async () => {
    await writeAdminAuditEvent({
      action: ADMIN_AUDIT_ACTIONS.RECUSAR_SOLICITACAO,
      legacyDetails: 'Solicitacao recusada para maria@example.com',
      scope: {
        type: 'solicitacao',
        id: 123,
      },
    });

    expect(withTxMock).toHaveBeenCalledTimes(1);
    expect(txRunMock).toHaveBeenCalledTimes(2);

    const [, , auditParams] = txRunMock.mock.calls[0] as [unknown, string, unknown[]];
    expect(auditParams[0]).toBeNull();
    expect(auditParams[1]).toBe('solicitacao');
    expect(auditParams[2]).toBe('123');
    expect(auditParams[8]).toBe('ADMIN_RECUSAR_SOLICITACAO');

    const [, , legacyParams] = txRunMock.mock.calls[1] as [unknown, string, unknown[]];
    expect(legacyParams[0]).toBeNull();
    expect(legacyParams[4]).toBe(
      'Solicitacao recusada para ma***@example.com [scope=solicitacao:123]'
    );
  });

  it('adds scope filters when listing audit events', async () => {
    await listAdminAuditEvents({
      action: ADMIN_AUDIT_ACTIONS.RECUSAR_SOLICITACAO,
      scopeType: 'solicitacao',
      scopeId: 123,
      limit: 999,
    });

    expect(qAllMock).toHaveBeenCalledTimes(1);
    const [sql, params] = qAllMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('scope_type=?');
    expect(sql).toContain('scope_id=?');
    expect(params).toEqual([
      ADMIN_AUDIT_ACTIONS.RECUSAR_SOLICITACAO,
      'solicitacao',
      '123',
      200,
    ]);
  });
});
