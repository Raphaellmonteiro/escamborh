// src/routes/rh.ts — Módulo RH: funcionários, ponto, espelho, folha
import { Router } from 'express';
import { q1, qAll, qRun, qInsert } from '../db';
import {
  hourBankApplicable,
  isEvento,
  isFixo,
  normalizeTipoContrato,
  usesAutoDecimoTerceiro,
} from '../services/employeeContract';
import { uploadFotoFunc, checkMagicBytes } from '../middleware';
import {
  calculatePayroll,
  computePayrollPaymentSummary,
  getPayrollPaymentHistory,
  registerPayrollPayment,
  getEmployeeHourBankSummary,
  listHourBankMovements,
  addHourBankMovement,
  syncBankCreditFromHoraExtra,
  deleteHourBankMovementsLinkedToHoraExtra,
  extraMinutesForPayrollRow,
  extraMinutesForBankFromRow,
  roundMoney,
} from '../services/payrollService';
import { deletePointRecord, updatePointRecord } from '../services/pointService';
import {
  buildRhAlerts,
  listFerias,
  feriasSaldoResumo,
  scheduleFerias,
  startFerias,
  completeFerias,
  countFeriasOverlap,
  ensureDecimoRow,
  payDecimoParcela,
  updateDecimoCalculoModo,
  listBeneficios,
  upsertBeneficio,
} from '../services/hrManagerialService';

const TZ = 'America/Sao_Paulo';

type HoraExtraDestino = 'folha' | 'banco' | 'dividido';

function inferHoraExtraDestino(total: number, minutosPagoFolha: number): HoraExtraDestino {
  if (minutosPagoFolha <= 0) return 'banco';
  if (minutosPagoFolha >= total) return 'folha';
  return 'dividido';
}

/** Destino exibido no espelho (inclui pendente e legado). */
function destinoUiHoraExtra(curr: {
  minutos: number;
  minutos_pago_folha?: number | null;
  destino_pendente?: number | null;
}): HoraExtraDestino | 'pendente' | 'legado_folha' {
  if (Number(curr.destino_pendente) === 1) return 'pendente';
  const total = Math.max(0, Number(curr.minutos) || 0);
  if (curr.minutos_pago_folha == null) return 'legado_folha';
  return inferHoraExtraDestino(total, extraMinutesForPayrollRow(curr));
}

function validateHoraExtraDestino(params: {
  total: number;
  minutosPagoFolha: number;
  destinoRaw: unknown;
  bancoAplicavel: boolean;
}): { ok: true; destino: HoraExtraDestino } | { ok: false; error: string } {
  const destinoInformado =
    params.destinoRaw == null || String(params.destinoRaw).trim() === ''
      ? null
      : String(params.destinoRaw).trim();
  const destino =
    destinoInformado === 'folha' || destinoInformado === 'banco' || destinoInformado === 'dividido'
      ? destinoInformado
      : destinoInformado == null
        ? inferHoraExtraDestino(params.total, params.minutosPagoFolha)
        : null;
  if (!destino) {
    return { ok: false, error: 'destino invalido. Use folha, banco ou dividido.' };
  }
  if (!params.bancoAplicavel && destino !== 'folha') {
    return { ok: false, error: 'Este contrato nao permite enviar HE para banco. Use destino folha.' };
  }
  if (destino === 'folha' && params.minutosPagoFolha !== params.total) {
    return { ok: false, error: 'Destino folha exige minutos_pago_folha igual ao total da HE.' };
  }
  if (destino === 'banco' && params.minutosPagoFolha !== 0) {
    return { ok: false, error: 'Destino banco exige minutos_pago_folha = 0.' };
  }
  if (destino === 'dividido' && (params.minutosPagoFolha <= 0 || params.minutosPagoFolha >= params.total)) {
    return { ok: false, error: 'Destino dividido exige minutos_pago_folha entre 1 e o total - 1.' };
  }
  return { ok: true, destino };
}

async function assertFixoForFeriasOps(
  tenantId: number,
  feriasId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await q1<{ funcionario_id: number }>(
    'SELECT funcionario_id FROM func_ferias WHERE id=? AND tenant_id=?',
    [feriasId, tenantId]
  );
  if (!row) return { ok: false, error: 'Período de férias não encontrado.' };
  const f = await q1<{ tipo_contrato: string | null }>(
    'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [row.funcionario_id, tenantId]
  );
  if (!isFixo(normalizeTipoContrato(f?.tipo_contrato))) {
    return {
      ok: false,
      error: 'Férias gerenciais automáticas não se aplicam a este tipo de contrato (use histórico apenas para consulta, se existir).',
    };
  }
  return { ok: true };
}

async function assertFixoForDecimoOps(
  tenantId: number,
  decimoId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await q1<{ funcionario_id: number }>(
    'SELECT funcionario_id FROM func_decimo_terceiro WHERE id=? AND tenant_id=?',
    [decimoId, tenantId]
  );
  if (!row) return { ok: false, error: 'Registro de 13º não encontrado.' };
  const f = await q1<{ tipo_contrato: string | null }>(
    'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [row.funcionario_id, tenantId]
  );
  if (!isFixo(normalizeTipoContrato(f?.tipo_contrato))) {
    return {
      ok: false,
      error: '13º gerencial automático não se aplica a este tipo de contrato.',
    };
  }
  return { ok: true };
}

