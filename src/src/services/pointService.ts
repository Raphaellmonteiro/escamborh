import { q1, qRun } from '../db';

export interface PointMutationError {
  ok: false;
  status: number;
  error: string;
}

export interface PointMutationSuccess {
  ok: true;
}

export type PointMutationResult = PointMutationSuccess | PointMutationError;

export function validatePointHourInput(hora: string): { ok: true; hora: string } | PointMutationError {
  if (!hora) {
    return { ok: false, status: 400, error: 'hora obrigatória' };
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) {
    return { ok: false, status: 400, error: 'Formato inválido. Use HH:MM' };
  }
  return { ok: true, hora: hora.length === 5 ? `${hora}:00` : hora };
}

export async function updatePointRecord(params: {
  tenantId: number | string;
  pointId: number | string;
  hora: string;
  tipo?: string | null;
}): Promise<PointMutationResult> {
  const horaCheck = validatePointHourInput(params.hora);
  if (horaCheck.ok === false) return horaCheck;

  const ponto = await q1<{ tipo: string }>(
    'SELECT * FROM func_pontos WHERE id=? AND tenant_id=?',
    [params.pointId, params.tenantId]
  );
  if (!ponto) {
    return { ok: false, status: 404, error: 'Registro não encontrado' };
  }

  const novoTipo = params.tipo && ['entrada', 'saida'].includes(params.tipo) ? params.tipo : ponto.tipo;
  await qRun('UPDATE func_pontos SET hora=?,tipo=? WHERE id=? AND tenant_id=?', [
    horaCheck.hora,
    novoTipo,
    params.pointId,
    params.tenantId,
  ]);
  return { ok: true };
}

export async function deletePointRecord(params: {
  tenantId: number | string;
  pointId: number | string;
}): Promise<PointMutationResult> {
  const exists = await q1('SELECT id FROM func_pontos WHERE id=? AND tenant_id=?', [
    params.pointId,
    params.tenantId,
  ]);
  if (!exists) {
    return { ok: false, status: 404, error: 'Registro não encontrado' };
  }

  await qRun('DELETE FROM func_pontos WHERE id=? AND tenant_id=?', [params.pointId, params.tenantId]);
  return { ok: true };
}
