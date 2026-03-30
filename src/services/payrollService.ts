// src/services/payrollService.ts — Cálculo centralizado da folha (fonte da verdade)
import type { PoolClient } from 'pg';
import { q1, qAll, qInsert, qRun, withTx, txInsert, txQuery } from '../db';
import { generatePayrollPdf as generatePayrollPdfHtml } from '../utils/payrollPdfHtml';
import { buildManagerialPayrollSupplement } from './hrManagerialService';
import {
  type TipoContrato,
  hourBankApplicable,
  isDiarista,
  isEvento,
  normalizeTipoContrato,
  usesManagerialPayrollSupplement,
  usesTraditionalMonthlyPayroll,
} from './employeeContract';

export { generatePayrollPdfHtml as generatePayrollPdf };

const TZ = 'America/Sao_Paulo';

export type PayrollEarningType = 'salary' | 'overtime';
export type PayrollDeductionType = 'inss' | 'absences' | 'late' | 'partial_absence' | 'advances';

export interface PayrollLine {
  type: PayrollEarningType | PayrollDeductionType;
  label: string;
  amount: number;
}

export interface PayrollTotals {
  gross: number;
  deductions: number;
  net: number;
  /** Líquido após benefícios gerenciais (crédito/desconto); não altera validação de pagamentos da Etapa 2 */
  net_gerencial?: number;
}

export interface PayrollStructured {
  base_salary: number;
  earnings: PayrollLine[];
  deductions: PayrollLine[];
  totals: PayrollTotals;
}

export interface PayrollCompetencia {
  referencia: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
}

export interface CalculatePayrollParams {
  tenantId: number;
  employeeId: number;
  startDate: string;
  endDate: string;
}

export type PayrollPaymentType = 'advance' | 'partial_payment' | 'final_payment';
export type PayrollSheetStatus = 'pending' | 'partial' | 'paid';

export interface FuncPagamentoFolhaRow {
  id: number;
  tenant_id: number;
  funcionario_id: number;
  referencia: string;
  tipo: string;
  valor: number;
  observacao: string | null;
  created_at: string;
  created_by: string | null;
  recibo_numero: string | null;
  metadata_json: string | null;
  despesas_id: number | null;
}

export interface PayrollPaymentSummary {
  /** Líquido da folha (não negativo; espelha o que a UI usa como “a pagar”) */
  net_liquid: number;
  total_paid: number;
  balance_due: number;
  status: PayrollSheetStatus;
  /** Contrato por evento: pagamentos avulsos sem teto da folha mensal */
  unbounded?: boolean;
}

export interface ContractPayrollProfile {
  tipo: TipoContrato;
  /** Folha mensal com descontos estilo CLT (fixo) */
  folha_tradicional: boolean;
}

export interface ManagerialSupplementApi {
  informativos: { label: string; amount: number }[];
  benefit_credits: { label: string; amount: number }[];
  benefit_deductions: { label: string; amount: number }[];
  benefit_credit_total: number;
  benefit_deduction_total: number;
  net_adjusted: number;
}