export function createRhRouter() {
  const router = Router();


  // ── Funcionários CRUD ─────────────────────────────────────────────────────
  router.get('/', async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM funcionarios WHERE tenant_id=? ORDER BY nome ASC', [req.tenantId]));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/painel/alertas', async (req: any, res) => {
    try {
      const alertas = await buildRhAlerts({ tenantId: req.tenantId });
      res.json({ alertas });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/ferias/:feriasId', async (req: any, res) => {
    try {
      const feriasId = Number(req.params.feriasId);
      const gate = await assertFixoForFeriasOps(req.tenantId, feriasId);
      if (gate.ok === false) return res.status(400).json({ error: gate.error });
      const { action } = req.body || {};
      if (action === 'schedule') {
        const { data_inicio_gozo, data_fim_gozo } = req.body || {};
        if (!data_inicio_gozo || !data_fim_gozo) {
          return res.status(400).json({ error: 'Informe data_inicio_gozo e data_fim_gozo.' });
        }
        const rowCheck = await q1<{ funcionario_id: number }>(
          'SELECT funcionario_id FROM func_ferias WHERE id=? AND tenant_id=?',
          [feriasId, req.tenantId]
        );
        const overlap = rowCheck
          ? await countFeriasOverlap({
              tenantId: req.tenantId,
              excludeEmployeeId: rowCheck.funcionario_id,
              dataInicio: String(data_inicio_gozo),
              dataFim: String(data_fim_gozo),
            })
          : { count: 0, alerta: false };
        const r = await scheduleFerias({
          tenantId: req.tenantId,
          feriasId,
          dataInicioGozo: String(data_inicio_gozo),
          dataFimGozo: String(data_fim_gozo),
        });
        if (r.ok === false) return res.status(400).json({ error: r.error });
        return res.json({ success: true, ferias: r.row, overlap });
      }
      if (action === 'start') {
        const r = await startFerias({ tenantId: req.tenantId, feriasId });
        if (r.ok === false) return res.status(400).json({ error: r.error });
        return res.json({ success: true, ferias: r.row });
      }
      if (action === 'complete') {
        const valor_pago = req.body?.valor_pago;
        const r = await completeFerias({
          tenantId: req.tenantId,
          feriasId,
          valorPago: Number(valor_pago),
        });
        if (r.ok === false) return res.status(400).json({ error: r.error });
        return res.json({ success: true, ferias: r.row });
      }
      return res.status(400).json({ error: 'action inválida (schedule, start, complete).' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/decimo-terceiro/:dtId', async (req: any, res) => {
    try {
      const dtId = Number(req.params.dtId);
      const gate = await assertFixoForDecimoOps(req.tenantId, dtId);
      if (gate.ok === false) return res.status(400).json({ error: gate.error });
      const { action } = req.body || {};
      if (action === 'set_calculo') {
        const modo = String(req.body?.modo || '').trim();
        if (modo !== 'automatico' && modo !== 'manual') {
          return res.status(400).json({ error: 'modo deve ser automatico ou manual.' });
        }
        const valorTotalManual =
          modo === 'manual' && req.body?.valor_total_manual != null
            ? Number(req.body.valor_total_manual)
            : null;
        const r = await updateDecimoCalculoModo({
          tenantId: req.tenantId,
          decimoId: dtId,
          modo,
          valorTotalManual,
        });
        if (r.ok === false) return res.status(400).json({ error: r.error });
        return res.json({ success: true, decimo: r.row });
      }
      if (action !== 'pay_primeira' && action !== 'pay_segunda') {
        return res.status(400).json({ error: 'Use action pay_primeira, pay_segunda ou set_calculo.' });
      }
      const r = await payDecimoParcela({
        tenantId: req.tenantId,
        decimoId: dtId,
        parcela: action === 'pay_primeira' ? 1 : 2,
      });
      if (r.ok === false) return res.status(400).json({ error: r.error });
      res.json({ success: true, decimo: r.row });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req: any, res) => {
    try {
      const { nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,foto_url } = req.body;
      if (!nome) return res.status(400).json({ error:'Nome obrigatório' });
      const tipoContrato = req.body.tipo_contrato || 'fixo';
      const allowedTipoContrato = ['fixo', 'diarista', 'evento'];
      if (!allowedTipoContrato.includes(tipoContrato)) {
        return res.status(400).json({ error: 'tipo_contrato inválido' });
      }
      const id = await qInsert(
        'INSERT INTO funcionarios (tenant_id,nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,tipo_contrato,foto_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [req.tenantId,nome,cargo||'',salario_base||0,horario_entrada||'08:00',horario_saida||'17:00',carga_horaria||8,dias_semana||'1,2,3,4,5',tolerancia_minutos||10,dias_trabalho_mes||26,data_admissao||null,telefone||null,cpf||null,pin||null,tipoContrato,foto_url||null]
      );
      res.json({ id });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.put('/:id', async (req: any, res) => {
    try {
      const { nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,foto_url } = req.body;
      const tipoContrato = req.body.tipo_contrato || 'fixo';
      const allowedTipoContrato = ['fixo', 'diarista', 'evento'];
      if (!allowedTipoContrato.includes(tipoContrato)) {
        return res.status(400).json({ error: 'tipo_contrato inválido' });
      }
      await qRun(
        'UPDATE funcionarios SET nome=?,cargo=?,salario_base=?,horario_entrada=?,horario_saida=?,carga_horaria=?,dias_semana=?,tolerancia_minutos=?,dias_trabalho_mes=?,data_admissao=?,telefone=?,cpf=?,pin=?,tipo_contrato=?,foto_url=? WHERE id=? AND tenant_id=?',
        [nome,cargo||'',salario_base||0,horario_entrada||'08:00',horario_saida||'17:00',carga_horaria||8,dias_semana||'1,2,3,4,5',tolerancia_minutos||10,dias_trabalho_mes||26,data_admissao||null,telefone||null,cpf||null,pin||null,tipoContrato,foto_url||null,req.params.id,req.tenantId]
      );
      res.json({ success:true });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/:id/desativar', async (req: any, res) => {
    try {
      await qRun("UPDATE funcionarios SET status='inativo' WHERE id=? AND tenant_id=?", [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/foto', uploadFotoFunc.single('foto'), checkMagicBytes, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const foto_url = `/uploads/funcionarios/${req.file.filename}`;
      await qRun('UPDATE funcionarios SET foto_url=? WHERE id=? AND tenant_id=?', [foto_url, req.params.id, req.tenantId]);
      res.json({ success: true, foto_url });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Pontos ────────────────────────────────────────────────────────────────
  router.get('/:id/pontos', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) {
        q += ` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`;
        p.push(String(month).padStart(2,'0'), String(year));
      }
      res.json(await qAll(q+' ORDER BY data ASC, hora ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/pontos', async (req: any, res) => {
    try {
      const now = new Date();
      const data = now.toLocaleDateString('en-CA',{timeZone:TZ});
      const hora = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:TZ});
      const hoje = await qAll('SELECT tipo FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND data=? ORDER BY id ASC', [req.params.id,req.tenantId,data]);
      const temEntrada = hoje.some((p:any)=>p.tipo==='entrada');
      const temSaida   = hoje.some((p:any)=>p.tipo==='saida');
      if (temEntrada&&temSaida) return res.status(409).json({success:false,error:'Ponto de entrada e saída já registrados hoje.'});
      const tipo = temEntrada ? 'saida' : 'entrada';
      const ip = (req.headers['x-forwarded-for'] as string||req.socket?.remoteAddress||'').toString();
      await qRun('INSERT INTO func_pontos (tenant_id,funcionario_id,data,hora,tipo,ip,user_agent) VALUES (?,?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,hora,tipo,ip,req.headers['user-agent']||'']);
      res.json({success:true,tipo,data,hora});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/:id/pontos-dia', async (req: any, res) => {
    try {
      const { data } = req.query;
      if (!data) return res.status(400).json({ error:'data obrigatória' });
      res.json(await qAll('SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND data=? ORDER BY id ASC', [req.params.id,req.tenantId,data]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/pontos-manual', async (req: any, res) => {
    try {
      const { data, hora, tipo } = req.body;
      if (!data||!hora||!tipo) return res.status(400).json({ error:'data, hora e tipo obrigatórios' });
      await qRun('INSERT INTO func_pontos (tenant_id,funcionario_id,data,hora,tipo,ip) VALUES (?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,hora,tipo,'manual-admin']);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Pontos admin (/pontos/:id) ────────────────────────────────────────────
  router.put('/pontos/:pontId', async (req: any, res) => {
    try {
      const { hora, tipo } = req.body;
      const result = await updatePointRecord({
        tenantId: req.tenantId,
        pointId: req.params.pontId,
        hora: String(hora || ''),
        tipo: tipo != null ? String(tipo) : null,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/pontos/:pontId', async (req: any, res) => {
    try {
      const result = await deletePointRecord({
        tenantId: req.tenantId,
        pointId: req.params.pontId,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Horas extras ──────────────────────────────────────────────────────────
  router.get('/:id/horas-extras', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) { q+=` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`; p.push(String(month).padStart(2,'0'),String(year)); }
      res.json(await qAll(q+' ORDER BY data ASC, created_at ASC, id ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/horas-extras', async (req: any, res) => {
    try {
      const { data, minutos, observacao, minutos_pago_folha, destino } = req.body;
      if (!data||!minutos) return res.status(400).json({ error:'data e minutos obrigatórios' });
      const total = Math.floor(Number(minutos));
      if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error:'minutos inválidos' });
      const funcRow = await q1<{ tipo_contrato: string | null }>(
        'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      if (!funcRow) return res.status(404).json({ error: 'Funcionario nao encontrado' });
      const createdBy = req.user?.username != null ? String(req.user.username) : null;

      const destinoStr = destino != null ? String(destino).trim() : '';
      if (destinoStr === 'pendente') {
        const id = await qInsert(
          'INSERT INTO func_horas_extras (tenant_id,funcionario_id,data,minutos,observacao,minutos_pago_folha,destino_pendente) VALUES (?,?,?,?,?,NULL,1)',
          [req.tenantId, req.params.id, data, total, observacao || null]
        );
        if (id != null) {
          await syncBankCreditFromHoraExtra({
            tenantId: req.tenantId,
            employeeId: Number(req.params.id),
            horaExtraId: Number(id),
            data,
            minutos: total,
            minutosPagoFolha: null,
            createdBy,
            destinoPendente: true,
          });
        }
        return res.json({ success: true, id, destino: 'pendente' });
      }

      if (minutos_pago_folha === undefined || minutos_pago_folha === null || String(minutos_pago_folha).trim() === '') {
        return res.status(400).json({
          error: 'Informe explicitamente quantos minutos da HE vão para a folha. Use 0 para banco e o total para pagamento integral.',
        });
      }
      const pagoFolha = Math.floor(Number(minutos_pago_folha));
      if (!Number.isFinite(pagoFolha) || pagoFolha < 0 || pagoFolha > total) {
        return res.status(400).json({ error:'minutos_pago_folha deve estar entre 0 e o total de minutos' });
      }
      const destinoCheck = validateHoraExtraDestino({
        total,
        minutosPagoFolha: pagoFolha,
        destinoRaw: destino,
        bancoAplicavel: hourBankApplicable(normalizeTipoContrato(funcRow.tipo_contrato)),
      });
      if (destinoCheck.ok === false) return res.status(400).json({ error: destinoCheck.error });
      const id = await qInsert(
        'INSERT INTO func_horas_extras (tenant_id,funcionario_id,data,minutos,observacao,minutos_pago_folha,destino_pendente) VALUES (?,?,?,?,?,?,0)',
        [req.tenantId,req.params.id,data,total,observacao||null,pagoFolha]
      );
      if (id != null) {
        await syncBankCreditFromHoraExtra({
          tenantId: req.tenantId,
          employeeId: Number(req.params.id),
          horaExtraId: Number(id),
          data,
          minutos: total,
          minutosPagoFolha: pagoFolha,
          createdBy,
        });
      }
      res.json({success:true,id,destino: destinoCheck.destino});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/horas-extras/:id', async (req: any, res) => {
    try {
      const heId = Number(req.params.id);
      const row = await q1<{
        id: number;
        funcionario_id: number;
        data: string;
        minutos: number;
        minutos_pago_folha: number | null;
        destino_pendente?: number | null;
      }>(
        'SELECT id, funcionario_id, data, minutos, minutos_pago_folha, COALESCE(destino_pendente,0) AS destino_pendente FROM func_horas_extras WHERE id=? AND tenant_id=?',
        [heId, req.tenantId]
      );
      if (!row) return res.status(404).json({ error: 'Registro não encontrado' });
      const { minutos, minutos_pago_folha, destino, observacao } = req.body || {};
      const total =
        minutos != null && String(minutos).trim() !== ''
          ? Math.floor(Number(minutos))
          : Math.floor(Number(row.minutos));
      if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'minutos inválidos' });
      let pagoFolha: number;
      if (minutos_pago_folha !== undefined && minutos_pago_folha !== null && String(minutos_pago_folha).trim() !== '') {
        pagoFolha = Math.floor(Number(minutos_pago_folha));
      } else if (row.minutos_pago_folha != null) {
        pagoFolha = Math.floor(Number(row.minutos_pago_folha));
      } else if (Number(row.destino_pendente) === 1) {
        return res.status(400).json({
          error: 'HE pendente: informe minutos_pago_folha e destino (folha, banco ou dividido) para concluir.',
        });
      } else {
        return res.status(400).json({
          error: 'Informe minutos_pago_folha e destino para atualizar a hora extra.',
        });
      }
      if (!Number.isFinite(pagoFolha) || pagoFolha < 0 || pagoFolha > total) {
        return res.status(400).json({ error: 'minutos_pago_folha deve estar entre 0 e o total de minutos' });
      }
      const funcRow = await q1<{ tipo_contrato: string | null }>(
        'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [row.funcionario_id, req.tenantId]
      );
      const destinoCheck = validateHoraExtraDestino({
        total,
        minutosPagoFolha: pagoFolha,
        destinoRaw: destino,
        bancoAplicavel: hourBankApplicable(normalizeTipoContrato(funcRow?.tipo_contrato)),
      });
      if (destinoCheck.ok === false) return res.status(400).json({ error: destinoCheck.error });
      const data = req.body?.data != null ? String(req.body.data).trim() : row.data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'data inválida' });
      const createdBy = req.user?.username != null ? String(req.user.username) : null;
      let uq = `UPDATE func_horas_extras SET data=?, minutos=?, minutos_pago_folha=?, destino_pendente=0`;
      const up: unknown[] = [data, total, pagoFolha];
      if (observacao !== undefined) {
        uq += ', observacao=?';
        up.push(observacao != null ? String(observacao) : null);
      }
      uq += ' WHERE id=? AND tenant_id=?';
      up.push(heId, req.tenantId);
      await qRun(uq, up);
      await syncBankCreditFromHoraExtra({
        tenantId: req.tenantId,
        employeeId: row.funcionario_id,
        horaExtraId: heId,
        data,
        minutos: total,
        minutosPagoFolha: pagoFolha,
        createdBy,
      });
      res.json({ success: true, destino: destinoCheck.destino });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/horas-extras/:id', async (req: any, res) => {
    try {
      const row = await q1<{ id: number; funcionario_id: number }>(
        'SELECT id, funcionario_id FROM func_horas_extras WHERE id=? AND tenant_id=?',
        [req.params.id,req.tenantId]
      );
      if (!row) return res.status(404).json({ error:'Registro não encontrado' });
      await deleteHourBankMovementsLinkedToHoraExtra({
        tenantId: req.tenantId,
        employeeId: row.funcionario_id,
        horaExtraId: row.id,
      });
      await qRun('DELETE FROM func_horas_extras WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Banco de horas ────────────────────────────────────────────────────────
  router.get('/:id/banco-horas', async (req: any, res) => {
    try {
      const employeeId = Number(req.params.id);
      const fc = await q1<{ tipo_contrato: string | null }>(
        'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [employeeId, req.tenantId]
      );
      const bOk = hourBankApplicable(normalizeTipoContrato(fc?.tipo_contrato));
      const summary = await getEmployeeHourBankSummary({ tenantId: req.tenantId, employeeId });
      const { month, year, limit } = req.query;
      const movimentacoes = await listHourBankMovements({
        tenantId: req.tenantId,
        employeeId,
        month: month != null ? String(month) : undefined,
        year: year != null ? String(year) : undefined,
        limit: limit != null ? Number(limit) : 250,
      });
      res.json({ ...summary, movimentacoes, aplicavel: bOk });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/banco-horas/movimentacoes', async (req: any, res) => {
    try {
      const { data_referencia, tipo, minutos, origem, observacao, competencia_referencia } = req.body || {};
      const createdBy = req.user?.username != null ? String(req.user.username) : null;
      const result = await addHourBankMovement({
        tenantId: req.tenantId,
        employeeId: Number(req.params.id),
        dataReferencia: String(data_referencia || ''),
        tipo: String(tipo || ''),
        minutos: Number(minutos),
        origem: String(origem || ''),
        observacao: observacao != null ? String(observacao) : null,
        createdBy,
        metadataJson: null,
        payrollReference: competencia_referencia != null ? String(competencia_referencia) : null,
      });
      if (result.ok === false) return res.status(400).json({ error: result.error });
      res.json({ success: true, movimentacao: result.mov });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Eventos (falta/folga/atestado) ────────────────────────────────────────
  router.get('/:id/eventos', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) { q+=` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`; p.push(String(month).padStart(2,'0'),String(year)); }
      res.json(await qAll(q+' ORDER BY data ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/eventos', async (req: any, res) => {
    try {
      const { data, tipo, horas_ausentes, observacao } = req.body;
      if (!data||!tipo) return res.status(400).json({ error:'data e tipo obrigatórios' });
      const id = await qInsert('INSERT INTO func_eventos (tenant_id,funcionario_id,data,tipo,horas_ausentes,observacao) VALUES (?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,tipo,horas_ausentes||0,observacao||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/eventos/:id', async (req: any, res) => {
    try {
      await qRun('DELETE FROM func_eventos WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Adiantamentos ─────────────────────────────────────────────────────────
  router.get('/:id/adiantamentos', async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM func_adiantamentos WHERE funcionario_id=? AND tenant_id=? ORDER BY data DESC', [req.params.id,req.tenantId]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/adiantamentos', async (req: any, res) => {
    try {
      const { valor, motivo } = req.body;
      if (!valor) return res.status(400).json({ error:'valor obrigatório' });
      const funcRow = await q1<{ tipo_contrato: string | null }>(
        'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [req.params.id, req.tenantId]
      );
      if (!funcRow) return res.status(404).json({ error: 'Funcionário não encontrado' });
      if (isEvento(normalizeTipoContrato(funcRow.tipo_contrato))) {
        return res.status(400).json({
          error:
            'Colaboradores por evento não utilizam adiantamento de folha. Registre valores na aba Folha em Pagamentos (pagamento avulso ou parcial).',
        });
      }
      const id = await qInsert('INSERT INTO func_adiantamentos (tenant_id,funcionario_id,valor,motivo) VALUES (?,?,?,?)',
        [req.tenantId,req.params.id,valor,motivo||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/adiantamentos/:id/descontar', async (req: any, res) => {
    try {
      await qRun('UPDATE func_adiantamentos SET descontado=1 WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Ajustes salariais ─────────────────────────────────────────────────────
  router.get('/:id/ajustes', async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM func_ajustes_salario WHERE funcionario_id=? AND tenant_id=? ORDER BY data DESC', [req.params.id,req.tenantId]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/:id/ferias', async (req: any, res) => {
    try {
      const employeeId = Number(req.params.id);
      const rows = await listFerias({ tenantId: req.tenantId, employeeId });
      const resumo = feriasSaldoResumo(rows);
      res.json({ ferias: rows, resumo });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id/decimo-terceiro', async (req: any, res) => {
    try {
      const employeeId = Number(req.params.id);
      const ano = req.query.ano != null ? Number(req.query.ano) : new Date().getFullYear();
      if (!Number.isFinite(ano)) return res.status(400).json({ error: 'Ano inválido' });
      const funcRow = await q1<{ id: number; tipo_contrato: string | null }>(
        'SELECT id, tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [employeeId, req.tenantId]
      );
      if (!funcRow) return res.status(404).json({ error: 'Funcionário não encontrado' });
      const tipoEmp = normalizeTipoContrato(funcRow.tipo_contrato);
      const row = await ensureDecimoRow({ tenantId: req.tenantId, employeeId, ano });
      if (!row && !usesAutoDecimoTerceiro(tipoEmp)) {
        return res.json({ aplicavel: false, decimo: null, pago_total: 0, pendente: 0 });
      }
      if (!row) return res.status(404).json({ error: 'Funcionário não encontrado' });
      const pago = roundMoney(Number(row.valor_primeira_parcela) * (row.pago_primeira ? 1 : 0) + Number(row.valor_segunda_parcela) * (row.pago_segunda ? 1 : 0));
      const pendente = roundMoney(Number(row.valor_total) - pago);
      res.json({
        aplicavel: usesAutoDecimoTerceiro(tipoEmp),
        decimo: row,
        pago_total: pago,
        pendente,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id/beneficios', async (req: any, res) => {
    try {
      const employeeId = Number(req.params.id);
      const rows = await listBeneficios({ tenantId: req.tenantId, employeeId });
      res.json({ beneficios: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id/beneficios', async (req: any, res) => {
    try {
      const employeeId = Number(req.params.id);
      const func = await q1<{ id: number; tipo_contrato: string | null }>(
        'SELECT id, tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
        [employeeId, req.tenantId]
      );
      if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
      if (isEvento(normalizeTipoContrato(func.tipo_contrato))) {
        return res.status(400).json({
          error: 'Benefícios gerenciais não se aplicam a colaboradores por evento.',
        });
      }
      const items = req.body?.items;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Envie items: array' });
      for (const it of items) {
        await upsertBeneficio({
          tenantId: req.tenantId,
          employeeId,
          tipo: String(it.tipo || ''),
          valor: Number(it.valor),
          tipoValor: String(it.tipo_valor || 'fixo'),
          ativo: Boolean(it.ativo),
          efeito: String(it.efeito || 'acrescimo'),
        });
      }
      const rows = await listBeneficios({ tenantId: req.tenantId, employeeId });
      res.json({ success: true, beneficios: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/ajustes', async (req: any, res) => {
    try {
      const { tipo, valor, motivo } = req.body;
      if (!tipo||!valor) return res.status(400).json({ error:'tipo e valor obrigatórios' });
      const id = await qInsert('INSERT INTO func_ajustes_salario (tenant_id,funcionario_id,tipo,valor,motivo) VALUES (?,?,?,?,?)',
        [req.tenantId,req.params.id,tipo,valor,motivo||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

// ── Espelho de ponto (cálculo mensal) ─────────────────────────────────────
  router.get('/:id/espelho', async (req: any, res) => {
    try {
      const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      if (!func) return res.status(404).json({ error:'Funcionário não encontrado' });
      const mm = String(req.query.month||new Date().getMonth()+1).padStart(2,'0');
      const yy = String(req.query.year||new Date().getFullYear());
      const hoje = new Date().toLocaleDateString('en-CA',{timeZone:TZ});
      const admissao = func.data_admissao||null;

      const pontos = await qAll(
        `SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data,hora`,
        [func.id,req.tenantId,mm,yy]
      );
      const eventos = await qAll(
        `SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data`,
        [func.id,req.tenantId,mm,yy]
      );
      // NOVO: Buscar também as horas extras do mês
      const extras = await qAll(
        `SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data ASC, created_at ASC, id ASC`,
        [func.id,req.tenantId,mm,yy]
      );

      const pbd: Record<string,any[]>={}, ebd: Record<string,any[]>={}, hbd: Record<string,any[]>={};
      for (const p of pontos) { if(!pbd[p.data])pbd[p.data]=[]; pbd[p.data].push(p); }
      for (const e of eventos) { if(!ebd[e.data])ebd[e.data]=[]; ebd[e.data].push(e); }
      for (const h of extras) {
        if (!hbd[h.data]) hbd[h.data] = [];
        hbd[h.data].push(h);
      }

      const diasNoMes = new Date(Number(yy),Number(mm),0).getDate();
      const diasSemana = (func.dias_semana||'1,2,3,4,5').split(',').map(Number);
      const tolerancia = func.tolerancia_minutos||10;
      const cargaHoras = func.carga_horaria||8;
      const horEnt = func.horario_entrada||'08:00';
      const horSai = func.horario_saida||'17:00';
      const timeToMin = (t: string) => {
        const p = String(t||'0:0').split(':');
        const h = Number(p[0])||0, m = Number(p[1])||0;
        return h*60+m;
      };
      const expectedOutMin = timeToMin(horSai);
      let totalFaltas=0,totalAtrasos=0,diasTrab=0,diasFolga=0,diasAtestado=0;
      const totalExtraMin = extras.reduce((acc, curr) => acc + (Number(curr.minutos) || 0), 0);
      const totalExtraMinPagoFolha = extras.reduce((acc, curr) => acc + extraMinutesForPayrollRow(curr), 0);
      const totalExtraMinBancoMes = extras.reduce((acc, curr) => acc + extraMinutesForBankFromRow(curr), 0);
      const totalExtraMinPendentes = extras.reduce(
        (acc, curr) =>
          acc + (Number((curr as { destino_pendente?: number }).destino_pendente) === 1 ? Number(curr.minutos) || 0 : 0),
        0
      );
      const horas_extras_pendentes = extras
        .filter((e: { destino_pendente?: number }) => Number(e.destino_pendente) === 1)
        .map((e: { id: number; data: string; minutos: number; observacao?: string | null }) => ({
          id: e.id,
          data: e.data,
          minutos: Number(e.minutos) || 0,
          observacao: e.observacao ?? null,
        }));

      const dias: any[] = [];
      for (let d=1;d<=diasNoMes;d++) {
        const dataStr=`${yy}-${mm}-${String(d).padStart(2,'0')}`;
        const diaSem=new Date(dataStr+'T12:00:00').getDay();
        const isExp=diasSemana.includes(diaSem);
        const evts=ebd[dataStr]||[];
        const pts=pbd[dataStr]||[];
        const extrasDia=(hbd[dataStr]||[]) as Array<{
          id: number;
          minutos: number;
          minutos_pago_folha?: number | null;
          destino_pendente?: number | null;
          observacao?: string | null;
        }>;
        const anyPendenteDia = extrasDia.some((c) => Number(c.destino_pendente) === 1);
        const extraAprov=extrasDia.length ? {
          id: extrasDia[extrasDia.length - 1].id,
          quantidade: extrasDia.length,
          minutos: extrasDia.reduce((acc, curr) => acc + (Number(curr.minutos) || 0), 0),
          minutos_pago_folha:
            extrasDia.length === 1
              ? (extrasDia[0].minutos_pago_folha ?? null)
              : extrasDia.reduce((acc, curr) => acc + extraMinutesForPayrollRow(curr), 0),
          destino:
            extrasDia.length === 1
              ? destinoUiHoraExtra(extrasDia[0])
              : anyPendenteDia
                ? 'pendente'
                : inferHoraExtraDestino(
                    extrasDia.reduce((acc, curr) => acc + (Number(curr.minutos) || 0), 0),
                    extrasDia.reduce((acc, curr) => acc + extraMinutesForPayrollRow(curr), 0)
                  ),
          observacao: extrasDia.length === 1 ? extrasDia[0].observacao ?? null : null,
          itens: extrasDia.map((curr) => ({
            id: curr.id,
            minutos: Number(curr.minutos) || 0,
            minutos_pago_folha: curr.minutos_pago_folha ?? null,
            destino: destinoUiHoraExtra(curr),
            observacao: curr.observacao ?? null,
          })),
        } : null;
        
        const ent=pts.find((p:any)=>p.tipo==='entrada');
        const said=pts.find((p:any)=>p.tipo==='saida');
        let status='sem_expediente'; let atrasoMin=0;
        const isFut=dataStr>hoje;
        const isAnt=admissao&&dataStr<admissao;

        let saidaRealExtraMin = 0;
        if (said && !isFut && !isAnt) {
          const outMin = timeToMin(said.hora);
          if (outMin > expectedOutMin) saidaRealExtraMin = outMin - expectedOutMin;
        }

        if (isFut||isAnt) { status='sem_expediente'; }
        else if (evts.some((e:any)=>e.tipo==='folga')) { status='folga'; diasFolga++; }
        else if (evts.some((e:any)=>e.tipo==='atestado')) { status='atestado'; diasAtestado++; }
        else if (isExp) {
          if (ent) {
            status='trabalhado'; diasTrab++;
            const [eh,em]=horEnt.split(':').map(Number);
            const lim=eh*60+em+tolerancia;
            const [rh,rm]=ent.hora.split(':').map(Number);
            const entMin=rh*60+rm;
            if (entMin>lim) { atrasoMin=entMin-(eh*60+em); totalAtrasos+=atrasoMin; }
          } else { status='falta'; totalFaltas++; }
        }
        dias.push({
          data:dataStr,dia:d,diaSemana:diaSem,isExpediente:isExp&&!isFut&&!isAnt,status,
          entrada:ent?.hora,saida:said?.hora,atrasoMin,eventos:evts,extraAprov,saidaRealExtraMin,
        });
      }
      const valorDia=func.salario_base/(func.dias_trabalho_mes||26);
      const valorHora=valorDia/cargaHoras;

      const tipoEsp = normalizeTipoContrato((func as { tipo_contrato?: string | null }).tipo_contrato);
      const bancoOk = hourBankApplicable(tipoEsp);
      const banco = bancoOk
        ? await getEmployeeHourBankSummary({ tenantId: req.tenantId, employeeId: Number(func.id) })
        : { saldo_minutos: 0 };
      const movBancoMes = bancoOk
        ? await listHourBankMovements({
            tenantId: req.tenantId,
            employeeId: Number(func.id),
            month: mm,
            year: yy,
            limit: 100,
          })
        : [];

      res.json({
        func,
        funcionario: func,
        dias,
        horas_extras_pendentes,
        resumo:{
          diasTrabalhados:diasTrab,totalFaltas,diasFolga,diasAtestado,totalAtrasoMin:totalAtrasos,
          totalExtraMin,totalExtraMinPagoFolha,totalExtraMinBancoMes,totalExtraMinPendentes,
          saldoBancoHorasMin:banco.saldo_minutos,
          descontoFaltas:totalFaltas*valorDia,descontoAtrasos:(totalAtrasos/60)*valorHora,
          totalDescontos:(totalFaltas*valorDia)+((totalAtrasos/60)*valorHora),
        },
        banco_horas_mes: movBancoMes,
        banco_horas_aplicavel: bancoOk,
      });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Folha de pagamento ────────────────────────────────────────────────────
  router.get('/:id/folha', async (req: any, res) => {
    try {
      const mm = String(req.query.month||new Date().getMonth()+1).padStart(2,'0');
      const yy = String(req.query.year||new Date().getFullYear());
      const startDate = `${yy}-${mm}-01`;
      const lastDay = new Date(Number(yy), Number(mm), 0).getDate();
      const endDate = `${yy}-${mm}-${String(lastDay).padStart(2,'0')}`;

      const computed = await calculatePayroll({
        tenantId: req.tenantId,
        employeeId: Number(req.params.id),
        startDate,
        endDate,
      });
      if (!computed) return res.status(404).json({ error:'Funcionário não encontrado' });

      const { legacy, earnings, deductions, totals, base_salary, competencia } = computed;
      const payroll_payments = await getPayrollPaymentHistory({
        tenantId: req.tenantId,
        employeeId: Number(req.params.id),
        referencia: competencia.referencia,
      });
      const netParaPagamentos = totals.net_gerencial ?? totals.net;
      const payroll_payment_summary = computePayrollPaymentSummary(netParaPagamentos, payroll_payments, {
        unbounded: Boolean(computed.pagamentos_sem_teto_folha),
      });
      const tipoFolha = computed.contract_profile.tipo;
      const hourOk = hourBankApplicable(tipoFolha);
      const hour_bank_summary = hourOk
        ? await getEmployeeHourBankSummary({
            tenantId: req.tenantId,
            employeeId: Number(req.params.id),
          })
        : { saldo_minutos: 0 };
      const hour_bank_mes = hourOk
        ? await listHourBankMovements({
            tenantId: req.tenantId,
            employeeId: Number(req.params.id),
            month: mm,
            year: yy,
            payrollReference: competencia.referencia,
            limit: 100,
          })
        : [];
      res.json({
        ...legacy,
        funcionario: legacy.funcionario,
        competencia,
        contract_profile: computed.contract_profile,
        pagamentos_sem_teto_folha: computed.pagamentos_sem_teto_folha ?? false,
        payroll: {
          base_salary,
          earnings,
          deductions,
          totals,
        },
        managerial: computed.managerial,
        payroll_payments,
        payroll_payment_summary,
        hour_bank: {
          saldo_minutos: hour_bank_summary.saldo_minutos,
          movimentacoes: hour_bank_mes,
          aplicavel: hourOk,
        },
      });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/folha/pagamentos', async (req: any, res) => {
    try {
      const { month, year, tipo, valor, observacao } = req.body || {};
      const mm = month != null ? String(month) : String(new Date().getMonth() + 1);
      const yy = year != null ? String(year) : String(new Date().getFullYear());
      const createdBy = req.user?.username != null ? String(req.user.username) : null;
      const result = await registerPayrollPayment({
        tenantId: req.tenantId,
        employeeId: Number(req.params.id),
        month: mm,
        year: yy,
        tipo: String(tipo || ''),
        valor: Number(valor),
        observacao: observacao != null ? String(observacao) : null,
        createdBy,
      });
      if (result.ok === false) return res.status(400).json({ error: result.error });
      res.json({ success: true, payment: result.payment });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
