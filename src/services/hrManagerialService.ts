// src/services/hrManagerialService.ts — RH gerencial (férias, 13º, benefícios, alertas)
import { q1, qAll, qInsert, qRun } from '../db';
import {
  isEvento,
  isFixo,
  normalizeTipoContrato,
  usesAutoDecimoTerceiro,
  usesAutoFeriasPeriods,
  usesManagerialPayrollSupplement,
} from './employeeContract';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const TZ = 'America/Sao_Paulo';

export type FeriasStatus = 'available' | 'scheduled' | 'in_progress' | 'completed';
export type BeneficioTipo = 'transporte' | 'refeicao' | 'ajuda_custo';
export type BeneficioTipoValor = 'fixo' | 'percentual';
export type BeneficioEfeito = 'acrescimo' | 'desconto';

export interface FuncFeriasRow {
  id: number;
  tenant_id: number;
  funcionario_id: number;
  data_inicio_aquisitivo: string;
  data_fim_aquisitivo: string;
  dias_disponiveis: number;
  dias_usados: number;
  status: string;
  data_inicio_gozo: string | null;
  data_fim_gozo: string | null;
  valor_pago: number;
  created_at: string;
}

export interface FuncDecimoRow {
  id: number;
  tenant_id: number;
  funcionario_id: number;
  ano: number;
  meses_trabalhados: number;
  valor_total: number;
  valor_primeira_parcela: number;
  valor_segunda_parcela: number;
  pago_primeira: number;
  pago_segunda: number;
  primeira_pago_em: string | null;
  segunda_pago_em: string | null;
  created_at: string;
}

