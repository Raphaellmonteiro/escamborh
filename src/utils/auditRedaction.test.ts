import { describe, expect, it } from 'vitest';
import { buildRedactedAuditDiff, redactAuditText, redactAuditValue } from './auditRedaction';

describe('auditRedaction', () => {
  it('redacts secrets and masks PII in free text', () => {
    const text = 'Bearer abc.def.ghi email joao@example.com cpf 390.533.447-05 telefone 11987654321';
    const redacted = redactAuditText(text);

    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).toContain('jo***@example.com');
    expect(redacted).toContain('***.***.***-05');
    expect(redacted).toContain('***4321');
  });

  it('redacts sensitive keys and masks PII keys in objects', () => {
    const value = redactAuditValue({
      senha: 'super-secreta',
      email: 'maria@example.com',
      telefone: '11999887766',
      nested: {
        authorization: 'Bearer top-secret',
      },
    });

    expect(value).toEqual({
      senha: '[REDACTED]',
      email: 'ma***@example.com',
      telefone: '***7766',
      nested: {
        authorization: '[REDACTED]',
      },
    });
  });

  it('normalizes camelCase keys before applying PII masking', () => {
    const value = redactAuditValue({
      customerPhone: '11987654321',
      customerEmail: 'time@flowpdv.com',
      nested: {
        accessToken: 'token-secreto',
      },
    });

    expect(value).toEqual({
      customerPhone: '***4321',
      customerEmail: 'ti***@flowpdv.com',
      nested: {
        accessToken: '[REDACTED]',
      },
    });
  });

  it('builds a minimal redacted diff', () => {
    const diff = buildRedactedAuditDiff(
      {
        status: 'aberto',
        senha: 'antes',
        unchanged: true,
      },
      {
        status: 'fechado',
        senha: 'depois',
        unchanged: true,
      }
    );

    expect(diff).toEqual({
      before: {
        status: 'aberto',
        senha: '[REDACTED]',
      },
      after: {
        status: 'fechado',
        senha: '[REDACTED]',
      },
    });
  });
});
