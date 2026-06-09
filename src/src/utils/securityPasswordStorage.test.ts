import {describe, expect, it} from 'vitest';
import {
  hashPlainSecurityPassword,
  isStoredSecurityPasswordBcrypt,
  subsenhaPerfilPrecisaAtencao,
  verifyStoredSecurityPassword,
} from './securityPasswordStorage';

describe('securityPasswordStorage', () => {
  describe('isStoredSecurityPasswordBcrypt', () => {
    it('detecta hash bcrypt ($2…)', () => {
      const hash = hashPlainSecurityPassword('any');
      expect(isStoredSecurityPasswordBcrypt(hash)).toBe(true);
    });

    it('não trata texto legado como bcrypt', () => {
      expect(isStoredSecurityPasswordBcrypt('123321')).toBe(false);
      expect(isStoredSecurityPasswordBcrypt('plain-secret')).toBe(false);
    });
  });

  describe('verifyStoredSecurityPassword', () => {
    it('aceita senha bcrypt correta e não pede rehash', () => {
      const plain = 'FlowPDV-test-9xK!';
      const stored = hashPlainSecurityPassword(plain);
      expect(verifyStoredSecurityPassword(stored, plain)).toEqual({
        ok: true,
        rehashToBcrypt: false,
      });
    });

    it('rejeita senha bcrypt incorreta', () => {
      const stored = hashPlainSecurityPassword('right');
      expect(verifyStoredSecurityPassword(stored, 'wrong')).toEqual({ok: false});
    });

    it('aceita legado em texto puro correto e sinaliza rehash', () => {
      expect(verifyStoredSecurityPassword('legacy-plain', 'legacy-plain')).toEqual({
        ok: true,
        rehashToBcrypt: true,
      });
    });

    it('rejeita legado em texto puro incorreto', () => {
      expect(verifyStoredSecurityPassword('stored', 'other')).toEqual({ok: false});
    });

    it('rejeita coluna vazia ou não configurada', () => {
      expect(verifyStoredSecurityPassword(null, 'x')).toEqual({ok: false});
      expect(verifyStoredSecurityPassword(undefined, 'x')).toEqual({ok: false});
      expect(verifyStoredSecurityPassword('', 'x')).toEqual({ok: false});
      expect(verifyStoredSecurityPassword('   ', 'x')).toEqual({ok: false});
    });

    it('rejeita quando a senha informada está vazia', () => {
      const stored = hashPlainSecurityPassword('x');
      expect(verifyStoredSecurityPassword(stored, '')).toEqual({ok: false});
      expect(verifyStoredSecurityPassword(stored, '   ')).toEqual({ok: false});
    });
  });

  describe('subsenhaPerfilPrecisaAtencao', () => {
    it('marca vazio / não configurado', () => {
      expect(subsenhaPerfilPrecisaAtencao(null)).toBe(true);
      expect(subsenhaPerfilPrecisaAtencao(undefined)).toBe(true);
      expect(subsenhaPerfilPrecisaAtencao('')).toBe(true);
      expect(subsenhaPerfilPrecisaAtencao('  ')).toBe(true);
    });

    it('marca legado fraco conhecido 123321', () => {
      expect(subsenhaPerfilPrecisaAtencao('123321')).toBe(true);
    });

    it('não marca valor bcrypt', () => {
      const h = hashPlainSecurityPassword('123321');
      expect(subsenhaPerfilPrecisaAtencao(h)).toBe(false);
    });
  });
});