export interface CalculatePayrollResult extends PayrollStructured {
  competencia: PayrollCompetencia;
  managerial?: ManagerialSupplementApi;
  contract_profile: ContractPayrollProfile;
  /** Contrato por evento: competência só para agrupar pagamentos/recibos */
  pagamentos_sem_teto_folha?: boolean;
  /** Campos legados (mesmos nomes que o frontend já consome) */
  legacy: {
    funcionario: Record<string, unknown>;
    mes: string;
    salarioBruto: number;
    totalFaltas: number;
    descontoFaltas: number;
    totalAtrasoMin: number;
    descontoAtrasos: number;
    horasAusentesParcial: number;
    descontoParcial: number;
    inss: number;
    totalAdiantamentos: number;
    adiantamentos: unknown[];
    /** Lançamentos em func_adiantamentos do mês que não entram no total porque há adiantamento em Pagamentos (evita duplicidade). */
    adiantamentos_legado_nao_contabilizados?: unknown[];
    totalExtraMin: number;
    /** Minutos de HE pagos em dinheiro na folha (≤ totalExtraMin) */
    totalExtraMinPago: number;
    /** Minutos do mês destinados ao banco (via lançamento HE) */
    totalExtraMinBancoMes: number;
    /** Minutos convertidos do banco para provento financeiro nesta competência */
    totalBancoConvertidoFolhaMin: number;
    valorExtras: number;
    valorBancoConvertidoFolha: number;
    totalDescontos: number;
    salarioLiquido: number;
  };
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Minutos de HE que entram na folha em dinheiro.
 * NULL em minutos_pago_folha = 100% na folha (legado / registros antigos antes do destino explícito na API).
 * Preferir sempre gravar minutos_pago_folha (0…total) em novos lançamentos.
 */
export function extraMinutesForPayrollRow(row: { minutos?: number; minutos_pago_folha?: number | null }): number {
  const total = Math.max(0, Number(row.minutos) || 0);
  const pago = row.minutos_pago_folha;
  if (pago == null) return total;
  const n = Math.max(0, Math.floor(Number(pago)));
  return Math.min(total, n);
}

export type HourBankMovTipo = 'credit' | 'debit' | 'manual_adjust' | 'converted_to_payroll';
export type HourBankMovOrigem = 'espelho' | 'folha' | 'manual' | 'compensacao';

export interface FuncBancoHorasMovRow {
  id: number;
  tenant_id: number;
  funcionario_id: number;
  data_referencia: string;
  tipo: string;
  minutos: number;
  origem: string;
  observacao: string | null;
  created_at: string;
  created_by: string | null;
  metadata_json: string | null;
}

export interface EmployeeHourBankSummary {
  saldo_minutos: number;
}

export interface HourBankPayrollConversionSummary {
  minutos_convertidos_folha: number;
}

function mergeBankMovementMetadata(
  currentJson: string | null,
  patch: Record<string, string | number | boolean | null>
): string {
  let base: Record<string, unknown> = {};
  if (currentJson) {
    try {
      const parsed = JSON.parse(currentJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      base = {};
    }
  }
  return JSON.stringify({ ...base, ...patch });
}
const META_PAYROLL_REFERENCE_KEY = 'competencia_referencia';

function hourBankSignedDelta(tipo: string, minutos: number): number {
  const m = Math.trunc(Number(minutos) || 0);
  switch (tipo) {
    case 'credit':
      return Math.abs(m);
    case 'debit':
    case 'converted_to_payroll':
      return -Math.abs(m);
    case 'manual_adjust':
      return m;
    default:
      return 0;
  }
}

export async function getEmployeeHourBankSummary(params: {
  tenantId: number;
  employeeId: number;
}): Promise<EmployeeHourBankSummary> {
  const rows = await qAll<{ tipo: string; minutos: number }>(
    `SELECT tipo, minutos FROM func_banco_horas_mov
     WHERE tenant_id=? AND funcionario_id=?`,
    [params.tenantId, params.employeeId]
  );
  let saldo = 0;
  for (const r of rows) {
    saldo += hourBankSignedDelta(r.tipo, r.minutos);
  }
  return { saldo_minutos: saldo };
}

export async function getHourBankPayrollConversionSummary(params: {
  tenantId: number;
  employeeId: number;
  month: string;
  year: string;
}): Promise<HourBankPayrollConversionSummary> {
  const referencia = `${String(params.month).padStart(2, '0')}/${String(params.year)}`;
  const rows = await qAll<{ minutos: number }>(
    `SELECT minutos FROM func_banco_horas_mov
     WHERE tenant_id=? AND funcionario_id=? AND tipo='converted_to_payroll'
       AND (
         (metadata_json IS NOT NULL AND metadata_json::jsonb->>? = ?)
         OR (
           (metadata_json IS NULL OR metadata_json::jsonb->>? IS NULL)
           AND TO_CHAR(data_referencia::date,'MM')=?
           AND TO_CHAR(data_referencia::date,'YYYY')=?
         )
       )`,
    [
      params.tenantId,
      params.employeeId,
      META_PAYROLL_REFERENCE_KEY,
      referencia,
      META_PAYROLL_REFERENCE_KEY,
      String(params.month).padStart(2, '0'),
      String(params.year),
    ]
  );
  const minutos_convertidos_folha = rows.reduce((acc, curr) => acc + Math.abs(Math.trunc(Number(curr.minutos) || 0)), 0);
  return { minutos_convertidos_folha };
}

export async function listHourBankMovements(params: {
  tenantId: number;
  employeeId: number;
  month?: string;
  year?: string;
  payrollReference?: string;
  limit?: number;
}): Promise<FuncBancoHorasMovRow[]> {
  let q = `SELECT * FROM func_banco_horas_mov WHERE tenant_id=? AND funcionario_id=?`;
  const p: unknown[] = [params.tenantId, params.employeeId];
  if (params.month != null && params.year != null) {
    const mm = String(params.month).padStart(2, '0');
    const yy = String(params.year);
    if (params.payrollReference) {
      q += ` AND (
        (
          tipo='converted_to_payroll'
          AND (
            (metadata_json IS NOT NULL AND metadata_json::jsonb->>? = ?)
            OR (
              (metadata_json IS NULL OR metadata_json::jsonb->>? IS NULL)
              AND TO_CHAR(data_referencia::date,'MM')=?
              AND TO_CHAR(data_referencia::date,'YYYY')=?
            )
          )
        )
        OR (
          tipo<>'converted_to_payroll'
          AND TO_CHAR(data_referencia::date,'MM')=?
          AND TO_CHAR(data_referencia::date,'YYYY')=?
        )
      )`;
      p.push(
        META_PAYROLL_REFERENCE_KEY,
        params.payrollReference,
        META_PAYROLL_REFERENCE_KEY,
        mm,
        yy,
        mm,
        yy
      );
    } else {
      q += ` AND TO_CHAR(data_referencia::date,'MM')=? AND TO_CHAR(data_referencia::date,'YYYY')=?`;
      p.push(mm, yy);
    }
  }
  q += ` ORDER BY created_at DESC, id DESC`;
  if (params.limit != null && params.limit > 0) {
    q += ` LIMIT ?`;
    p.push(params.limit);
  }
  return (await qAll(q, p)) as FuncBancoHorasMovRow[];
}

export type AddHourBankMovementResult =
  | { ok: true; mov: FuncBancoHorasMovRow }
  | { ok: false; error: string };

function assertHourBankTipo(t: string): t is HourBankMovTipo {
  return t === 'credit' || t === 'debit' || t === 'manual_adjust' || t === 'converted_to_payroll';
}

function assertHourBankOrigem(o: string): o is HourBankMovOrigem {
  return o === 'espelho' || o === 'folha' || o === 'manual' || o === 'compensacao';
}

export async function addHourBankMovement(params: {
  tenantId: number;
  employeeId: number;
  dataReferencia: string;
  tipo: string;
  minutos: number;
  origem: string;
  observacao?: string | null;
  createdBy: string | null;
  metadataJson?: string | null;
  payrollReference?: string | null;
}): Promise<AddHourBankMovementResult> {
  const fc = await q1<{ tipo_contrato: string | null }>(
    'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  const t = normalizeTipoContrato(fc?.tipo_contrato);
  if (!hourBankApplicable(t)) {
    return { ok: false, error: 'Banco de horas não se aplica a este tipo de contrato (evento).' };
  }
  if (!assertHourBankTipo(params.tipo)) {
    return { ok: false, error: 'Tipo inválido (credit, debit, manual_adjust, converted_to_payroll).' };
  }
  if (!assertHourBankOrigem(params.origem)) {
    return { ok: false, error: 'Origem inválida (espelho, folha, manual, compensacao).' };
  }
  const tipo = params.tipo;
  let minutos = Math.trunc(Number(params.minutos) || 0);
  if (tipo === 'converted_to_payroll' && params.origem !== 'folha') {
    return { ok: false, error: 'Conversão para folha deve usar origem folha.' };
  }
  if (tipo !== 'manual_adjust' && minutos === 0) {
    return { ok: false, error: 'Informe os minutos.' };
  }
  if (tipo !== 'manual_adjust' && minutos < 0) {
    return { ok: false, error: 'Minutos deve ser positivo para este tipo.' };
  }
  if (tipo === 'manual_adjust' && minutos === 0) {
    return { ok: false, error: 'Ajuste manual não pode ser zero.' };
  }

  const dataRef = String(params.dataReferencia || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
    return { ok: false, error: 'data_referencia inválida (use YYYY-MM-DD).' };
  }

  if (tipo === 'debit' || tipo === 'converted_to_payroll') {
    const { saldo_minutos } = await getEmployeeHourBankSummary({
      tenantId: params.tenantId,
      employeeId: params.employeeId,
    });
    if (saldo_minutos < Math.abs(minutos)) {
      return { ok: false, error: `Saldo insuficiente no banco (${saldo_minutos} min disponíveis).` };
    }
  }

  let metadataJson = params.metadataJson?.trim() || null;
  if (tipo === 'converted_to_payroll') {
    const fallbackReferencia = `${dataRef.slice(5, 7)}/${dataRef.slice(0, 4)}`;
    const payrollReference = String(params.payrollReference || fallbackReferencia).trim();
    if (!/^\d{2}\/\d{4}$/.test(payrollReference)) {
      return { ok: false, error: 'competencia_referencia invalida (use MM/AAAA).' };
    }
    metadataJson = mergeBankMovementMetadata(metadataJson, {
      [META_PAYROLL_REFERENCE_KEY]: payrollReference,
    });
  }

  const id = await qInsert(
    `INSERT INTO func_banco_horas_mov
      (tenant_id, funcionario_id, data_referencia, tipo, minutos, origem, observacao, created_by, metadata_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      params.tenantId,
      params.employeeId,
      dataRef,
      tipo,
      minutos,
      params.origem,
      params.observacao?.trim() || null,
      params.createdBy,
      metadataJson,
    ]
  );
  if (id == null) return { ok: false, error: 'Falha ao gravar movimentação.' };
  const mov = await q1('SELECT * FROM func_banco_horas_mov WHERE id=? AND tenant_id=?', [id, params.tenantId]);
  if (!mov) return { ok: false, error: 'Movimentação gravada mas não foi possível recarregar.' };
  return { ok: true, mov: mov as FuncBancoHorasMovRow };
}

const META_EXTRA_KEY = 'func_hora_extra_id';

export function buildHoraExtraBankMetadata(horaExtraId: number): string {
  return JSON.stringify({ [META_EXTRA_KEY]: horaExtraId });
}

export async function deleteHourBankMovementsLinkedToHoraExtra(params: {
  tenantId: number;
  employeeId: number;
  horaExtraId: number;
}): Promise<void> {
  await qRun(
    `DELETE FROM func_banco_horas_mov
     WHERE tenant_id=? AND funcionario_id=? AND tipo='credit' AND origem='espelho'
       AND metadata_json IS NOT NULL
       AND (metadata_json::jsonb->>?)::int=?`,
    [params.tenantId, params.employeeId, META_EXTRA_KEY, params.horaExtraId]
  );
}

/** Garante um crédito automático coerente com o lançamento de HE (diferença vai ao banco). */
export async function syncBankCreditFromHoraExtra(params: {
  tenantId: number;
  employeeId: number;
  horaExtraId: number;
  data: string;
  minutos: number;
  minutosPagoFolha: number | null | undefined;
  createdBy: string | null;
}): Promise<void> {
  const fc = await q1<{ tipo_contrato: string | null }>(
    'SELECT tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  if (!hourBankApplicable(normalizeTipoContrato(fc?.tipo_contrato))) {
    return;
  }
  await deleteHourBankMovementsLinkedToHoraExtra({
    tenantId: params.tenantId,
    employeeId: params.employeeId,
    horaExtraId: params.horaExtraId,
  });
  const total = Math.max(0, Math.floor(Number(params.minutos) || 0));
  const pago = extraMinutesForPayrollRow({
    minutos: total,
    minutos_pago_folha: params.minutosPagoFolha,
  });
  const banco = Math.max(0, total - pago);
  if (banco <= 0) return;
  await qRun(
    `INSERT INTO func_banco_horas_mov
      (tenant_id, funcionario_id, data_referencia, tipo, minutos, origem, observacao, created_by, metadata_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      params.tenantId,
      params.employeeId,
      String(params.data).trim(),
      'credit',
      banco,
      'espelho',
      'Crédito automático (hora extra → banco)',
      params.createdBy,
      buildHoraExtraBankMetadata(params.horaExtraId),
    ]
  );
}

function parseMonthYearFromStartDate(startDate: string): { mm: string; yy: string } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(startDate).trim());
  if (!m) {
    const d = new Date();
    return {
      mm: String(d.getMonth() + 1).padStart(2, '0'),
      yy: String(d.getFullYear()),
    };
  }
  return { yy: m[1], mm: m[2] };
}

function competenciaFromMonthYear(mm: string, yy: string): PayrollCompetencia {
  const last = new Date(Number(yy), Number(mm), 0).getDate();
  return {
    referencia: `${mm}/${yy}`,
    start_date: `${yy}-${mm}-01`,
    end_date: `${yy}-${mm}-${String(last).padStart(2, '0')}`,
    status: 'open',
  };
}

export async function calculatePayroll(params: CalculatePayrollParams): Promise<CalculatePayrollResult | null> {
  const { tenantId, employeeId, startDate } = params;
  const { mm, yy } = parseMonthYearFromStartDate(startDate);
  const competencia = competenciaFromMonthYear(mm, yy);

  const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [employeeId, tenantId]);
  if (!func) return null;