export interface FuncBeneficioRow {
  id: number;
  tenant_id: number;
  funcionario_id: number;
  tipo: string;
  valor: number;
  tipo_valor: string;
  ativo: number;
  efeito: string;
  created_at: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  if (x.getDate() < day) x.setDate(0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function daysBetweenInclusive(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da || !db) return 0;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function mesesTrabalhadosNoAno(dataAdmissao: string | null | undefined, ano: number): number {
  const adm = parseISODate(dataAdmissao || null);
  if (!adm) return 12;
  if (adm.getFullYear() > ano) return 0;
  if (adm.getFullYear() < ano) return 12;
  return 12 - adm.getMonth();
}

export async function ensureFeriasPeriods(params: { tenantId: number; employeeId: number }): Promise<void> {
  const func = await q1<{ data_admissao: string | null; tipo_contrato: string | null }>(
    'SELECT data_admissao, tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  if (!usesAutoFeriasPeriods(normalizeTipoContrato(func?.tipo_contrato))) return;
  const adm = parseISODate(func?.data_admissao || null);
  if (!adm) return;

  let periodStart = new Date(adm.getFullYear(), adm.getMonth(), adm.getDate());
  const today = parseISODate(todayISO())!;
  let guard = 0;
  while (guard++ < 40) {
    const periodEnd = addDays(addMonths(periodStart, 12), -1);
    if (periodEnd > today) break;

    const di = formatISODate(periodStart);
    const df = formatISODate(periodEnd);
    const exists = await q1(
      `SELECT id FROM func_ferias WHERE tenant_id=? AND funcionario_id=?
       AND data_inicio_aquisitivo=? AND data_fim_aquisitivo=?`,
      [params.tenantId, params.employeeId, di, df]
    );
    if (!exists) {
      await qInsert(
        `INSERT INTO func_ferias
          (tenant_id, funcionario_id, data_inicio_aquisitivo, data_fim_aquisitivo, dias_disponiveis, dias_usados, status, valor_pago)
         VALUES (?,?,?,?,?,?, 'available', 0)`,
        [params.tenantId, params.employeeId, di, df, 30, 0]
      );
    }
    periodStart = addDays(periodEnd, 1);
  }
}

export async function listFerias(params: { tenantId: number; employeeId: number }): Promise<FuncFeriasRow[]> {
  await ensureFeriasPeriods(params);
  const rows = await qAll(
    `SELECT * FROM func_ferias WHERE tenant_id=? AND funcionario_id=? ORDER BY data_inicio_aquisitivo ASC, id ASC`,
    [params.tenantId, params.employeeId]
  );
  return rows as FuncFeriasRow[];
}

export function feriasSaldoResumo(rows: FuncFeriasRow[]): {
  dias_livres: number;
  pendentes_agendamento: number;
  em_andamento: number;
} {
  let dias_livres = 0;
  let pendentes = 0;
  let em_andamento = 0;
  for (const r of rows) {
    const disp = Math.max(0, Number(r.dias_disponiveis) || 0);
    const usados = Math.max(0, Number(r.dias_usados) || 0);
    const livre = Math.max(0, disp - usados);
    if (r.status === 'available' && livre > 0) dias_livres += livre;
    if (r.status === 'scheduled') pendentes++;
    if (r.status === 'in_progress') em_andamento++;
  }
  return { dias_livres, pendentes_agendamento: pendentes, em_andamento };
}

export async function countFeriasOverlap(params: {
  tenantId: number;
  excludeEmployeeId?: number;
  dataInicio: string;
  dataFim: string;
  maxConcurrent?: number;
}): Promise<{ count: number; alerta: boolean }> {
  const maxC = params.maxConcurrent ?? 3;
  const rows = await qAll<{ funcionario_id: number }>(
    `SELECT funcionario_id FROM func_ferias
     WHERE tenant_id=? AND status IN ('scheduled','in_progress')
       AND data_inicio_gozo IS NOT NULL AND data_fim_gozo IS NOT NULL
       AND data_inicio_gozo::date <= ?::date AND data_fim_gozo::date >= ?::date`,
    [params.tenantId, params.dataFim, params.dataInicio]
  );
  const set = new Set(rows.map((r) => r.funcionario_id));
  if (params.excludeEmployeeId != null) set.delete(params.excludeEmployeeId);
  const count = set.size;
  return { count, alerta: count >= maxC };
}

export type UpdateFeriasResult = { ok: true; row: FuncFeriasRow } | { ok: false; error: string };

export async function scheduleFerias(params: {
  tenantId: number;
  feriasId: number;
  dataInicioGozo: string;
  dataFimGozo: string;
}): Promise<UpdateFeriasResult> {
  const row = await q1<FuncFeriasRow>(
    'SELECT * FROM func_ferias WHERE id=? AND tenant_id=?',
    [params.feriasId, params.tenantId]
  );
  if (!row) return { ok: false, error: 'Período de férias não encontrado.' };
  if (row.status !== 'available') return { ok: false, error: 'Só é possível agendar períodos disponíveis.' };
  const ini = parseISODate(params.dataInicioGozo);
  const fim = parseISODate(params.dataFimGozo);
  if (!ini || !fim || fim < ini) return { ok: false, error: 'Datas de gozo inválidas.' };
  const dias = daysBetweenInclusive(params.dataInicioGozo, params.dataFimGozo);
  const disp = Math.max(0, Number(row.dias_disponiveis) || 0);
  const usados = Math.max(0, Number(row.dias_usados) || 0);
  if (dias > disp - usados) return { ok: false, error: 'Dias de gozo excedem o saldo deste período.' };

  await qRun(
    `UPDATE func_ferias SET status='scheduled', data_inicio_gozo=?, data_fim_gozo=?, dias_usados=?
     WHERE id=? AND tenant_id=?`,
    [params.dataInicioGozo, params.dataFimGozo, usados + dias, params.feriasId, params.tenantId]
  );
  const updated = await q1<FuncFeriasRow>('SELECT * FROM func_ferias WHERE id=? AND tenant_id=?', [
    params.feriasId,
    params.tenantId,
  ]);
  if (!updated) return { ok: false, error: 'Falha ao recarregar.' };
  return { ok: true, row: updated };
}

export async function startFerias(params: { tenantId: number; feriasId: number }): Promise<UpdateFeriasResult> {
  const row = await q1<FuncFeriasRow>(
    'SELECT * FROM func_ferias WHERE id=? AND tenant_id=?',
    [params.feriasId, params.tenantId]
  );
  if (!row) return { ok: false, error: 'Período não encontrado.' };
  if (row.status !== 'scheduled') return { ok: false, error: 'Inicie apenas férias já agendadas.' };
  await qRun(`UPDATE func_ferias SET status='in_progress' WHERE id=? AND tenant_id=?`, [
    params.feriasId,
    params.tenantId,
  ]);
  const updated = await q1<FuncFeriasRow>('SELECT * FROM func_ferias WHERE id=? AND tenant_id=?', [
    params.feriasId,
    params.tenantId,
  ]);
  if (!updated) return { ok: false, error: 'Falha ao recarregar.' };
  return { ok: true, row: updated };
}

export async function completeFerias(params: {
  tenantId: number;
  feriasId: number;
  valorPago: number;
}): Promise<UpdateFeriasResult> {
  const row = await q1<FuncFeriasRow>(
    'SELECT * FROM func_ferias WHERE id=? AND tenant_id=?',
    [params.feriasId, params.tenantId]
  );
  if (!row) return { ok: false, error: 'Período não encontrado.' };
  if (row.status !== 'in_progress' && row.status !== 'scheduled') {
    return { ok: false, error: 'Concluir apenas férias agendadas ou em andamento.' };
  }
  const val = roundMoney(Number(params.valorPago) || 0);
  if (val < 0) return { ok: false, error: 'Valor inválido.' };
  await qRun(
    `UPDATE func_ferias SET status='completed', valor_pago=? WHERE id=? AND tenant_id=?`,
    [val, params.feriasId, params.tenantId]
  );
  const updated = await q1<FuncFeriasRow>('SELECT * FROM func_ferias WHERE id=? AND tenant_id=?', [
    params.feriasId,
    params.tenantId,
  ]);
  if (!updated) return { ok: false, error: 'Falha ao recarregar.' };
  return { ok: true, row: updated };
}

export async function ensureDecimoRow(params: {
  tenantId: number;
  employeeId: number;
  ano: number;
}): Promise<FuncDecimoRow | null> {
  const func = await q1<{ salario_base: number; data_admissao: string | null; tipo_contrato: string | null }>(
    'SELECT salario_base, data_admissao, tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  if (!func) return null;
  const tipo = normalizeTipoContrato(func.tipo_contrato);
  if (!usesAutoDecimoTerceiro(tipo)) {
    return await q1<FuncDecimoRow>(
      'SELECT * FROM func_decimo_terceiro WHERE tenant_id=? AND funcionario_id=? AND ano=?',
      [params.tenantId, params.employeeId, params.ano]
    );
  }
  const meses = mesesTrabalhadosNoAno(func.data_admissao, params.ano);
  const sal = roundMoney(Number(func.salario_base) || 0);
  const total = roundMoney((sal / 12) * meses);
  const p1 = roundMoney(total / 2);
  const p2 = roundMoney(total - p1);

  let row = await q1<FuncDecimoRow>(
    'SELECT * FROM func_decimo_terceiro WHERE tenant_id=? AND funcionario_id=? AND ano=?',
    [params.tenantId, params.employeeId, params.ano]
  );
  if (!row) {
    const id = await qInsert(
      `INSERT INTO func_decimo_terceiro
        (tenant_id, funcionario_id, ano, meses_trabalhados, valor_total, valor_primeira_parcela, valor_segunda_parcela, pago_primeira, pago_segunda)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [params.tenantId, params.employeeId, params.ano, meses, total, p1, p2, 0, 0]
    );
    if (id == null) return null;
    row = await q1<FuncDecimoRow>('SELECT * FROM func_decimo_terceiro WHERE id=? AND tenant_id=?', [
      id,
      params.tenantId,
    ]);
  } else {
    await qRun(
      `UPDATE func_decimo_terceiro SET meses_trabalhados=?, valor_total=?, valor_primeira_parcela=?, valor_segunda_parcela=?
       WHERE id=? AND tenant_id=?`,
      [meses, total, p1, p2, row.id, params.tenantId]
    );
    row = await q1<FuncDecimoRow>('SELECT * FROM func_decimo_terceiro WHERE id=? AND tenant_id=?', [
      row.id,
      params.tenantId,
    ]);
  }
  return row;
}

export async function payDecimoParcela(params: {
  tenantId: number;
  decimoId: number;
  parcela: 1 | 2;
}): Promise<{ ok: true; row: FuncDecimoRow } | { ok: false; error: string }> {
  const row = await q1<FuncDecimoRow>(
    'SELECT * FROM func_decimo_terceiro WHERE id=? AND tenant_id=?',
    [params.decimoId, params.tenantId]
  );
  if (!row) return { ok: false, error: 'Registro não encontrado.' };
  const hoje = todayISO();
  if (params.parcela === 1) {
    if (row.pago_primeira) return { ok: false, error: '1ª parcela já registrada.' };
    await qRun(
      `UPDATE func_decimo_terceiro SET pago_primeira=1, primeira_pago_em=? WHERE id=? AND tenant_id=?`,
      [hoje, params.decimoId, params.tenantId]
    );
  } else {
    if (!row.pago_primeira) return { ok: false, error: 'Registre a 1ª parcela antes da 2ª.' };
    if (row.pago_segunda) return { ok: false, error: '2ª parcela já registrada.' };
    await qRun(
      `UPDATE func_decimo_terceiro SET pago_segunda=1, segunda_pago_em=? WHERE id=? AND tenant_id=?`,
      [hoje, params.decimoId, params.tenantId]
    );
  }
  const updated = await q1<FuncDecimoRow>('SELECT * FROM func_decimo_terceiro WHERE id=? AND tenant_id=?', [
    params.decimoId,
    params.tenantId,
  ]);
  if (!updated) return { ok: false, error: 'Falha ao recarregar.' };
  return { ok: true, row: updated };
}

const BENEFICIO_TIPOS: BeneficioTipo[] = ['transporte', 'refeicao', 'ajuda_custo'];

export async function listBeneficios(params: { tenantId: number; employeeId: number }): Promise<FuncBeneficioRow[]> {
  const rows = await qAll(
    'SELECT * FROM func_beneficios WHERE tenant_id=? AND funcionario_id=? ORDER BY tipo ASC',
    [params.tenantId, params.employeeId]
  );
  return rows as FuncBeneficioRow[];
}

export async function upsertBeneficio(params: {
  tenantId: number;
  employeeId: number;
  tipo: string;
  valor: number;
  tipoValor: string;
  ativo: boolean;
  efeito: string;
}): Promise<FuncBeneficioRow | null> {
  if (!BENEFICIO_TIPOS.includes(params.tipo as BeneficioTipo)) return null;
  if (params.tipoValor !== 'fixo' && params.tipoValor !== 'percentual') return null;
  if (params.efeito !== 'acrescimo' && params.efeito !== 'desconto') return null;
  const val = roundMoney(Math.max(0, Number(params.valor) || 0));
  const existing = await q1<{ id: number }>(
    'SELECT id FROM func_beneficios WHERE tenant_id=? AND funcionario_id=? AND tipo=?',
    [params.tenantId, params.employeeId, params.tipo]
  );
  if (existing) {
    await qRun(
      `UPDATE func_beneficios SET valor=?, tipo_valor=?, ativo=?, efeito=? WHERE id=? AND tenant_id=?`,
      [val, params.tipoValor, params.ativo ? 1 : 0, params.efeito, existing.id, params.tenantId]
    );
  } else {
    await qInsert(
      `INSERT INTO func_beneficios (tenant_id, funcionario_id, tipo, valor, tipo_valor, ativo, efeito)
       VALUES (?,?,?,?,?,?,?)`,
      [params.tenantId, params.employeeId, params.tipo, val, params.tipoValor, params.ativo ? 1 : 0, params.efeito]
    );
  }
  const row = await q1<FuncBeneficioRow>(
    'SELECT * FROM func_beneficios WHERE tenant_id=? AND funcionario_id=? AND tipo=?',
    [params.tenantId, params.employeeId, params.tipo]
  );
  return row;
}

export interface ComputedBenefitLine {
  tipo: string;
  label: string;
  amount: number;
  efeito: BeneficioEfeito;
}

export function computeBenefitAmounts(
  rows: FuncBeneficioRow[],
  salarioBase: number
): { creditos: ComputedBenefitLine[]; descontos: ComputedBenefitLine[] } {
  const creditos: ComputedBenefitLine[] = [];
  const descontos: ComputedBenefitLine[] = [];
  const labels: Record<string, string> = {
    transporte: 'Vale transporte (gerencial)',
    refeicao: 'Vale refeição (gerencial)',
    ajuda_custo: 'Ajuda de custo (gerencial)',
  };
  const sal = roundMoney(Number(salarioBase) || 0);
  for (const r of rows) {
    if (!r.ativo) continue;
    let amt = 0;
    if (r.tipo_valor === 'percentual') {
      amt = roundMoney(sal * (Math.max(0, Number(r.valor) || 0) / 100));
    } else {
      amt = roundMoney(Number(r.valor) || 0);
    }
    if (amt <= 0) continue;
    const line: ComputedBenefitLine = {
      tipo: r.tipo,
      label: labels[r.tipo] || r.tipo,
      amount: amt,
      efeito: r.efeito === 'desconto' ? 'desconto' : 'acrescimo',
    };
    if (line.efeito === 'desconto') descontos.push(line);
    else creditos.push(line);
  }
  return { creditos, descontos };
}

export interface ManagerialPayrollSupplement {
  informativos: { label: string; amount: number }[];
  benefit_credits: { label: string; amount: number }[];
  benefit_deductions: { label: string; amount: number }[];
  benefit_credit_total: number;
  benefit_deduction_total: number;
  net_adjusted: number;
}

export async function buildManagerialPayrollSupplement(params: {
  tenantId: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  baseNet: number;
  baseGross: number;
  baseDeductions: number;
}): Promise<ManagerialPayrollSupplement> {
  const tipoRow = await q1<{ tipo_contrato: string | null }>(
    'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  const tipo = normalizeTipoContrato(tipoRow?.tipo_contrato);
  if (!usesManagerialPayrollSupplement(tipo)) {
    const baseNet = roundMoney(params.baseNet);
    return {
      informativos: [],
      benefit_credits: [],
      benefit_deductions: [],
      benefit_credit_total: 0,
      benefit_deduction_total: 0,
      net_adjusted: baseNet,
    };
  }
  const { mm, yy } = (() => {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(params.startDate).trim());
    if (!m) return { yy: String(new Date().getFullYear()), mm: pad2(new Date().getMonth() + 1) };
    return { yy: m[1], mm: m[2] };
  })();
  const ano = Number(yy);

  const funcSal = await q1<{ salario_base: number }>(
    'SELECT salario_base FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  const salBase = roundMoney(Number(funcSal?.salario_base) || 0);

  const benefRows = await listBeneficios({ tenantId: params.tenantId, employeeId: params.employeeId });
  const { creditos, descontos } = computeBenefitAmounts(benefRows, salBase);

  const informativos: { label: string; amount: number }[] = [];

  const feriasRows = await qAll<FuncFeriasRow>(
    `SELECT * FROM func_ferias WHERE tenant_id=? AND funcionario_id=? AND status='completed' AND valor_pago > 0
     AND data_inicio_gozo IS NOT NULL AND data_fim_gozo IS NOT NULL
     AND data_inicio_gozo::date <= ?::date AND data_fim_gozo::date >= ?::date`,
    [params.tenantId, params.employeeId, params.endDate, params.startDate]
  );
  for (const f of feriasRows) {
    informativos.push({
      label: `Férias (gozo ${f.data_inicio_gozo} a ${f.data_fim_gozo})`,
      amount: roundMoney(Number(f.valor_pago) || 0),
    });
  }

  await ensureDecimoRow({ tenantId: params.tenantId, employeeId: params.employeeId, ano });
  const decimo = await q1<FuncDecimoRow>(
    'SELECT * FROM func_decimo_terceiro WHERE tenant_id=? AND funcionario_id=? AND ano=?',
    [params.tenantId, params.employeeId, ano]
  );
  if (decimo) {
    if (decimo.pago_primeira && decimo.primeira_pago_em) {
      const pm = decimo.primeira_pago_em.slice(0, 7);
      if (pm === `${yy}-${mm}`) {
        informativos.push({ label: '13º — 1ª parcela (gerencial)', amount: roundMoney(decimo.valor_primeira_parcela) });
      }
    }
    if (decimo.pago_segunda && decimo.segunda_pago_em) {
      const pm = decimo.segunda_pago_em.slice(0, 7);
      if (pm === `${yy}-${mm}`) {
        informativos.push({ label: '13º — 2ª parcela (gerencial)', amount: roundMoney(decimo.valor_segunda_parcela) });
      }
    }
  }

  const bc = creditos.map((c) => ({ label: c.label, amount: c.amount }));
  const bd = descontos.map((d) => ({ label: d.label, amount: d.amount }));
  const benefit_credit_total = roundMoney(bc.reduce((s, x) => s + x.amount, 0));
  const benefit_deduction_total = roundMoney(bd.reduce((s, x) => s + x.amount, 0));
  const baseNet = roundMoney(params.baseNet);
  const net_adjusted = roundMoney(baseNet + benefit_credit_total - benefit_deduction_total);

  return {
    informativos,
    benefit_credits: bc,
    benefit_deductions: bd,
    benefit_credit_total,
    benefit_deduction_total,
    net_adjusted,
  };
}

export type RhAlertSeverity = 'ok' | 'attention' | 'urgent';

export interface RhAlertItem {
  id: string;
  severity: RhAlertSeverity;
  titulo: string;
  detalhe: string;
  funcionario_id?: number;
  funcionario_nome?: string;
}

const BANK_HIGH_MIN = 600;

export async function buildRhAlerts(params: { tenantId: number }): Promise<RhAlertItem[]> {
  const {
    calculatePayroll,
    computePayrollPaymentSummary,
    getPayrollPaymentHistory,
    getEmployeeHourBankSummary,
  } = await import('./payrollService');

  const alerts: RhAlertItem[] = [];
  const funcs = await qAll<{
    id: number;
    nome: string;
    data_admissao: string | null;
    status: string;
    tipo_contrato: string | null;
  }>(
    `SELECT id, nome, data_admissao, status, tipo_contrato FROM funcionarios WHERE tenant_id=? AND status='ativo' ORDER BY nome`,
    [params.tenantId]
  );

  const hoje = todayISO();
  const todayD = parseISODate(hoje)!;

  for (const f of funcs) {
    const tipoF = normalizeTipoContrato(f.tipo_contrato);
    if (usesAutoFeriasPeriods(tipoF)) {
      await ensureFeriasPeriods({ tenantId: params.tenantId, employeeId: f.id });
    }
    if (isFixo(tipoF)) {
      const ferias = await qAll<FuncFeriasRow>(
        `SELECT * FROM func_ferias WHERE tenant_id=? AND funcionario_id=?`,
        [params.tenantId, f.id]
      );
      for (const row of ferias) {
        if (row.status !== 'available' || (Number(row.dias_disponiveis) || 0) <= (Number(row.dias_usados) || 0)) {
          continue;
        }
        const fimAq = parseISODate(row.data_fim_aquisitivo);
        if (!fimAq) continue;
        const limite = addMonths(fimAq, 12);
        const diasRest = Math.floor((limite.getTime() - todayD.getTime()) / 86400000);
        if (diasRest < 0) {
          alerts.push({
            id: `ferias-vencida-${row.id}`,
            severity: 'urgent',
            titulo: 'Férias vencidas (gerencial)',
            detalhe: `${f.nome}: período aquisitivo encerrado; saldo de dias ainda não quitado no sistema.`,
            funcionario_id: f.id,
            funcionario_nome: f.nome,
          });
        } else if (diasRest <= 60) {
          alerts.push({
            id: `ferias-vencer-${row.id}`,
            severity: 'attention',
            titulo: 'Férias próximas do limite',
            detalhe: `${f.nome}: em ~${diasRest} dia(s) atinge 12 meses após o fim do período aquisitivo (controle gerencial).`,
            funcionario_id: f.id,
            funcionario_nome: f.nome,
          });
        }
      }
    }

    const ano = todayD.getFullYear();
    const dec = usesAutoDecimoTerceiro(tipoF)
      ? await ensureDecimoRow({ tenantId: params.tenantId, employeeId: f.id, ano })
      : null;
    if (dec && roundMoney(Number(dec.valor_total) || 0) > 0) {
      const falta = (!dec.pago_primeira ? 1 : 0) + (!dec.pago_segunda ? 1 : 0);
      if (falta === 2 && ano === todayD.getFullYear() && todayD.getMonth() >= 10) {
        alerts.push({
          id: `decimo-${f.id}-${ano}`,
          severity: 'attention',
          titulo: '13º com parcelas pendentes',
          detalhe: `${f.nome}: ano ${ano} — registrar pagamentos no módulo gerencial.`,
          funcionario_id: f.id,
          funcionario_nome: f.nome,
        });
      } else if (falta > 0 && todayD.getMonth() === 11) {
        alerts.push({
          id: `decimo-urg-${f.id}-${ano}`,
          severity: 'urgent',
          titulo: '13º incompleto (fim de ano)',
          detalhe: `${f.nome}: ainda há parcela(s) de 13º não marcada(s) como pagas.`,
          funcionario_id: f.id,
          funcionario_nome: f.nome,
        });
      }
    }

    const startDate = `${todayD.getFullYear()}-${pad2(todayD.getMonth() + 1)}-01`;
    const lastDay = new Date(todayD.getFullYear(), todayD.getMonth() + 1, 0).getDate();
    const endDate = `${todayD.getFullYear()}-${pad2(todayD.getMonth() + 1)}-${pad2(lastDay)}`;
    const payroll = await calculatePayroll({
      tenantId: params.tenantId,
      employeeId: f.id,
      startDate,
      endDate,
    });
    if (payroll && !isEvento(tipoF) && !payroll.pagamentos_sem_teto_folha) {
      const ref = payroll.competencia.referencia;
      const payments = await getPayrollPaymentHistory({
        tenantId: params.tenantId,
        employeeId: f.id,
        referencia: ref,
      });
      const sum = computePayrollPaymentSummary(payroll.totals.net, payments);
      if (sum.status !== 'paid' && sum.net_liquid > 0.02) {
        alerts.push({
          id: `folha-pendente-${f.id}-${ref}`,
          severity: sum.status === 'partial' ? 'attention' : 'urgent',
          titulo: sum.status === 'partial' ? 'Folha parcialmente paga' : 'Folha do mês em aberto',
          detalhe: `${f.nome}: saldo R$ ${sum.balance_due.toFixed(2)} (${ref}).`,
          funcionario_id: f.id,
          funcionario_nome: f.nome,
        });
      }
    }

    if (isFixo(tipoF)) {
      const banco = await getEmployeeHourBankSummary({
        tenantId: params.tenantId,
        employeeId: f.id,
      });
      if (banco.saldo_minutos >= BANK_HIGH_MIN) {
        alerts.push({
          id: `banco-alto-${f.id}`,
          severity: 'attention',
          titulo: 'Banco de horas elevado',
          detalhe: `${f.nome}: saldo ${banco.saldo_minutos} min (~${(banco.saldo_minutos / 60).toFixed(1)} h).`,
          funcionario_id: f.id,
          funcionario_nome: f.nome,
        });
      }
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'rh-ok',
      severity: 'ok',
      titulo: 'Nenhum alerta crítico',
      detalhe: 'Revise periodicamente férias, 13º e folhas do mês.',
    });
  }

  return alerts;
}
