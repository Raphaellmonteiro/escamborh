/**
 * Validação de composição de produtos combo (grupos com itens do cardápio).
 * Usada pelo delivery, rotas admin e pode ser reutilizada no PDV.
 */
import { q1, qAll } from '../db';
import type { ComboPedidoInstancia, ComboPedidoPorGrupo } from '../types/comboOrder';
import { AppError, isAppError } from '../utils/errors';
import { validateProductOpcoesSelections } from './productOpcoesValidation';

export type { ComboPedidoInstancia, ComboPedidoPorGrupo };

/** grupoId → (productId do cardápio → quantidade) — formato legado / agregado */
export type ComboEscolhas = Record<number, Record<number, number>>;

const MAX_INSTANCIA_ID_LEN = 128;
const MAX_COMBO_INST_OBS_LEN = 4000;

function parseObservacaoInstancia(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.length > MAX_COMBO_INST_OBS_LEN ? t.slice(0, MAX_COMBO_INST_OBS_LEN) : t;
}

function isLegacyComboGrupoValor(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  for (const v of Object.values(val as Record<string, unknown>)) {
    if (typeof v === 'number') continue;
    if (typeof v === 'string' && String(v).trim() !== '' && Number.isFinite(Number(v))) continue;
    return false;
  }
  return true;
}

function parseInstanciaExtras(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = entry.extras;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('extras do item de combo invalido', 400);
  }
  return raw as Record<string, unknown>;
}

/**
 * Aceita formato novo (grupo → array de { produto_id, instancia_id?, extras? })
 * ou legado (grupo → { productId: quantidade }).
 * Quantidade por produto = número de instâncias com esse produto_id.
 */
export function normalizeComboInputToInstancias(raw: unknown): ComboPedidoPorGrupo {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const normalized: ComboPedidoPorGrupo = {};
  for (const [groupIdRaw, groupVal] of Object.entries(raw as Record<string, unknown>)) {
    const groupId = Number(groupIdRaw);
    if (!Number.isInteger(groupId) || groupId <= 0) continue;

    if (Array.isArray(groupVal)) {
      const insts: ComboPedidoInstancia[] = [];
      for (let idx = 0; idx < groupVal.length; idx++) {
        const entry = groupVal[idx];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new AppError(`Instancia de combo invalida (grupo ${groupId})`, 400);
        }
        const r = entry as Record<string, unknown>;
        const pid = Number(r.produto_id ?? r.product_id);
        if (!Number.isInteger(pid) || pid <= 0) {
          throw new AppError(`produto_id invalido no combo (grupo ${groupId})`, 400);
        }
        let iid = String(r.instancia_id ?? '').trim();
        if (!iid) {
          iid = `g${groupId}-p${pid}-i${idx}`;
        }
        if (iid.length > MAX_INSTANCIA_ID_LEN) {
          throw new AppError(`instancia_id muito longo (grupo ${groupId})`, 400);
        }
        const obs = parseObservacaoInstancia(r.observacao);
        const rawOp = r.selecoes ?? r.opcoes ?? r.adicionais;
        if (rawOp !== undefined && rawOp !== null) {
          if (typeof rawOp !== 'object' || Array.isArray(rawOp)) {
            throw new AppError(`selecoes da instancia de combo invalidas (grupo ${groupId})`, 400);
          }
        }
        const extras = parseInstanciaExtras(r);
        const row: ComboPedidoInstancia = { produto_id: pid, instancia_id: iid };
        if (obs) row.observacao = obs;
        if (rawOp !== undefined && rawOp !== null) row.selecoes_input = rawOp;
        if (extras && Object.keys(extras).length > 0) row.extras = extras;
        insts.push(row);
      }
      if (insts.length) normalized[groupId] = insts;
      continue;
    }

    if (groupVal && typeof groupVal === 'object' && !Array.isArray(groupVal)) {
      if (!isLegacyComboGrupoValor(groupVal)) {
        throw new AppError(`Formato de combo invalido (grupo ${groupId})`, 400);
      }
      const insts: ComboPedidoInstancia[] = [];
      for (const [productIdRaw, qtyRaw] of Object.entries(groupVal as Record<string, unknown>)) {
        const productId = Number(productIdRaw);
        const qty = Math.floor(Number(qtyRaw));
        if (!Number.isInteger(productId) || productId <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        for (let i = 0; i < qty; i++) {
          insts.push({
            produto_id: productId,
            instancia_id: `legacy:${groupId}:${productId}:${i}`,
          });
        }
      }
      if (insts.length) normalized[groupId] = insts;
    }
  }
  return normalized;
}