  const tipo = normalizeTipoContrato((func as { tipo_contrato?: string | null }).tipo_contrato);

  if (isEvento(tipo)) {
    const baseRef = roundMoney(Number(func.salario_base) || 0);
    const adiantamentosMes = await qAll(
      `SELECT * FROM func_adiantamentos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data DESC, id DESC`,
      [func.id, tenantId, mm, yy]
    );
    const totalAdiantamentosPendentes = adiantamentosMes.reduce(
      (acc, curr) => acc + (Number((curr as { descontado?: number }).descontado) ? 0 : Number((curr as { valor?: unknown }).valor) || 0),
      0
    );
    const earnings: PayrollLine[] = [
      {
        type: 'salary',
        label: 'Valor de referência (contrato por evento — sem folha CLT mensal)',
        amount: baseRef,
      },
    ];
    return {
      base_salary: baseRef,
      earnings,
      deductions: [],
      totals: { gross: baseRef, deductions: 0, net: 0 },
      competencia,
      managerial: undefined,
      contract_profile: { tipo, folha_tradicional: false },
      pagamentos_sem_teto_folha: true,
      legacy: {
        funcionario: func,
        mes: `${mm}/${yy}`,
        salarioBruto: baseRef,
        totalFaltas: 0,
        descontoFaltas: 0,
        totalAtrasoMin: 0,
        descontoAtrasos: 0,
        horasAusentesParcial: 0,
        descontoParcial: 0,
        inss: 0,
        totalAdiantamentos: roundMoney(totalAdiantamentosPendentes),
        adiantamentos: adiantamentosMes,
        adiantamentos_legado_nao_contabilizados: undefined,
        totalExtraMin: 0,
        totalExtraMinPago: 0,
        totalExtraMinBancoMes: 0,
        valorExtras: 0,
        totalBancoConvertidoFolhaMin: 0,
        valorBancoConvertidoFolha: 0,
        totalDescontos: 0,
        salarioLiquido: 0,
      },
    };
  }

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const admissao = func.data_admissao || null;

