import { Router } from 'express';
import { q1, qRun } from '../db';
import { LEGAL_BUNDLE_VERSION } from '../legal/legalBundleVersion';
import { sendInternalError } from '../utils/internalServerError';

export function createLegalRouter() {
  const router = Router();

  router.get('/status', async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (userId == null || !Number.isFinite(Number(userId))) {
        return res.status(401).json({ error: 'Sessão inválida' });
      }

      const row = await q1<{ legal_bundle_version: string | null; legal_accepted_at: string | null }>(
        'SELECT legal_bundle_version, legal_accepted_at FROM usuarios WHERE id=?',
        [userId]
      );

      const acceptedVersion = row?.legal_bundle_version?.trim() || null;
      const needsAcceptance = acceptedVersion !== LEGAL_BUNDLE_VERSION;

      res.json({
        bundle_version_required: LEGAL_BUNDLE_VERSION,
        accepted_bundle_version: acceptedVersion,
        accepted_at: row?.legal_accepted_at ?? null,
        needs_acceptance: needsAcceptance,
      });
    } catch (err: unknown) {
      sendInternalError(res, 'GET /api/legal/status', err);
    }
  });

  router.post('/accept', async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (userId == null || !Number.isFinite(Number(userId))) {
        return res.status(401).json({ success: false, message: 'Sessão inválida' });
      }

      const bodyVersion = typeof req.body?.bundle_version === 'string' ? req.body.bundle_version.trim() : '';
      if (bodyVersion !== LEGAL_BUNDLE_VERSION) {
        return res.status(400).json({
          success: false,
          message: 'Versão dos documentos desatualizada. Atualize a página e tente novamente.',
        });
      }

      await qRun('UPDATE usuarios SET legal_bundle_version=?, legal_accepted_at=NOW() WHERE id=?', [
        LEGAL_BUNDLE_VERSION,
        userId,
      ]);

      res.json({
        success: true,
        bundle_version: LEGAL_BUNDLE_VERSION,
        accepted_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      sendInternalError(res, 'POST /api/legal/accept', err);
    }
  });

  return router;
}