/** Agrega instâncias em contagens por produto (útil para relatórios ou legado). */
export function aggregateComboInstanciasPorProduto(insts: ComboPedidoInstancia[]): Record<number, number> {
  const inner: Record<number, number> = {};
  for (const it of insts) {
    inner[it.produto_id] = (inner[it.produto_id] || 0) + 1;
  }
  return inner;
}

export function normalizeComboEscolhas(raw: unknown): ComboEscolhas {
  const inst = normalizeComboInputToInstancias(raw);
  const normalized: ComboEscolhas = {};
  for (const [gidStr, arr] of Object.entries(inst)) {
    const gid = Number(gidStr);
    if (!Number.isInteger(gid) || gid <= 0) continue;
    const inner = aggregateComboInstanciasPorProduto(arr);
    if (Object.keys(inner).length > 0) normalized[gid] = inner;
  }
  return normalized;
}

export type ComboGrupoDb = {
  id: number;
  nome: string;
  ordem: number;
  obrigatorio: number;
  qtd_min: number;
  qtd_max: number;
  ativo: number;
  produto_id?: number;
};

export type ComboGrupoProdutoDb = {
  id: number;
  grupo_id: number;
  produto_componente_id: number;
  ativo: number;
  ordem: number;
};

/** qtd_max === 0 significa sem teto (mesma regra de `validateAuthoritativeComboSelections`). */
export type ProductComboGrupoDefinicaoNormalized = {
  nome: string;
  ordem: number;
  obrigatorio: 0 | 1;
  qtd_min: number;
  qtd_max: number;
  ativo: 0 | 1;
  product_ids: number[];
};

export function parseObrigatorioCombo(raw: unknown): 0 | 1 {
  if (raw === true || raw === 1 || String(raw) === '1') return 1;
  return 0;
}

export function normalizeComboQtdMinMax(qtd_min: number, qtd_max: number): { qtd_min: number; qtd_max: number } {
  const min = Math.max(0, Math.floor(Number(qtd_min)) || 0);
  const max = Math.max(0, Math.floor(Number(qtd_max)) || 0);
  if (max > 0 && min > max) {
    throw new AppError('qtd_min nao pode ser maior que qtd_max', 400);
  }
  return { qtd_min: min, qtd_max: max };
}

/**
 * Campos de grupo vindos do admin (POST/PUT incremental).
 * `ordem` undefined = caller deve usar proxima ordem livre no banco.
 */
export function parseComboGrupoFields(
  body: unknown,
  opts?: { defaultQtdMax?: number }
): {
  nome: string;
  ordem: number | undefined;
  obrigatorio: 0 | 1;
  qtd_min: number;
  qtd_max: number;
  ativo: 0 | 1;
} {
  const defMax = opts?.defaultQtdMax !== undefined ? opts.defaultQtdMax : 0;
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const nome = String(b.nome ?? '').trim();
  if (!nome) {
    throw new AppError('Nome obrigatorio', 400);
  }
  const obrigatorio = parseObrigatorioCombo(b.obrigatorio);
  const minRaw = b.qtd_min ?? b.min_selecoes ?? 0;
  const maxRaw = b.qtd_max ?? b.max_selecoes;
  const qtd_max =
    maxRaw === undefined || maxRaw === null || maxRaw === ''
      ? defMax
      : Number(maxRaw);
  const { qtd_min, qtd_max: qmax } = normalizeComboQtdMinMax(Number(minRaw), qtd_max);
  if (obrigatorio === 1 && qtd_min < 1) {
    throw new AppError('Grupo obrigatorio exige qtd_min >= 1', 400);
  }
  let ordem: number | undefined;
  if (b.ordem !== undefined && b.ordem !== null && b.ordem !== '') {
    const o = Math.floor(Number(b.ordem));
    if (!Number.isFinite(o)) {
      throw new AppError('ordem invalida', 400);
    }
    ordem = o;
  }
  const ativo = b.ativo === false || b.ativo === 0 || String(b.ativo) === '0' ? 0 : 1;
  return { nome, ordem, obrigatorio, qtd_min, qtd_max: qmax, ativo };
}