  const pontos = await qAll(
    `SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`,
    [func.id, tenantId, mm, yy]
  );
  const eventos = await qAll(
    `SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`,
    [func.id, tenantId, mm, yy]
  );
  const extras = await qAll(
    `SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`,
    [func.id, tenantId, mm, yy]
  );
  const adiantamentosTabela = await qAll(
    `SELECT * FROM func_adiantamentos WHERE funcionario_id=? AND tenant_id=? AND descontado=0 AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data DESC, id DESC`,
    [func.id, tenantId, mm, yy]
  );
  const referenciaComp = competencia.referencia;
  const adiantamentosPagamento = await qAll(
    `SELECT * FROM func_pagamentos_folha WHERE tenant_id=? AND funcionario_id=? AND referencia=? AND tipo=? ORDER BY created_at ASC, id ASC`,
    [tenantId, func.id, referenciaComp, 'advance']
  );
  const adiantamentosFromPagamentos = (adiantamentosPagamento as FuncPagamentoFolhaRow[]).map((p) => {
    const created = p.created_at ? String(p.created_at).slice(0, 10) : '';
    return {
      id: p.id,
      valor: Number(p.valor) || 0,
      motivo:
        (p.observacao && String(p.observacao).trim()) ||
        'Adiantamento (registrado em Pagamentos da competência)',
      data: /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : competencia.end_date,
      descontado: 1,
      origem: 'pagamento_folha' as const,
    };
  });
  /** Fonte única para o total: preferir adiantamentos lançados em Pagamentos; senão tabela legada. */
  const sumPag = adiantamentosFromPagamentos.reduce((acc, a) => acc + (Number(a.valor) || 0), 0);
  const sumTab = (adiantamentosTabela as { valor?: unknown }[]).reduce(
    (acc, curr) => acc + (Number(curr.valor) || 0),
    0
  );
  const adiantamentosUsadosNoCalculo: unknown[] =
    sumPag > 0 ? adiantamentosFromPagamentos : adiantamentosTabela;
  const adiantamentosLegadoNaoSomados: unknown[] =
    sumPag > 0 && sumTab > 0 ? adiantamentosTabela : [];

