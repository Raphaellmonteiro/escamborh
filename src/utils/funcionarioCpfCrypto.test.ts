import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptFuncionarioCpfStored,
  encryptFuncionarioCpfForStorage,
  ensureFuncionarioCpfStoredForm,
  isFuncionarioCpfEncryptedPayload,
} from './funcionarioCpfCrypto';

const PREFIX = 'fpdv.cpf.v1:';
/** 32 bytes em hex (AES-256). */
const TEST_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const CPF_OK = '39053344705';

describe('funcionarioCpfCrypto', () => {
  const prevKey = process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
    else process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY = prevKey;
  });

  describe('com FUNCIONARIO_CPF_ENCRYPTION_KEY', () => {
    beforeEach(() => {
      process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it('criptografa com prefixo fpdv.cpf.v1:', () => {
      assert.equal(isFuncionarioCpfEncryptedPayload(CPF_OK), false);
      const stored = encryptFuncionarioCpfForStorage(CPF_OK);
      assert.ok(stored);
      assert.ok(stored!.startsWith(PREFIX));
      assert.equal(isFuncionarioCpfEncryptedPayload(stored!), true);
    });

    it('descriptografia recupera os 11 dígitos', () => {
      const stored = encryptFuncionarioCpfForStorage(CPF_OK);
      assert.equal(decryptFuncionarioCpfStored(stored), CPF_OK);
    });

    it('round-trip é estável em valor lógico (ciphertext pode variar pelo IV)', () => {
      const a = encryptFuncionarioCpfForStorage(CPF_OK);
      const b = encryptFuncionarioCpfForStorage(CPF_OK);
      assert.notEqual(a, b, 'IV aleatório → ciphertext diferente');
      assert.equal(decryptFuncionarioCpfStored(a), CPF_OK);
      assert.equal(decryptFuncionarioCpfStored(b), CPF_OK);
    });

    it('ensureFuncionarioCpfStoredForm preserva valor já cifrado (string idêntica)', () => {
      const cipher = encryptFuncionarioCpfForStorage(CPF_OK)!;
      assert.equal(ensureFuncionarioCpfStoredForm(cipher), cipher);
    });

    it('ensureFuncionarioCpfStoredForm migra texto puro 11 dígitos para cifrado', () => {
      const out = ensureFuncionarioCpfStoredForm(CPF_OK);
      assert.ok(out?.startsWith(PREFIX));
      assert.equal(decryptFuncionarioCpfStored(out), CPF_OK);
    });
  });

  describe('legado e ausência de chave', () => {
    it('legado em texto puro: decrypt retorna dígitos', () => {
      delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
      assert.equal(decryptFuncionarioCpfStored(CPF_OK), CPF_OK);
      assert.equal(decryptFuncionarioCpfStored('390.533.447-05'), CPF_OK);
    });

    it('sem chave: encrypt não cifra (retorna dígitos)', () => {
      delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
      assert.equal(encryptFuncionarioCpfForStorage(CPF_OK), CPF_OK);
    });

    it('sem chave: payload cifrado não pode ser lido (null)', () => {
      process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY = TEST_KEY_HEX;
      const cipher = encryptFuncionarioCpfForStorage(CPF_OK)!;
      delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
      assert.equal(decryptFuncionarioCpfStored(cipher), null);
    });

    it('sem chave: ensureFuncionarioCpfStoredForm devolve texto puro inalterado se não for 11 dígitos úteis', () => {
      delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
      const weird = 'abc';
      assert.equal(ensureFuncionarioCpfStoredForm(weird), weird);
    });
  });

  it('null / vazio em encrypt e decrypt', () => {
    process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY = TEST_KEY_HEX;
    assert.equal(encryptFuncionarioCpfForStorage(null), null);
    assert.equal(encryptFuncionarioCpfForStorage(''), null);
    assert.equal(decryptFuncionarioCpfStored(null), null);
    assert.equal(decryptFuncionarioCpfStored(''), null);
    delete process.env.FUNCIONARIO_CPF_ENCRYPTION_KEY;
  });
});
