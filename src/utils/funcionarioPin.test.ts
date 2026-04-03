import { describe, it, expect, vi, beforeEach } from 'vitest';

const qRunMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../db', () => ({
  qRun: (...args: unknown[]) => qRunMock(...args),
}));

import {
  sanitizeFuncionarioRowForClient,
  verifyEmployeePinAndRehashIfLegacy,
} from './funcionarioPin';
import { hashPlainSecurityPassword } from './securityPasswordStorage';

const CPF_OK = '39053344705';

describe('sanitizeFuncionarioRowForClient', () => {
  it('remove pin da resposta e define pin_configurado', () => {
    const row = {
      id: 1,
      nome: 'Ana',
      pin: 'hash_secreto',
      cpf: CPF_OK,
    };
    const out = sanitizeFuncionarioRowForClient(row) as Record<string, unknown>;
    expect('pin' in out).toBe(false);
    expect(out.pin_configurado).toBe(true);
    expect(out.nome).toBe('Ana');
    expect(out.cpf_mascarado).toMatch(/^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/);
  });

  it('pin_configurado false quando pin vazio ou só espaços', () => {
    expect(
      (sanitizeFuncionarioRowForClient({ id: 1, pin: null, cpf: null }) as Record<string, unknown>)
        .pin_configurado
    ).toBe(false);
    expect(
      (sanitizeFuncionarioRowForClient({ id: 1, pin: '', cpf: null }) as Record<string, unknown>)
        .pin_configurado
    ).toBe(false);
    expect(
      (sanitizeFuncionarioRowForClient({ id: 1, pin: '   ', cpf: null }) as Record<string, unknown>)
        .pin_configurado
    ).toBe(false);
  });
});

describe('verifyEmployeePinAndRehashIfLegacy', () => {
  beforeEach(() => {
    qRunMock.mockClear();
  });

  const fid = 42;
  const tid = 7;

  it('PIN bcrypt correto: ok e sem UPDATE', async () => {
    const plain = 'meuPin9';
    const stored = hashPlainSecurityPassword(plain);
    await expect(verifyEmployeePinAndRehashIfLegacy(stored, plain, fid, tid)).resolves.toBe(true);
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('PIN legado texto puro correto: ok e rehash (UPDATE)', async () => {
    const plain = '4422';
    await expect(verifyEmployeePinAndRehashIfLegacy(plain, plain, fid, tid)).resolves.toBe(true);
    expect(qRunMock).toHaveBeenCalledTimes(1);
    const [sql, params] = qRunMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE funcionarios SET pin=');
    expect(params[1]).toBe(fid);
    expect(params[2]).toBe(tid);
    expect(String(params[0])).toMatch(/^\$2[aby]\$/);
    expect(String(params[0])).not.toBe(plain);
  });

  it('PIN bcrypt incorreto', async () => {
    const stored = hashPlainSecurityPassword('certo');
    await expect(verifyEmployeePinAndRehashIfLegacy(stored, 'errado', fid, tid)).resolves.toBe(
      false
    );
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('PIN legado incorreto', async () => {
    await expect(verifyEmployeePinAndRehashIfLegacy('aaaa', 'bbbb', fid, tid)).resolves.toBe(
      false
    );
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('sem PIN configurado (null / vazio): falha', async () => {
    await expect(verifyEmployeePinAndRehashIfLegacy(null, '1234', fid, tid)).resolves.toBe(false);
    await expect(verifyEmployeePinAndRehashIfLegacy('', '1234', fid, tid)).resolves.toBe(false);
    await expect(verifyEmployeePinAndRehashIfLegacy('   ', 'x', fid, tid)).resolves.toBe(false);
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('entrada de PIN vazia: falha mesmo com hash no banco', async () => {
    const stored = hashPlainSecurityPassword('x');
    await expect(verifyEmployeePinAndRehashIfLegacy(stored, '', fid, tid)).resolves.toBe(false);
    await expect(verifyEmployeePinAndRehashIfLegacy(stored, '  ', fid, tid)).resolves.toBe(false);
    expect(qRunMock).not.toHaveBeenCalled();
  });
});