function parseProductIdsForGrupoDefinicao(raw: unknown, grupoLabel: string): number[] {
  const idsRaw = raw;
  const out: number[] = [];
  if (!Array.isArray(idsRaw)) {
    throw new AppError(`${grupoLabel}: product_ids invalido`, 400);
  }
  for (const entry of idsRaw) {
    if (typeof entry === 'number' || typeof entry === 'string') {
      const id = Number(entry);
      if (Number.isInteger(id) && id > 0) out.push(id);
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'product_id' in entry) {
      const id = Number((entry as { product_id?: unknown }).product_id);
      if (Number.isInteger(id) && id > 0) out.push(id);
    }
  }
  const uniq = new Set(out);
  if (uniq.size !== out.length) {
    throw new AppError(`${grupoLabel}: product_ids duplicados`, 400);
  }
  return out;
}

/**
 * Corpo de PUT /api/products/:id/combo/definicao — substitui todos os grupos e links do combo.
 */
export function parseProductComboDefinicaoBody(body: unknown): ProductComboGrupoDefinicaoNormalized[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Payload invalido', 400);
  }
  const gruposRaw = (body as Record<string, unknown>).grupos;
  if (!Array.isArray(gruposRaw)) {
    throw new AppError('grupos deve ser um array', 400);
  }
  return gruposRaw.map((g, index) => {
    const label = `Grupo ${index + 1}`;
    if (!g || typeof g !== 'object' || Array.isArray(g)) {
      throw new AppError(`${label}: formato invalido`, 400);
    }
    const r = g as Record<string, unknown>;
    const fields = parseComboGrupoFields(
      { nome: r.nome, ordem: r.ordem, obrigatorio: r.obrigatorio, qtd_min: r.qtd_min, qtd_max: r.qtd_max, ativo: r.ativo, min_selecoes: r.min_selecoes, max_selecoes: r.max_selecoes },
      { defaultQtdMax: 1 }
    );
    const ordem = fields.ordem !== undefined ? fields.ordem : index;
    const product_ids = parseProductIdsForGrupoDefinicao(r.product_ids ?? r.produto_ids ?? r.produtos, label);
    return {
      nome: fields.nome,
      ordem,
      obrigatorio: fields.obrigatorio,
      qtd_min: fields.qtd_min,
      qtd_max: fields.qtd_max,
      ativo: fields.ativo,
      product_ids,
    };
  });
}

/** Garante existencia no tenant, distinto do pai e (opcional) sem combo aninhado. */
export async function assertProdutoPermitidoComoComponenteCombo(params: {
  tenantId: number;
  comboProductId: number;
  componentProductId: number;
  forbidNestedCombo?: boolean;
}) {
  if (params.componentProductId === params.comboProductId) {
    throw new AppError('O combo nao pode incluir a si mesmo.', 400);
  }
  const row = await q1<{ id: number; is_combo: number }>(
    'SELECT id, COALESCE(is_combo,0) AS is_combo FROM produtos WHERE id=? AND tenant_id=?',
    [params.componentProductId, params.tenantId]
  );
  if (!row) {
    throw new AppError('Produto do cardapio nao encontrado', 404);
  }
  if (params.forbidNestedCombo !== false && Number(row.is_combo) === 1) {
    throw new AppError('Produto combo nao pode ser item de outro combo', 400);
  }
}

