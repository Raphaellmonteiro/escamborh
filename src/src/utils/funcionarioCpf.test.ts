import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCpfDigits,
  maskCpfDigits,
  normalizeFuncionarioCpfForStorage,
} from './funcionarioCpf';

/** CPF válido (dígitos verificadores corretos). */
const CPF_OK = '39053344705';
const CPF_MASKED = '390.533.447-05';

describe('funcionarioCpf', () => {
  it('extractCpfDigits remove não numéricos', () => {
    assert.equal(extractCpfDigits(CPF_MASKED), CPF_OK);
    assert.equal(extractCpfDigits(null), '');
    assert.equal(extractCpfDigits(undefined), '');
  });

  it('normalizeFuncionarioCpfForStorage: vazio → null', () => {
    assert.deepEqual(normalizeFuncionarioCpfForStorage(''), { ok: true, digits: null });
    assert.deepEqual(normalizeFuncionarioCpfForStorage('   . - '), {
      ok: true,
      digits: null,
    });
  });

  it('normalizeFuncionarioCpfForStorage: normaliza para 11 dígitos com máscara', () => {
    assert.deepEqual(normalizeFuncionarioCpfForStorage(CPF_MASKED), {
      ok: true,
      digits: CPF_OK,
    });
    assert.deepEqual(normalizeFuncionarioCpfForStorage(CPF_OK), {
      ok: true,
      digits: CPF_OK,
    });
  });

  it('normalizeFuncionarioCpfForStorage: rejeita tamanho ≠ 11', () => {
    const r = normalizeFuncionarioCpfForStorage('1234567890');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /11 dígitos/);
  });

  it('normalizeFuncionarioCpfForStorage: rejeita dígitos verificadores inválidos', () => {
    const r = normalizeFuncionarioCpfForStorage('39053344706');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /verificadores/);
  });

  it('maskCpfDigits: null/vazio → null', () => {
    assert.equal(maskCpfDigits(null), null);
    assert.equal(maskCpfDigits(''), null);
    assert.equal(maskCpfDigits(undefined), null);
  });

  it('maskCpfDigits: 11 dígitos → últimos 2 visíveis', () => {
    assert.equal(maskCpfDigits(CPF_OK), '***.***.***-05');
    assert.equal(maskCpfDigits(CPF_MASKED), '***.***.***-05');
  });

  it('maskCpfDigits: tamanho ≠ 11 após extrair → placeholder', () => {
    assert.equal(maskCpfDigits('12345'), '***.***.***-**');
  });
});
