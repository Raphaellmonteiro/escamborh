import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AppError} from './errors';
import {hashPlainSecurityPassword} from './securityPasswordStorage';

const {q1Mock, qRunMock} = vi.hoisted(() => ({
  q1Mock: vi.fn(),
  qRunMock: vi.fn(),
}));

vi.mock('../db', () => ({
  q1: q1Mock,
  qRun: qRunMock,
}));

import {validateSecurityPassword} from './securityPassword';

async function expectAppError(
  p: Promise<unknown>,
  partial: {statusCode: number; code?: string}
) {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AppError);
  const err = caught as AppError;
  expect(err.statusCode).toBe(partial.statusCode);
  if (partial.code !== undefined) {
    expect(err.code).toBe(partial.code);
  }
}

describe('validateSecurityPassword', () => {
  beforeEach(() => {
    q1Mock.mockReset();
    qRunMock.mockReset();
    qRunMock.mockResolvedValue([]);
  });

  it('lança quando senha vazia', async () => {
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        userId: 1,
        password: '  ',
        type: 'admin',
      }),
      {statusCode: 400, code: 'SECURITY_PASSWORD_REQUIRED'}
    );
  });

  it('lança quando não autenticado (sem userId)', async () => {
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        password: 'x',
        type: 'caixa',
      }),
      {statusCode: 401, code: 'AUTH_UNAUTHENTICATED'}
    );
  });

  it('lança quando usuário não encontrado', async () => {
    q1Mock.mockResolvedValue(null);
    await expectAppError(
      validateSecurityPassword({
        tenantId: 10,
        userId: 20,
        password: 'x',
        type: 'admin',
      }),
      {statusCode: 404, code: 'AUTH_USER_NOT_FOUND'}
    );
  });

  it('lança quando coluna de senha vazia (admin)', async () => {
    q1Mock.mockResolvedValue({password_value: null});
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        userId: 1,
        password: 'x',
        type: 'admin',
      }),
      {statusCode: 400, code: 'SECURITY_PASSWORD_NOT_CONFIGURED'}
    );
  });

  it('lança quando coluna de senha vazia (caixa)', async () => {
    q1Mock.mockResolvedValue({password_value: '  '});
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        userId: 1,
        password: 'x',
        type: 'caixa',
      }),
      {statusCode: 400, code: 'SECURITY_PASSWORD_NOT_CONFIGURED'}
    );
  });

  it('rejeita senha inválida (bcrypt)', async () => {
    const stored = hashPlainSecurityPassword('good');
    q1Mock.mockResolvedValue({password_value: stored});
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        userId: 1,
        password: 'bad',
        type: 'admin',
      }),
      {statusCode: 403, code: 'SECURITY_PASSWORD_INVALID'}
    );
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('rejeita legado incorreto (sem UPDATE)', async () => {
    q1Mock.mockResolvedValue({password_value: 'legacy-only'});
    await expectAppError(
      validateSecurityPassword({
        tenantId: 1,
        userId: 1,
        password: 'wrong-plain',
        type: 'caixa',
      }),
      {statusCode: 403, code: 'SECURITY_PASSWORD_INVALID'}
    );
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('aceita bcrypt válido e não chama UPDATE', async () => {
    const plain = 'ok-pass-1';
    const stored = hashPlainSecurityPassword(plain);
    q1Mock.mockResolvedValue({password_value: stored});
    await expect(
      validateSecurityPassword({
        tenantId: 7,
        userId: 3,
        password: plain,
        type: 'caixa',
      })
    ).resolves.toBe(true);
    expect(qRunMock).not.toHaveBeenCalled();
  });

  it('aceita legado válido, persiste rehash bcrypt e retorna true', async () => {
    const plain = 'legacy-ok';
    q1Mock.mockResolvedValue({password_value: plain});
    await expect(
      validateSecurityPassword({
        tenantId: 99,
        userId: 5,
        password: plain,
        type: 'admin',
      })
    ).resolves.toBe(true);
    expect(qRunMock).toHaveBeenCalledTimes(1);
    const [sql, params] = qRunMock.mock.calls[0]!;
    expect(sql).toContain('UPDATE clientes SET senha_admin');
    expect(params![1]).toBe(99);
    const newHash = String(params![0]);
    expect(newHash.startsWith('$2')).toBe(true);
  });
});