export async function assertComponentesComboDefinicao(
  tenantId: number,
  comboProductId: number,
  grupos: ProductComboGrupoDefinicaoNormalized[]
) {
  const allIds = [...new Set(grupos.flatMap((g) => g.product_ids))];
  if (!allIds.length) return;
  const ph = allIds.map(() => '?').join(',');
  const rows = await qAll<{ id: number; is_combo: number }>(
    `SELECT id, COALESCE(is_combo,0) AS is_combo FROM produtos WHERE tenant_id=? AND id IN (${ph})`,
    [tenantId, ...allIds]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const pid of allIds) {
    if (pid === comboProductId) {
      throw new AppError('O combo nao pode incluir a si mesmo.', 400);
    }
    const row = byId.get(pid);
    if (!row) {
      throw new AppError(`Produto ${pid} nao encontrado neste estabelecimento`, 400);
    }
    if (Number(row.is_combo) === 1) {
      throw new AppError('Produto combo nao pode ser item de outro combo', 400);
    }
  }
}

export async function loadComboGruposForProduto(tenantId: number, comboProductId: number, onlyActive: boolean) {
  const activeG = onlyActive ? ' AND g.ativo=1' : '';
  const activeP = onlyActive ? ' AND l.ativo=1 AND pr.active=1' : '';
  const grupos = await qAll<ComboGrupoDb>(
    `SELECT g.id, g.nome, g.ordem, g.obrigatorio, g.qtd_min, g.qtd_max, g.ativo
     FROM produto_combo_grupos g
     WHERE g.tenant_id=? AND g.produto_id=?${activeG}
     ORDER BY g.ordem ASC, g.id ASC`,
    [tenantId, comboProductId]
  );

  if (!grupos.length) return [] as Array<ComboGrupoDb & { produtos: Array<{ id: number; product_id: number; name: string }> }>;

  const gids = grupos.map((g) => g.id);
  const ph = gids.map(() => '?').join(',');
  const links = await qAll<ComboGrupoProdutoDb & { name: string }>(
    `SELECT l.id, l.grupo_id, l.produto_componente_id, l.ativo, l.ordem, pr.name AS name
     FROM produto_combo_grupo_produtos l
     JOIN produtos pr ON pr.id = l.produto_componente_id AND pr.tenant_id = l.tenant_id
     WHERE l.tenant_id=? AND l.grupo_id IN (${ph})${activeP}
     ORDER BY l.grupo_id ASC, l.ordem ASC, l.id ASC`,
    [tenantId, ...gids]
  );

  const byGrupo = new Map<number, Array<{ id: number; product_id: number; name: string }>>();
  for (const row of links) {
    const gid = Number(row.grupo_id);
    if (!byGrupo.has(gid)) byGrupo.set(gid, []);
    byGrupo.get(gid)!.push({
      id: row.id,
      product_id: Number(row.produto_componente_id),
      name: String(row.name || ''),
    });
  }

  return grupos.map((g) => ({
    ...g,
    produtos: byGrupo.get(g.id) || [],
  }));
}

/**
 * Valida escolhas do cliente contra a configuração do combo.
 * Garante produtos permitidos, ativos, diferentes do pai, e min/max por grupo.
 * Preço: o valor do produto combo (`produtos.price`) é fixo por unidade; `adicionaisTotal` soma apenas
 * `preco_adicional` das opções de cada instância (sem usar preço de catálogo dos componentes).
 */