  const pbd: Record<string, unknown[]> = {};
  const ebd: Record<string, unknown[]> = {};
  for (const p of pontos) {
    if (!pbd[p.data]) pbd[p.data] = [];
    pbd[p.data].push(p);
  }
  for (const e of eventos) {
    if (!ebd[e.data]) ebd[e.data] = [];
    ebd[e.data].push(e);
  }

  const diasNoMes = new Date(Number(yy), Number(mm), 0).getDate();
  const diasSemana = (func.dias_semana || '1,2,3,4,5').split(',').map(Number);
  const tolerancia = func.tolerancia_minutos || 10;
  const cargaHoras = func.carga_horaria || 8;
  const horEnt = func.horario_entrada || '08:00';

  let totalFaltas = 0;
  let totalAtrasos = 0;
  let horasAusentesParcial = 0;
  const totalExtraMin = extras.reduce((acc, curr) => acc + (Number(curr.minutos) || 0), 0);
  const totalExtraMinPago = extras.reduce((acc, curr) => acc + extraMinutesForPayrollRow(curr), 0);
  const totalExtraMinBancoMes = Math.max(0, totalExtraMin - totalExtraMinPago);
  const { minutos_convertidos_folha: totalBancoConvertidoFolhaMin } = hourBankApplicable(tipo)
    ? await getHourBankPayrollConversionSummary({
        tenantId,
        employeeId,
        month: mm,
        year: yy,
      })
    : { minutos_convertidos_folha: 0 };
  const totalAdiantamentos = adiantamentosUsadosNoCalculo.reduce<number>(
    (acc, curr) => acc + (Number((curr as { valor?: unknown }).valor) || 0),
    0
  );

  for (let d = 1; d <= diasNoMes; d++) {
    const dataStr = `${yy}-${mm}-${String(d).padStart(2, '0')}`;
    const diaSem = new Date(`${dataStr}T12:00:00`).getDay();
    const isExp = diasSemana.includes(diaSem);
    const evts = (ebd[dataStr] || []) as { tipo?: string; horas_ausentes?: number }[];
    const pts = (pbd[dataStr] || []) as { tipo?: string; hora?: string }[];
    const isFut = dataStr > hoje;
    const isAnt = admissao && dataStr < admissao;

    const parcial = evts.find((e) => e.tipo === 'declaracao_parcial');
    if (parcial) horasAusentesParcial += Number(parcial.horas_ausentes) || 0;

    if (!isFut && !isAnt && isExp && !evts.some((e) => ['folga', 'atestado'].includes(String(e.tipo)))) {
      const ent = pts.find((p) => p.tipo === 'entrada');
      if (ent) {
        const [eh, em] = horEnt.split(':').map(Number);
        const lim = eh * 60 + em + tolerancia;
        const [rh, rm] = String(ent.hora || '0:0').split(':').map(Number);
        const entMin = rh * 60 + rm;
        if (entMin > lim) totalAtrasos += entMin - (eh * 60 + em);
      } else {
        totalFaltas++;
      }
    }
  }

  const salarioBruto = roundMoney(Number(func.salario_base) || 0);
  const diasTrab = Number(func.dias_trabalho_mes) || 26;
  const valorDia = salarioBruto / diasTrab;
  const valorHora = valorDia / cargaHoras;

  const descontoFaltas = roundMoney(totalFaltas * valorDia);
  const descontoAtrasos = roundMoney((totalAtrasos / 60) * valorHora);
  const descontoParcial = roundMoney(horasAusentesParcial * valorHora);
  const valorExtras = roundMoney((totalExtraMinPago / 60) * (valorHora * 1.5));
  const valorBancoConvertidoFolha = roundMoney((totalBancoConvertidoFolhaMin / 60) * (valorHora * 1.5));
  const inss = isDiarista(tipo) ? 0 : roundMoney(salarioBruto * 0.11);

  const totalDescontos = roundMoney(descontoFaltas + descontoAtrasos + descontoParcial + inss + totalAdiantamentos);
  const salarioLiquido = roundMoney(salarioBruto + valorExtras + valorBancoConvertidoFolha - totalDescontos);

  const earnings: PayrollLine[] = [
    { type: 'salary', label: 'Salário Base', amount: salarioBruto },
  ];
  if (totalExtraMinPago > 0 && valorExtras > 0) {
    const heLabel =
      totalExtraMinPago === totalExtraMin
        ? `Horas Extras (${totalExtraMin} min · 50% CLT)`
        : `Horas Extras pagas (${totalExtraMinPago}/${totalExtraMin} min · 50% CLT)`;
    earnings.push({
      type: 'overtime',
      label: heLabel,
      amount: valorExtras,
    });
  }
  if (totalBancoConvertidoFolhaMin > 0 && valorBancoConvertidoFolha > 0) {
    earnings.push({
      type: 'overtime',
      label: `Banco de horas convertido para folha (${totalBancoConvertidoFolhaMin} min · 50% CLT)`,
      amount: valorBancoConvertidoFolha,
    });
  }

  const deductions: PayrollLine[] = [];
  if (!isDiarista(tipo)) {
    deductions.push({ type: 'inss', label: 'INSS (estimado)', amount: inss });
  }
  deductions.push(
    {
      type: 'absences',
      label: `Faltas (${totalFaltas} dia${totalFaltas !== 1 ? 's' : ''})`,
      amount: descontoFaltas,
    },
    { type: 'late', label: `Atrasos (${totalAtrasos} min)`, amount: descontoAtrasos }
  );
  if (descontoParcial > 0) {
    deductions.push({
      type: 'partial_absence',
      label: `Ausência parcial (${horasAusentesParcial} h)`,
      amount: descontoParcial,
    });
  }
  if (totalAdiantamentos > 0) {
    deductions.push({
      type: 'advances',
      label: `Adiantamentos (${adiantamentosUsadosNoCalculo.length})`,
      amount: roundMoney(totalAdiantamentos),
    });
  }

  const gross = roundMoney(earnings.reduce((s, e) => s + e.amount, 0));
  const deductionsTotal = roundMoney(deductions.reduce((s, d) => s + d.amount, 0));
  const totals: PayrollTotals = {
    gross,
    deductions: deductionsTotal,
    net: salarioLiquido,
  };