export async function validateAuthoritativeComboSelections(params: {
  tenantId: number;
  comboProductId: number;
  rawCombo: unknown;
}): Promise<{ validado: ComboPedidoPorGrupo; adicionaisTotal: number }> {
  const product = await q1<{ id: number; is_combo: number; active: number }>(
    'SELECT id, COALESCE(is_combo,0) AS is_combo, active FROM produtos WHERE id=? AND tenant_id=?',
    [params.comboProductId, params.tenantId]
  );
  if (!product) {
    throw new AppError(`Produto ${params.comboProductId} invalido`, 400);
  }
  if (Number(product.active) !== 1) {
    throw new AppError(`Produto ${params.comboProductId} indisponivel`, 400);
  }
  if (Number(product.is_combo) !== 1) {
    throw new AppError(`Produto ${params.comboProductId} nao e combo`, 400);
  }

  const grupos = await loadComboGruposForProduto(params.tenantId, params.comboProductId, true);
  if (!grupos.length) {
    throw new AppError('Combo sem grupos configurados', 400);
  }

  const escolhasInst = normalizeComboInputToInstancias(params.rawCombo);
  const validado: ComboPedidoPorGrupo = {};
  let adicionaisTotal = 0;

  for (const g of grupos) {
    const allowed = new Set(g.produtos.map((p) => p.product_id));
    const pickedInst = escolhasInst[g.id] || [];
    const seenIds = new Set<string>();
    const normalizedInst: ComboPedidoInstancia[] = [];

    for (const row of pickedInst) {
      const pid = row.produto_id;
      const iid = String(row.instancia_id || '').trim();
      if (!iid) {
        throw new AppError(`instancia_id ausente no combo (grupo ${g.nome})`, 400);
      }
      if (seenIds.has(iid)) {
        throw new AppError(`instancia_id duplicado no combo (grupo ${g.nome})`, 400);
      }
      seenIds.add(iid);

      if (!allowed.has(pid)) {
        throw new AppError(`Item invalido no combo (grupo ${g.nome})`, 400);
      }
      if (pid === params.comboProductId) {
        throw new AppError('Combo nao pode incluir a si mesmo', 400);
      }
      const comp = await q1<{ active: number }>(
        'SELECT active FROM produtos WHERE id=? AND tenant_id=?',
        [pid, params.tenantId]
      );
      if (!comp || Number(comp.active) !== 1) {
        throw new AppError(`Componente do combo indisponivel`, 400);
      }

      let validatedOpcoes: Record<number, Record<number, number>>;
      try {
        const op = await validateProductOpcoesSelections({
          tenantId: params.tenantId,
          productId: pid,
          rawSelecoes: row.selecoes_input,
          baseProductPrice: 0,
          applyOpcoesPricing: true,
        });
        validatedOpcoes = op.selecoes;
        adicionaisTotal += Number(op.priceAtTime || 0);
      } catch (e: unknown) {
        if (isAppError(e)) {
          throw new AppError(
            `${e.message} (combo, grupo "${g.nome}", instancia ${iid})`,
            e.statusCode,
            e.code
          );
        }
        throw e;
      }

      const out: ComboPedidoInstancia = { produto_id: pid, instancia_id: iid };
      if (row.observacao) out.observacao = row.observacao;
      if (Object.keys(validatedOpcoes).length > 0) out.selecoes = validatedOpcoes;
      if (row.extras && Object.keys(row.extras).length > 0) out.extras = row.extras;
      normalizedInst.push(out);
    }

    const total = normalizedInst.length;
    const min = Math.max(0, Number(g.qtd_min || 0));
    const maxRaw = Number(g.qtd_max || 0);
    const max = maxRaw > 0 ? maxRaw : null;

    if (Number(g.obrigatorio) === 1 && total < min) {
      throw new AppError(`Quantidade insuficiente no grupo "${g.nome}" (minimo ${min})`, 400);
    }

    if (!Number(g.obrigatorio) && total > 0 && total < min) {
      throw new AppError(`Quantidade insuficiente no grupo "${g.nome}" (minimo ${min})`, 400);
    }

    if (max !== null && total > max) {
      throw new AppError(`Quantidade acima do limite no grupo "${g.nome}" (maximo ${max})`, 400);
    }

    if (normalizedInst.length > 0) {
      validado[g.id] = normalizedInst;
    } else if (Number(g.obrigatorio) === 1 && min > 0) {
      throw new AppError(`Grupo obrigatorio "${g.nome}" vazio`, 400);
    }
  }

  return { validado, adicionaisTotal };
}