  let managerial: ManagerialSupplementApi | undefined;
  if (usesManagerialPayrollSupplement(tipo)) {
    try {
      const sup = await buildManagerialPayrollSupplement({
        tenantId,
        employeeId,
        startDate: params.startDate,
        endDate: params.endDate,
        baseNet: salarioLiquido,
        baseGross: gross,
        baseDeductions: deductionsTotal,
      });
      managerial = {
        informativos: sup.informativos,
        benefit_credits: sup.benefit_credits,
        benefit_deductions: sup.benefit_deductions,
        benefit_credit_total: sup.benefit_credit_total,
        benefit_deduction_total: sup.benefit_deduction_total,
        net_adjusted: sup.net_adjusted,
      };
      totals.net_gerencial = sup.net_adjusted;
    } catch {
      managerial = undefined;
    }
  }

  return {
    base_salary: salarioBruto,
    earnings,
    deductions,
    totals,
    competencia,
    managerial,
    contract_profile: { tipo, folha_tradicional: usesTraditionalMonthlyPayroll(tipo) },
    legacy: {
      funcionario: func,
      mes: `${mm}/${yy}`,
      salarioBruto,
      totalFaltas,
      descontoFaltas,
      totalAtrasoMin: totalAtrasos,
      descontoAtrasos,
      horasAusentesParcial,
      descontoParcial,
      inss,
      totalAdiantamentos: roundMoney(totalAdiantamentos),
      adiantamentos: adiantamentosUsadosNoCalculo,
      adiantamentos_legado_nao_contabilizados:
        adiantamentosLegadoNaoSomados.length > 0 ? adiantamentosLegadoNaoSomados : undefined,
      totalExtraMin,
      totalExtraMinPago,
      totalExtraMinBancoMes,
      valorExtras,
      totalBancoConvertidoFolhaMin,
      valorBancoConvertidoFolha,
      totalDescontos,
      salarioLiquido,
    },
  };
}

const MONEY_EPS = 0.02;

/** Parcial + final quitam o líquido; adiantamento já está embutido no líquido como desconto. */
function payrollSettlementPaidTotal(payments: { valor: number; tipo?: string }[]): number {
  return roundMoney(
    payments.reduce((s, p) => {
      const t = String(p.tipo || '');
      if (t === 'partial_payment' || t === 'final_payment') return s + (Number(p.valor) || 0);
      return s;
    }, 0)
  );
}

export function computePayrollPaymentSummary(
  netFromPayroll: number,
  payments: { valor: number; tipo?: string }[],
  options?: { unbounded?: boolean }
): PayrollPaymentSummary {
  if (options?.unbounded) {
    const total_paid = roundMoney(payments.reduce((s, p) => s + (Number(p.valor) || 0), 0));
    return { net_liquid: 0, total_paid, balance_due: 0, status: 'pending', unbounded: true };
  }
  const net_liquid = roundMoney(Math.max(0, netFromPayroll));
  const total_paid = roundMoney(payments.reduce((s, p) => s + (Number(p.valor) || 0), 0));
  const paid_settlement = payrollSettlementPaidTotal(payments);
  const balance_due = roundMoney(Math.max(0, net_liquid - paid_settlement));
  let status: PayrollSheetStatus;
  if (balance_due <= MONEY_EPS) status = 'paid';
  else if (paid_settlement > MONEY_EPS) status = 'partial';
  else status = 'pending';
  return { net_liquid, total_paid, balance_due, status };
}

export async function getPayrollPaymentHistory(params: {
  tenantId: number;
  employeeId: number;
  referencia: string;
}): Promise<FuncPagamentoFolhaRow[]> {
  const rows = await qAll(
    `SELECT * FROM func_pagamentos_folha
     WHERE tenant_id=? AND funcionario_id=? AND referencia=?
     ORDER BY created_at ASC, id ASC`,
    [params.tenantId, params.employeeId, params.referencia]
  );
  return rows as FuncPagamentoFolhaRow[];
}

function paymentTipoLabel(t: PayrollPaymentType): string {
  if (t === 'advance') return 'Adiantamento';
  if (t === 'final_payment') return 'Pagamento final';
  return 'Pagamento parcial';
}

function assertValidPaymentTipo(t: string): t is PayrollPaymentType {
  return t === 'advance' || t === 'partial_payment' || t === 'final_payment';
}

export type RegisterPayrollPaymentResult =
  | { ok: true; payment: FuncPagamentoFolhaRow }
  | { ok: false; error: string };