const CARDAPIO_COMBO_CHUNK = 400;

function chunkIds<T>(arr: T[], size: number): T[][] {
  if (!arr.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Cardápio público: grupos de combo para vários produtos em poucas queries. */
export async function batchLoadComboGruposForCardapio(
  tenantId: number,
  produtoIds: number[]
): Promise<Map<number, Array<{ id: number; nome: string; ordem: number; obrigatorio: boolean; qtd_min: number; qtd_max: number; produtos: { link_id: number; product_id: number; name: string }[] }>>> {
  const map = new Map<
    number,
    Array<{
      id: number;
      nome: string;
      ordem: number;
      obrigatorio: boolean;
      qtd_min: number;
      qtd_max: number;
      produtos: { link_id: number; product_id: number; name: string }[];
    }>
  >();
  if (!produtoIds.length) return map;

  const tid = Number(tenantId);
  const allGrupos: ComboGrupoDb[] = [];
  for (const ids of chunkIds(produtoIds, CARDAPIO_COMBO_CHUNK)) {
    const ph = ids.map(() => '?').join(',');
    const rows = await qAll<ComboGrupoDb>(
      `SELECT g.id, g.nome, g.ordem, g.obrigatorio, g.qtd_min, g.qtd_max, g.ativo, g.produto_id
       FROM produto_combo_grupos g
       WHERE g.produto_id IN (${ph}) AND g.tenant_id=? AND g.ativo=1
       ORDER BY g.produto_id ASC, g.ordem ASC, g.id ASC`,
      [...ids, tid]
    );
    allGrupos.push(...rows);
  }

  if (!allGrupos.length) return map;

  const gids = allGrupos.map((g) => g.id);
  const allLinks: Array<ComboGrupoProdutoDb & { name: string; produto_id_parent: number }> = [];
  for (const chunk of chunkIds(gids, CARDAPIO_COMBO_CHUNK)) {
    if (!chunk.length) continue;
    const ph = chunk.map(() => '?').join(',');
    const rows = await qAll<ComboGrupoProdutoDb & { name: string; produto_id_parent: number }>(
      `SELECT l.id, l.grupo_id, l.produto_componente_id, l.ativo, l.ordem, pr.name AS name, g.produto_id AS produto_id_parent
       FROM produto_combo_grupo_produtos l
       JOIN produto_combo_grupos g ON g.id = l.grupo_id AND g.tenant_id = l.tenant_id
       JOIN produtos pr ON pr.id = l.produto_componente_id AND pr.tenant_id = l.tenant_id
       WHERE l.tenant_id=? AND l.grupo_id IN (${ph}) AND l.ativo=1 AND pr.active=1
       ORDER BY l.grupo_id ASC, l.ordem ASC, l.id ASC`,
      [tid, ...chunk]
    );
    allLinks.push(...rows);
  }

  const linksByGrupo = new Map<number, { link_id: number; product_id: number; name: string }[]>();
  for (const row of allLinks) {
    const gid = Number(row.grupo_id);
    if (!linksByGrupo.has(gid)) linksByGrupo.set(gid, []);
    linksByGrupo.get(gid)!.push({
      link_id: row.id,
      product_id: Number(row.produto_componente_id),
      name: String(row.name || ''),
    });
  }

  for (const g of allGrupos) {
    const pid = Number(g.produto_id ?? 0);
    const prods = linksByGrupo.get(g.id) || [];
    if (!prods.length) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push({
      id: g.id,
      nome: g.nome,
      ordem: g.ordem,
      obrigatorio: Number(g.obrigatorio) === 1,
      qtd_min: Math.max(0, Number(g.qtd_min || 0)),
      qtd_max: Math.max(0, Number(g.qtd_max || 0)),
      produtos: prods,
    });
  }

  return map;
}