export async function registerPayrollPayment(params: {
  tenantId: number;
  employeeId: number;
  month: string;
  year: string;
  tipo: string;
  valor: number;
  observacao?: string | null;
  createdBy: string | null;
}): Promise<RegisterPayrollPaymentResult> {
  if (!assertValidPaymentTipo(params.tipo)) {
    return { ok: false, error: 'Tipo inválido. Use advance, partial_payment ou final_payment.' };
  }
  const tipoPag = params.tipo;
  const mm = String(params.month).padStart(2, '0');
  const yy = String(params.year);
  const startDate = `${yy}-${mm}-01`;
  const lastDay = new Date(Number(yy), Number(mm), 0).getDate();
  const endDate = `${yy}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const funcRow = await q1<{ id: number; tipo_contrato: string | null }>(
    'SELECT id, tipo_contrato FROM funcionarios WHERE id=? AND tenant_id=?',
    [params.employeeId, params.tenantId]
  );
  if (!funcRow) return { ok: false, error: 'Funcionário não encontrado' };
  const tipoEmp = normalizeTipoContrato(funcRow.tipo_contrato);

  const computed = await calculatePayroll({
    tenantId: params.tenantId,
    employeeId: params.employeeId,
    startDate,
    endDate,
  });
  if (!computed) return { ok: false, error: 'Funcionário não encontrado' };

  const referencia = computed.competencia.referencia;
  const history = await getPayrollPaymentHistory({
    tenantId: params.tenantId,
    employeeId: params.employeeId,
    referencia,
  });
  const val = roundMoney(Number(params.valor));
  if (!Number.isFinite(val) || val <= 0) return { ok: false, error: 'Valor inválido' };

  if (isEvento(tipoEmp)) {
    /* Pagamentos avulsos por competência, sem teto de folha mensal */
  } else {
    const netRaw = computed.totals.net_gerencial ?? computed.totals.net;
    const summaryBefore = computePayrollPaymentSummary(netRaw, history);
    const paidSettlementBefore = payrollSettlementPaidTotal(history);
    const balanceSettlement = roundMoney(Math.max(0, netRaw - paidSettlementBefore));
    if (tipoPag !== 'advance' && summaryBefore.net_liquid <= MONEY_EPS && val > 0) {
      return { ok: false, error: 'Não há valor líquido a pagar nesta competência.' };
    }
    if (tipoPag === 'final_payment') {
      if (Math.abs(val - balanceSettlement) > MONEY_EPS) {
        return {
          ok: false,
          error: `Pagamento final deve quitar o saldo (R$ ${balanceSettlement.toFixed(2)}).`,
        };
      }
    } else if (tipoPag === 'partial_payment') {
      if (val > balanceSettlement + MONEY_EPS) {
        return {
          ok: false,
          error: `Valor excede o saldo pendente (máx. R$ ${balanceSettlement.toFixed(2)}).`,
        };
      }
    }
    /* advance: já compõe o líquido como desconto; não consome saldo de parcial/final */
  }

  const func = computed.legacy.funcionario as { nome?: string };
  const nomeFunc = String(func?.nome || 'Funcionário');
  const desc = `Folha · ${nomeFunc} · ${referencia} · ${paymentTipoLabel(tipoPag)}`;

  const paymentId = await withTx(async (client: PoolClient) => {
    const despesasId = await txInsert(
      client,
      `INSERT INTO despesas (description, amount, category, tenant_id) VALUES (?,?,?,?)`,
      [desc, val, 'folha_pagamento', params.tenantId]
    );
    if (despesasId == null) throw new Error('Falha ao criar lançamento financeiro');

    const meta = JSON.stringify({
      funcionario_id: params.employeeId,
      referencia,
      tipo: tipoPag,
      despesas_id: Number(despesasId),
    });

    const pid = await txInsert(
      client,
      `INSERT INTO func_pagamentos_folha
        (tenant_id, funcionario_id, referencia, tipo, valor, observacao, created_by, recibo_numero, metadata_json, despesas_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        params.tenantId,
        params.employeeId,
        referencia,
        tipoPag,
        val,
        params.observacao?.trim() || null,
        params.createdBy,
        null,
        meta,
        Number(despesasId),
      ]
    );
    if (pid == null) throw new Error('Falha ao registrar pagamento');

    const recibo = `RHF-${pid}`;
    await txQuery(
      client,
      `UPDATE func_pagamentos_folha SET recibo_numero=? WHERE id=? AND tenant_id=?`,
      [recibo, pid, params.tenantId]
    );
    return Number(pid);
  });

  const payment = await q1(
    'SELECT * FROM func_pagamentos_folha WHERE id=? AND tenant_id=?',
    [paymentId, params.tenantId]
  );
  if (!payment) return { ok: false, error: 'Pagamento registrado mas não foi possível recarregar o registro.' };
  return { ok: true, payment: payment as FuncPagamentoFolhaRow };
}
