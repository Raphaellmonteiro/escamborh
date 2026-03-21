// src/routes/delivery-public.ts - rotas publicas sem autenticacao de tenant
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';
import { publicRateLimit, authDeliveryCliente } from '../middleware';
import { requireProductInventoryTargets } from '../services/stockIdentification';
import { AppError, isAppError } from '../utils/errors';
import { logError } from '../utils/logger';
import { pool } from '../db';

const TZ = 'America/Sao_Paulo';
type DeliveryZone = { nome: string; taxa: number };
type OrderChannel = 'delivery' | 'retirada';
type FirstCustomerDiscountType = 'percentual' | 'fixo' | 'frete_gratis';
type FirstCustomerDiscountReason =
  | 'inativo'
  | 'cliente_nao_identificado'
  | 'pedido_abaixo_minimo'
  | 'nao_primeira_compra'
  | 'sem_valor_configurado'
  | 'sem_taxa_entrega'
  | 'frete_ja_bonificado'
  | 'aplicado';

type DeliveryConfig = {
  taxa_entrega?: number;
  pedido_minimo?: number;
  tempo_preparo?: number;
  pix_chave?: string;
  pix_nome?: string;
  pix_cidade?: string;
  pix_payload_estatico?: string;
  whatsapp?: string;
  horario_abertura?: string;
  horario_fechamento?: string;
  desconto_pix?: number;
  valor_por_entrega?: number;
  zonas_entrega?: DeliveryZone[];
  desconto_primeiro_cliente_ativo?: boolean;
  desconto_primeiro_cliente_tipo?: FirstCustomerDiscountType;
  desconto_primeiro_cliente_valor?: number;
  desconto_primeiro_cliente_min_pedido?: number;
};

type DeliveryAddressRecord = {
  id: number;
  label?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  referencia?: string | null;
  principal?: number;
};

type CheckoutSummary = {
  modelo_entrega: 'bairro_fixo';
  bairro_entrega: string | null;
  subtotal: number;
  desconto_pix: number;
  subtotal_apos_desconto_pix: number;
  taxa_entrega: number;
  zona_entrega: DeliveryZone | null;
  desconto_cupom: number;
  cupom_aplicado: any | null;
  cupom_invalido?: string;
  desconto_primeiro_cliente: number;
  primeiro_cliente: {
    ativo: boolean;
    elegivel: boolean;
    aplicado: boolean;
    tipo: FirstCustomerDiscountType;
    valor_configurado: number;
    min_pedido: number;
    descricao: string;
    motivo: FirstCustomerDiscountReason;
    mensagem: string;
  };
  total: number;
  itensValidados: any[];
};

function parseDeliveryConfig(rawConfig?: string | null): DeliveryConfig {
  if (!rawConfig) return {};

  try {
    const parsed = JSON.parse(rawConfig);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getCurrentDateInTimeZone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getCurrentMinutesInTimeZone() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return (hour * 60) + minute;
}

function normalizeZoneName(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function findDeliveryZone(
  zonas: DeliveryZone[],
  bairro?: string | null
) {
  const normalizedBairro = normalizeZoneName(bairro);
  if (!normalizedBairro) return null;

  return zonas.find((zona) => {
    const normalizedZone = normalizeZoneName(zona.nome);
    return normalizedZone === normalizedBairro
      || normalizedBairro.includes(normalizedZone)
      || normalizedZone.includes(normalizedBairro);
  }) || null;
}

function validateCupom(
  cupom: any,
  total: number
): { valido: boolean; mensagem?: string; desconto: number } {
  if (!cupom) {
    return { valido: false, mensagem: 'Cupom invalido ou expirado', desconto: 0 };
  }

  if (cupom.validade) {
    const hoje = getCurrentDateInTimeZone();
    const validade = String(cupom.validade).slice(0, 10);
    if (hoje > validade) {
      return { valido: false, mensagem: 'Cupom expirado', desconto: 0 };
    }
  }

  if (cupom.limite_uso !== null && Number(cupom.uso_atual || 0) >= Number(cupom.limite_uso || 0)) {
    return { valido: false, mensagem: 'Cupom esgotado', desconto: 0 };
  }

  if (Number(cupom.min_pedido || 0) > 0 && total < Number(cupom.min_pedido || 0)) {
    return {
      valido: false,
      mensagem: `Pedido minimo para este cupom: R$ ${Number(cupom.min_pedido || 0).toFixed(2).replace('.', ',')}`,
      desconto: 0,
    };
  }

  const desconto = cupom.tipo === 'percentual'
    ? total * Number(cupom.valor || 0) / 100
    : cupom.tipo === 'fixo'
      ? Number(cupom.valor || 0)
      : 0;

  return { valido: true, desconto };
}

function describeFirstCustomerDiscount(config: DeliveryConfig) {
  const tipo = String(config.desconto_primeiro_cliente_tipo || 'percentual').toLowerCase() as FirstCustomerDiscountType;
  const valor = Number(config.desconto_primeiro_cliente_valor || 0);

  if (tipo === 'frete_gratis') return 'Frete gratis na primeira compra';
  if (tipo === 'fixo') return `R$ ${valor.toFixed(2).replace('.', ',')} na primeira compra`;
  return `${valor}% na primeira compra`;
}

function buildFirstCustomerDiscountMessage(params: {
  ativo: boolean;
  tipo: FirstCustomerDiscountType;
  valorConfigurado: number;
  minPedido: number;
  motivo: FirstCustomerDiscountReason;
}) {
  if (!params.ativo) return 'Desconto de primeira compra desativado.';
  if (params.motivo === 'cliente_nao_identificado') return 'Identifique o cliente para validar a primeira compra.';
  if (params.motivo === 'pedido_abaixo_minimo') {
    return `Disponivel a partir de R$ ${params.minPedido.toFixed(2).replace('.', ',')} no subtotal do pedido.`;
  }
  if (params.motivo === 'nao_primeira_compra') return 'Beneficio valido somente na primeira compra do cliente.';
  if (params.motivo === 'sem_valor_configurado') return 'Configure um valor valido para o desconto de primeira compra.';
  if (params.motivo === 'sem_taxa_entrega') return 'Este pedido ja esta com entrega gratis.';
  if (params.motivo === 'frete_ja_bonificado') return 'O frete deste pedido ja foi zerado por outro beneficio.';
  if (params.tipo === 'frete_gratis') return 'Frete gratis aplicado na primeira compra.';
  if (params.tipo === 'fixo') {
    return `Desconto de R$ ${params.valorConfigurado.toFixed(2).replace('.', ',')} aplicado na primeira compra.`;
  }
  return `Desconto de ${params.valorConfigurado}% aplicado na primeira compra.`;
}

async function resolveDeliveryCustomerId(tenantId: number, clienteToken?: unknown) {
  if (!clienteToken) return null;

  try {
    const dec: any = jwt.verify(String(clienteToken), process.env.JWT_SECRET || 'dev_secret');
    if (dec.tipo === 'delivery_cliente' && Number(dec.tenantId) === Number(tenantId)) {
      return Number(dec.clienteId);
    }
  } catch {}

  return null;
}

async function resolveSavedDeliveryAddress(params: {
  tenantId: number;
  clienteId: number | null;
  enderecoId?: unknown;
}) {
  if (params.enderecoId === undefined || params.enderecoId === null || String(params.enderecoId).trim() === '') {
    return null;
  }

  const enderecoId = Number(params.enderecoId);
  if (!Number.isInteger(enderecoId) || enderecoId <= 0) {
    throw new AppError('Endereco invalido', 400, 'DELIVERY_ENDERECO_INVALIDO');
  }

  if (!params.clienteId) {
    throw new AppError('Endereco salvo requer cliente autenticado', 401, 'DELIVERY_CLIENTE_NAO_AUTENTICADO');
  }

  const endereco = await q1(
    `SELECT id, label, logradouro, numero, complemento, bairro, referencia, principal
     FROM delivery_enderecos
     WHERE id=? AND tenant_id=? AND cliente_id=?`,
    [enderecoId, params.tenantId, params.clienteId]
  );

  if (!endereco) {
    throw new AppError('Endereco invalido para este cliente', 400, 'DELIVERY_ENDERECO_INVALIDO');
  }

  return endereco as DeliveryAddressRecord;
}

function formatSavedDeliveryAddress(endereco: DeliveryAddressRecord) {
  return [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(', '),
    endereco.complemento ? `Compl: ${endereco.complemento}` : '',
    endereco.bairro ? `Bairro: ${endereco.bairro}` : '',
    endereco.referencia ? `Ref: ${endereco.referencia}` : '',
  ].filter(Boolean).join(' - ');
}

async function validateDeliveryItems(tenantId: number, items: any[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Pedido sem itens', 400);
  }

  let subtotal = 0;
  const itensValidados: any[] = [];

  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    const priceAtTime = Number(item?.price_at_time);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new AppError('Produto invalido', 400);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(`Quantidade invalida para o produto ${productId}`, 400);
    }

    if (!Number.isFinite(priceAtTime) || priceAtTime < 0) {
      throw new AppError(`Preco invalido para o produto ${productId}`, 400);
    }

    const prod = await q1('SELECT id FROM produtos WHERE id=? AND tenant_id=? AND active=1', [productId, tenantId]);
    if (!prod) {
      throw new AppError(`Produto ${productId} invalido`, 400);
    }

    subtotal += priceAtTime * quantity;
    itensValidados.push({ ...item, product_id: productId, quantity, price_at_time: priceAtTime });
  }

  return { subtotal, itensValidados };
}

async function resolveDeliveryFee(params: {
  tenantId: number;
  clienteId: number | null;
  endereco?: DeliveryAddressRecord | null;
  bairro?: unknown;
  config: DeliveryConfig;
  canalPedido?: OrderChannel;
}) {
  if (params.canalPedido === 'retirada') {
    return { taxa: 0, zona: null as DeliveryZone | null, bairro: null as string | null };
  }

  const defaultFee = Number(params.config.taxa_entrega || 0);
  const zonas = Array.isArray(params.config.zonas_entrega) ? params.config.zonas_entrega : [];
  const bairroInformado = String(params.bairro || '').trim();

  if (bairroInformado) {
    const zona = findDeliveryZone(zonas, bairroInformado);
    return {
      taxa: zona ? Number(zona.taxa || 0) : defaultFee,
      zona,
      bairro: bairroInformado,
    };
  }

  if (zonas.length === 0 || !params.endereco) {
    return { taxa: defaultFee, zona: null as DeliveryZone | null, bairro: null as string | null };
  }

  const zona = findDeliveryZone(zonas, params.endereco.bairro);
  return {
    taxa: zona ? Number(zona.taxa || 0) : defaultFee,
    zona,
    bairro: String(params.endereco.bairro || '').trim() || null,
  };
}

async function resolveFirstCustomerDiscount(params: {
  tenantId: number;
  clienteId: number | null;
  config: DeliveryConfig;
  subtotalAfterPix: number;
  taxaEntrega: number;
  cupomAplicado: any | null;
  totalBeforeFirstCustomerDiscount: number;
}) {
  const ativo = Boolean(params.config.desconto_primeiro_cliente_ativo);
  const tipo = String(params.config.desconto_primeiro_cliente_tipo || 'percentual').toLowerCase() as FirstCustomerDiscountType;
  const valorConfigurado = Number(params.config.desconto_primeiro_cliente_valor || 0);
  const minPedido = Number(params.config.desconto_primeiro_cliente_min_pedido || 0);
  const descricao = describeFirstCustomerDiscount(params.config);
  const finalize = (input: {
    desconto: number;
    elegivel: boolean;
    aplicado: boolean;
    motivo: FirstCustomerDiscountReason;
  }) => ({
    desconto: input.desconto,
    ativo,
    elegivel: input.elegivel,
    aplicado: input.aplicado,
    tipo,
    valor_configurado: valorConfigurado,
    min_pedido: minPedido,
    descricao,
    motivo: input.motivo,
    mensagem: buildFirstCustomerDiscountMessage({
      ativo,
      tipo,
      valorConfigurado,
      minPedido,
      motivo: input.motivo,
    }),
  });

  if (!ativo || !params.clienteId) {
    return finalize({
      desconto: 0,
      elegivel: false,
      aplicado: false,
      motivo: ativo ? 'cliente_nao_identificado' : 'inativo',
    });
  }

  if (tipo !== 'frete_gratis' && valorConfigurado <= 0) {
    return finalize({
      desconto: 0,
      elegivel: false,
      aplicado: false,
      motivo: 'sem_valor_configurado',
    });
  }

  if (minPedido > 0 && params.subtotalAfterPix < minPedido) {
    return finalize({
      desconto: 0,
      elegivel: false,
      aplicado: false,
      motivo: 'pedido_abaixo_minimo',
    });
  }

  const existingOrder = await q1(
    `SELECT id
     FROM pedidos
     WHERE tenant_id=?
       AND delivery_cliente_id=?
       AND cancelado_at IS NULL
       AND LOWER(COALESCE(status, '')) <> 'cancelado'
     LIMIT 1`,
    [params.tenantId, params.clienteId]
  );

  if (existingOrder) {
    return finalize({
      desconto: 0,
      elegivel: false,
      aplicado: false,
      motivo: 'nao_primeira_compra',
    });
  }

  let desconto = 0;
  let motivo: FirstCustomerDiscountReason = 'aplicado';
  if (tipo === 'frete_gratis') {
    const freteJaBonificado = params.cupomAplicado?.tipo === 'frete_gratis';
    if (freteJaBonificado) {
      motivo = 'frete_ja_bonificado';
      desconto = 0;
    } else if (params.taxaEntrega <= 0) {
      motivo = 'sem_taxa_entrega';
      desconto = 0;
    } else {
      desconto = params.taxaEntrega;
    }
  } else if (tipo === 'fixo') {
    desconto = Math.min(valorConfigurado, params.subtotalAfterPix);
  } else {
    desconto = params.subtotalAfterPix * (valorConfigurado / 100);
  }

  desconto = Math.max(0, Math.min(desconto, params.totalBeforeFirstCustomerDiscount));

  return finalize({
    desconto,
    elegivel: true,
    aplicado: desconto > 0,
    motivo,
  });
}

async function buildCheckoutSummary(params: {
  tenantId: number;
  config: DeliveryConfig;
  items: any[];
  pagamentoTipo?: unknown;
  enderecoId?: unknown;
  bairro?: unknown;
  clienteToken?: unknown;
  cupomCodigo?: unknown;
  canalPedido?: OrderChannel;
}) {
  const clienteId = await resolveDeliveryCustomerId(params.tenantId, params.clienteToken);
  const enderecoSalvo = await resolveSavedDeliveryAddress({
    tenantId: params.tenantId,
    clienteId,
    enderecoId: params.enderecoId,
  });
  const { subtotal, itensValidados } = await validateDeliveryItems(params.tenantId, params.items);
  const pagamentoTipo = String(params.pagamentoTipo || 'pix').trim().toLowerCase();
  const fee = await resolveDeliveryFee({
    tenantId: params.tenantId,
    clienteId,
    endereco: enderecoSalvo,
    bairro: params.bairro,
    config: params.config,
    canalPedido: params.canalPedido,
  });

  const descontoPixPercent = pagamentoTipo === 'pix' ? Number(params.config.desconto_pix || 0) : 0;
  const descontoPix = descontoPixPercent > 0 ? subtotal * (descontoPixPercent / 100) : 0;
  const subtotalAposPix = Math.max(0, subtotal - descontoPix);
  const totalAntesDoCupom = subtotalAposPix + fee.taxa;

  let cupomAplicado: any = null;
  let descontoCupom = 0;
  let cupomInvalido: string | undefined;
  const cupomCodigo = String(params.cupomCodigo || '').trim().toUpperCase();

  if (cupomCodigo) {
    const cupom = await q1(
      'SELECT * FROM delivery_cupons WHERE tenant_id=? AND codigo=? AND ativo=1',
      [params.tenantId, cupomCodigo]
    );
    const resultadoCupom = validateCupom(cupom, totalAntesDoCupom);
    if (resultadoCupom.valido) {
      cupomAplicado = cupom;
      descontoCupom = cupom?.tipo === 'frete_gratis'
        ? fee.taxa
        : Math.min(resultadoCupom.desconto, totalAntesDoCupom);
    } else {
      cupomInvalido = resultadoCupom.mensagem || 'Cupom invalido ou expirado';
    }
  }

  const totalAntesDoPrimeiroCliente = Math.max(0, totalAntesDoCupom - descontoCupom);
  const primeiroCliente = await resolveFirstCustomerDiscount({
    tenantId: params.tenantId,
    clienteId,
    config: params.config,
    subtotalAfterPix: subtotalAposPix,
    taxaEntrega: fee.taxa,
    cupomAplicado,
    totalBeforeFirstCustomerDiscount: totalAntesDoPrimeiroCliente,
  });

  const total = Math.max(0, totalAntesDoPrimeiroCliente - primeiroCliente.desconto);

  const summary: CheckoutSummary = {
    modelo_entrega: 'bairro_fixo',
    bairro_entrega: fee.bairro,
    subtotal,
    desconto_pix: descontoPix,
    subtotal_apos_desconto_pix: subtotalAposPix,
    taxa_entrega: fee.taxa,
    zona_entrega: fee.zona,
    desconto_cupom: descontoCupom,
    cupom_aplicado: cupomAplicado,
    desconto_primeiro_cliente: primeiroCliente.desconto,
    primeiro_cliente: {
      ativo: primeiroCliente.ativo,
      elegivel: primeiroCliente.elegivel,
      aplicado: primeiroCliente.aplicado,
      tipo: primeiroCliente.tipo,
      valor_configurado: primeiroCliente.valor_configurado,
      min_pedido: primeiroCliente.min_pedido,
      descricao: primeiroCliente.descricao,
      motivo: primeiroCliente.motivo,
      mensagem: primeiroCliente.mensagem,
    },
    total,
    itensValidados,
  };

  if (cupomInvalido) {
    summary.cupom_invalido = cupomInvalido;
  }

  return summary;
}

export function createDeliveryPublicRouter() {
  const router = Router();

  async function getTenant(slug: string) {
    return q1('SELECT * FROM clientes WHERE usuario=? AND status=?', [slug, 'ativo']);
  }

  router.get('/:slug/cardapio', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const dcfg = parseDeliveryConfig(tenant.delivery_config);
      if (!tenant.delivery_ativo) return res.status(403).json({ error: 'Delivery nao esta ativo', aberto: false });

      let aberto = true;
      if (dcfg.horario_abertura && dcfg.horario_fechamento) {
        const [ah, am] = dcfg.horario_abertura.split(':').map(Number);
        const [fh, fm] = dcfg.horario_fechamento.split(':').map(Number);
        const t = getCurrentMinutesInTimeZone();
        const ini = ah * 60 + am;
        const fim = fh * 60 + fm;
        aberto = ini <= fim ? (t >= ini && t <= fim) : (t >= ini || t <= fim);
      }

      const produtos = await qAll('SELECT * FROM produtos WHERE tenant_id=? AND active=1 ORDER BY COALESCE(ordem,0) ASC, name ASC', [tenant.id]);
      const produtosComOpcoes = [];
      for (const p of produtos) {
        const grupos = await qAll('SELECT * FROM produto_grupos_opcao WHERE produto_id=? AND tenant_id=? AND ativo=1 ORDER BY ordem ASC', [p.id, tenant.id]);
        const gruposComItens = [];
        for (const g of grupos) {
          const itens = await qAll('SELECT * FROM produto_opcao_itens WHERE grupo_id=? AND tenant_id=? AND ativo=1 ORDER BY ordem ASC', [g.id, tenant.id]);
          gruposComItens.push({ ...g, itens });
        }
        produtosComOpcoes.push({ ...p, grupos_opcao: gruposComItens });
      }

      const logo = (() => {
        const dir = path.join(process.cwd(), 'uploads', 'logo');
        if (!fs.existsSync(dir)) return null;
        const file = fs.readdirSync(dir).find((name: string) => name.startsWith(`logo_${tenant.id}.`));
        return file ? `/uploads/logo/${file}` : null;
      })();

      const categoriasMap: Record<string, any[]> = {};
      for (const p of produtosComOpcoes) {
        const cat = p.category || 'Geral';
        if (!categoriasMap[cat]) categoriasMap[cat] = [];
        categoriasMap[cat].push(p);
      }
      const categorias = Object.entries(categoriasMap).map(([nome, itens]) => ({ nome, itens }));

      res.json({
        estabelecimento: tenant.nome_estabelecimento,
        nome_estabelecimento: tenant.nome_estabelecimento,
        logo_url: logo,
        ativo: aberto,
        aberto,
        config: {
          taxa_entrega: dcfg.taxa_entrega ?? 0,
          modelo_entrega: 'bairro_fixo',
          pedido_minimo: dcfg.pedido_minimo ?? 0,
          tempo_preparo: dcfg.tempo_preparo ?? 30,
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          whatsapp: dcfg.whatsapp || tenant.whatsapp,
          horario_abertura: dcfg.horario_abertura,
          horario_fechamento: dcfg.horario_fechamento,
          desconto_pix: dcfg.desconto_pix ?? 0,
          desconto_primeiro_cliente_ativo: dcfg.desconto_primeiro_cliente_ativo ?? false,
          desconto_primeiro_cliente_tipo: dcfg.desconto_primeiro_cliente_tipo ?? 'percentual',
          desconto_primeiro_cliente_valor: dcfg.desconto_primeiro_cliente_valor ?? 0,
          desconto_primeiro_cliente_min_pedido: dcfg.desconto_primeiro_cliente_min_pedido ?? 0,
          zonas_entrega: Array.isArray(dcfg.zonas_entrega) ? dcfg.zonas_entrega : [],
        },
        categorias,
        produtos: produtosComOpcoes,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:slug/pedido/:id', async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const dcfg = parseDeliveryConfig(tenant.delivery_config);

      const pedido = await q1(
        `SELECT p.*, m.nome as motoboy_nome,
          (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
         FROM pedidos p LEFT JOIN delivery_motoboys m ON m.id=p.motoboy_id AND m.tenant_id=p.tenant_id
         WHERE p.id=? AND p.tenant_id=?`,
        [req.params.id, tenant.id]
      );

      if (!pedido) return res.status(404).json({ error: 'Pedido nao encontrado' });

      pedido.total_amount = Number(pedido.total_amount || 0);
      pedido.taxa_entrega = Number(pedido.taxa_entrega || 0);
      try {
        pedido.delivery_checkout_snapshot = pedido.delivery_checkout_snapshot
          ? JSON.parse(pedido.delivery_checkout_snapshot)
          : null;
      } catch {
        pedido.delivery_checkout_snapshot = null;
      }

      res.json({
        pedido,
        nome_estabelecimento: tenant.nome_estabelecimento,
        config_pix: {
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          whatsapp: dcfg.whatsapp || tenant.whatsapp,
          desconto_pix: dcfg.desconto_pix,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:slug/cupom/validar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const { codigo, total } = req.body;
      const cupom = await q1(
        'SELECT * FROM delivery_cupons WHERE tenant_id=? AND codigo=? AND ativo=1',
        [tenant.id, String(codigo).toUpperCase().trim()]
      );
      const resultado = validateCupom(cupom, Number(total || 0));
      if (!resultado.valido) return res.json({ valido: false, mensagem: resultado.mensagem });
      res.json({ valido: true, cupom, desconto: resultado.desconto });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:slug/pedido/resumo', async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });

      const dcfg = parseDeliveryConfig(tenant.delivery_config);
      const summary = await buildCheckoutSummary({
        tenantId: tenant.id,
        config: dcfg,
        items: req.body?.items || [],
        pagamentoTipo: req.body?.pagamento_tipo,
        enderecoId: req.body?.endereco_id,
        bairro: req.body?.bairro_temporario,
        clienteToken: req.body?.clienteToken,
        cupomCodigo: req.body?.cupom_codigo,
        canalPedido: String(req.body?.canal || '').trim().toLowerCase() === 'retirada' ? 'retirada' : 'delivery',
      });

      res.json({ success: true, resumo: summary });
    } catch (e: any) {
      if (isAppError(e)) {
        return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
      }

      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/:slug/auth/identificar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const { telefone } = req.body;
      const tel = String(telefone || '').replace(/\D/g, '');
      if (tel.length < 10) return res.status(400).json({ error: 'Telefone invalido' });
      const cliente = await q1('SELECT * FROM delivery_clientes WHERE tenant_id=? AND telefone=?', [tenant.id, tel]);
      if (cliente) {
        await qRun('UPDATE delivery_clientes SET ultimo_acesso=NOW() WHERE id=?', [cliente.id]);
        const token = jwt.sign({ clienteId: cliente.id, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '90d' });
        return res.json({
          success: true,
          novo: false,
          token,
          cliente: {
            id: cliente.id,
            nome: cliente.nome,
            telefone: cliente.telefone,
            email: cliente.email,
            favoritos: JSON.parse(cliente.favoritos || '[]'),
          },
        });
      }
      res.json({ success: true, novo: true, telefone: tel });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:slug/auth/cadastrar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const { telefone, nome, email } = req.body;
      const tel = String(telefone || '').replace(/\D/g, '');
      if (!tel || !nome?.trim()) return res.status(400).json({ error: 'Telefone e nome obrigatorios' });
      const existe = await q1('SELECT * FROM delivery_clientes WHERE tenant_id=? AND telefone=?', [tenant.id, tel]);
      if (existe) {
        const token = jwt.sign({ clienteId: existe.id, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '90d' });
        return res.json({
          success: true,
          token,
          cliente: {
            id: existe.id,
            nome: existe.nome,
            telefone: existe.telefone,
            email: existe.email,
            favoritos: JSON.parse(existe.favoritos || '[]'),
          },
        });
      }
      const clienteId = await qInsert(
        'INSERT INTO delivery_clientes (tenant_id,nome,telefone,email,origem_cadastro) VALUES (?,?,?,?,?)',
        [tenant.id, nome.trim(), tel, email || null, 'delivery_online']
      );
      const token = jwt.sign({ clienteId, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '90d' });
      res.json({ success: true, token, cliente: { id: clienteId, nome: nome.trim(), telefone: tel, email: email || null, favoritos: [] } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:slug/cliente/perfil', authDeliveryCliente, async (req: any, res) => {
    try {
      const cliente = await q1('SELECT id,nome,telefone,email,favoritos FROM delivery_clientes WHERE id=? AND tenant_id=?', [req.clienteId, req.tenantId]);
      if (!cliente) return res.status(404).json({ error: 'Cliente nao encontrado' });
      res.json({ ...cliente, favoritos: JSON.parse(cliente.favoritos || '[]') });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:slug/cliente/perfil', authDeliveryCliente, async (req: any, res) => {
    try {
      const { nome, email } = req.body;
      await qRun('UPDATE delivery_clientes SET nome=?,email=? WHERE id=? AND tenant_id=?', [nome?.trim() || '', email || null, req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:slug/cliente/favoritos', authDeliveryCliente, async (req: any, res) => {
    try {
      await qRun('UPDATE delivery_clientes SET favoritos=? WHERE id=? AND tenant_id=?', [JSON.stringify(req.body.favoritos || []), req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:slug/cliente/enderecos', authDeliveryCliente, async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM delivery_enderecos WHERE cliente_id=? AND tenant_id=? ORDER BY principal DESC, id DESC', [req.clienteId, req.tenantId]));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:slug/cliente/enderecos', authDeliveryCliente, async (req: any, res) => {
    try {
      const { label, logradouro, numero, complemento, bairro, referencia, principal } = req.body;
      if (!logradouro?.trim()) return res.status(400).json({ error: 'Logradouro obrigatorio' });
      if (principal) await qRun('UPDATE delivery_enderecos SET principal=0 WHERE cliente_id=? AND tenant_id=?', [req.clienteId, req.tenantId]);
      const id = await qInsert(
        'INSERT INTO delivery_enderecos (tenant_id,cliente_id,label,logradouro,numero,complemento,bairro,referencia,principal) VALUES (?,?,?,?,?,?,?,?,?)',
        [req.tenantId, req.clienteId, label || 'Casa', logradouro.trim(), numero || null, complemento || null, bairro || null, referencia || null, principal ? 1 : 0]
      );
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/:slug/cliente/enderecos/:id', authDeliveryCliente, async (req: any, res) => {
    try {
      await qRun('DELETE FROM delivery_enderecos WHERE id=? AND cliente_id=? AND tenant_id=?', [req.params.id, req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:slug/cliente/pedidos', authDeliveryCliente, async (req: any, res) => {
    try {
      res.json(await qAll(
        `SELECT p.*, (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
         FROM pedidos p WHERE p.delivery_cliente_id=? AND p.tenant_id=? ORDER BY p.created_at DESC LIMIT 30`,
        [req.clienteId, req.tenantId]
      ));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:slug/pedido', async (req: any, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });
      const dcfg = parseDeliveryConfig(tenant.delivery_config);
      const { items, pagamento_tipo, observation, cliente_nome, cliente_tel, endereco, clienteToken, cupom_codigo, endereco_id, bairro_temporario } = req.body;
      const canalPedido: OrderChannel = String(req.body?.canal || '').trim().toLowerCase() === 'retirada' ? 'retirada' : 'delivery';
      const tipoRetirada = canalPedido === 'retirada' ? 'levar' : 'local';
      const clienteId = await resolveDeliveryCustomerId(tenant.id, clienteToken);
      const enderecoSalvo = await resolveSavedDeliveryAddress({
        tenantId: tenant.id,
        clienteId,
        enderecoId: endereco_id,
      });
      const checkoutSummary = await buildCheckoutSummary({
        tenantId: tenant.id,
        config: dcfg,
        items: items || [],
        pagamentoTipo: pagamento_tipo,
        enderecoId: endereco_id,
        bairro: bairro_temporario,
        clienteToken,
        cupomCodigo: cupom_codigo,
        canalPedido,
      });

      if (cupom_codigo && !checkoutSummary.cupom_aplicado) {
        return res.status(400).json({
          success: false,
          error: checkoutSummary.cupom_invalido || 'Cupom invalido ou expirado',
        });
      }

      const enderecoFinal = canalPedido === 'retirada'
        ? null
        : (
            enderecoSalvo
              ? formatSavedDeliveryAddress(enderecoSalvo)
              : String(endereco || '').trim()
          );

      if (canalPedido === 'delivery' && !enderecoFinal) {
        throw new AppError('Endereco de entrega obrigatorio', 400, 'DELIVERY_ENDERECO_OBRIGATORIO');
      }

      const itensValidados = checkoutSummary.itensValidados;
      const taxaEntrega = checkoutSummary.taxa_entrega;
      const totalFinal = checkoutSummary.total;
      const cupom = checkoutSummary.cupom_aplicado;
      const checkoutSnapshot = {
        modelo_entrega: checkoutSummary.modelo_entrega,
        bairro_entrega: checkoutSummary.bairro_entrega,
        subtotal: checkoutSummary.subtotal,
        desconto_pix: checkoutSummary.desconto_pix,
        subtotal_apos_desconto_pix: checkoutSummary.subtotal_apos_desconto_pix,
        taxa_entrega: checkoutSummary.taxa_entrega,
        zona_entrega: checkoutSummary.zona_entrega,
        desconto_cupom: checkoutSummary.desconto_cupom,
        cupom_aplicado: checkoutSummary.cupom_aplicado
          ? {
              codigo: checkoutSummary.cupom_aplicado.codigo,
              tipo: checkoutSummary.cupom_aplicado.tipo,
            }
          : null,
        desconto_primeiro_cliente: checkoutSummary.desconto_primeiro_cliente,
        primeiro_cliente: checkoutSummary.primeiro_cliente,
        total: checkoutSummary.total,
      };

      const dateObj = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
      const y = String(dateObj.getFullYear()).slice(-2);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const prefix = `D${y}${m}${d}`;

      const result = await withTx(async (client) => {
        const n = await txQ1(client, 'SELECT COUNT(*) as c FROM pedidos WHERE tenant_id=? AND order_number LIKE ?', [tenant.id, `${prefix}-%`]);
        const num = Number(n?.c || 0) + 1;
        const orderNumber = `${prefix}-${String(num).padStart(3, '0')}`;

        const orderId = await txInsert(
          client,
          `INSERT INTO pedidos (order_number,total_amount,taxa_entrega,observation,tenant_id,canal,tipo_retirada,cliente_nome,cliente_tel,endereco,pagamento_tipo,pagamento_status,status,delivery_cliente_id,delivery_checkout_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [orderNumber, totalFinal, taxaEntrega, observation || null, tenant.id, canalPedido, tipoRetirada, cliente_nome || null, String(cliente_tel || '').replace(/\D/g, '') || null, enderecoFinal, pagamento_tipo || 'pix', pagamento_tipo === 'pix' ? 'aguardando_confirmacao' : 'pendente', 'Criado', clienteId, JSON.stringify(checkoutSnapshot)]
        );

          for (const item of itensValidados) {
            await txRun(client, 'INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)', [orderId, item.product_id, item.quantity, canalPedido === 'retirada' ? 'Retirada' : 'Delivery', item.price_at_time, tenant.id]);
            const resolution = await requireProductInventoryTargets({
              client,
              tenantId: tenant.id,
              productId: item.product_id,
              context: 'delivery-public.createOrder',
              orderId,
              direction: 'saida',
            });
            for (const target of resolution?.targets || []) {
              const qtd = Number(target.quantityMultiplier) * Number(item.quantity);
            await txRun(client, 'UPDATE ingredientes SET estoque_atual=GREATEST(0,estoque_atual-?) WHERE id=? AND tenant_id=?', [qtd, target.ingredientId, tenant.id]);
            await txRun(client, "INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id) VALUES (?,'saida',?,'Venda delivery automatica',?)", [target.ingredientId, qtd, tenant.id]);
          }
        }

        if (cupom) await txRun(client, 'UPDATE delivery_cupons SET uso_atual=uso_atual+1 WHERE id=?', [cupom.id]);
        if (clienteId) {
          await txRun(
            client,
            `UPDATE delivery_clientes
             SET primeira_compra_at = COALESCE(primeira_compra_at, NOW()),
                 ultima_compra_at = NOW(),
                 ultimo_acesso = NOW(),
                 origem_cadastro = COALESCE(NULLIF(BTRIM(origem_cadastro), ''), 'delivery_online')
             WHERE id=? AND tenant_id=?`,
            [clienteId, tenant.id]
          );
        }

        return { orderId, orderNumber };
      });

      const waNumber = (dcfg.whatsapp || tenant.whatsapp || '').replace(/\D/g, '');
      const listaItens = await Promise.all(itensValidados.map(async (item: any) => {
        const produto = await q1('SELECT name FROM produtos WHERE id=?', [item.product_id]);
        return `- ${item.quantity}x ${produto?.name || 'Produto'} - R$ ${(item.price_at_time * item.quantity).toFixed(2).replace('.', ',')}`;
      }));
      const pagLabel: Record<string, string> = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartao' };
      const mapsUrl = canalPedido === 'delivery'
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoFinal || '')}`
        : null;
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const data = new Date().toLocaleDateString('pt-BR');
      const msg = canalPedido === 'retirada'
        ? `NOVO PEDIDO RETIRADA #${result.orderNumber}\n\n${data} as ${hora}\n\nCliente: ${cliente_nome || 'Cliente'}\nTelefone: ${cliente_tel || '-'}\n\nITENS:\n${listaItens.join('\n')}\n\n${pagLabel[pagamento_tipo] || pagamento_tipo}\nTotal: R$ ${totalFinal.toFixed(2).replace('.', ',')}`
        : `NOVO PEDIDO DELIVERY #${result.orderNumber}\n\n${data} as ${hora}\n\nCliente: ${cliente_nome || 'Cliente'}\nTelefone: ${cliente_tel || '-'}\nEndereco: ${enderecoFinal || '-'}\nMapa: ${mapsUrl}\n\nITENS:\n${listaItens.join('\n')}\n\n${pagLabel[pagamento_tipo] || pagamento_tipo}\nTotal: R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
      const waLink = waNumber ? `https://wa.me/55${waNumber}?text=${encodeURIComponent(msg)}` : null;

      res.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: totalFinal,
        canal: canalPedido,
        waLink,
        mapsUrl,
        config_pix: {
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          whatsapp: dcfg.whatsapp || tenant.whatsapp,
          desconto_pix: dcfg.desconto_pix,
        },
        resumo_checkout: {
          taxa_entrega: checkoutSummary.taxa_entrega,
          desconto_pix: checkoutSummary.desconto_pix,
          desconto_cupom: checkoutSummary.desconto_cupom,
          desconto_primeiro_cliente: checkoutSummary.desconto_primeiro_cliente,
          total: checkoutSummary.total,
        },
      });
      } catch (e: any) {
        logError('delivery-public.createOrder', e, {
          slug: req.params.slug,
        });

        if (isAppError(e)) {
          return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
        }

        console.error('POST /public/delivery/:slug/pedido:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    });

  router.post('/:slug/pedido/:pedidoId/confirmar-pix', async (req, res) => {
    try {
      const tenant = await q1('SELECT id FROM clientes WHERE usuario=? AND status=?', [req.params.slug, 'ativo']);
      if (!tenant) return res.status(404).json({ error: 'Estabelecimento nao encontrado' });
      const pedido = await q1('SELECT id, pagamento_status, canal FROM pedidos WHERE id=? AND tenant_id=?', [req.params.pedidoId, tenant.id]);
      if (!pedido) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (pedido.canal !== 'delivery' && pedido.canal !== 'retirada') {
        return res.status(400).json({ error: 'Canal do pedido nao permite confirmacao por aqui' });
      }
      if (pedido.pagamento_status !== 'pago') {
        await qRun("UPDATE pedidos SET pagamento_status='aguardando_confirmacao' WHERE id=? AND tenant_id=?", [pedido.id, tenant.id]);
      }
      res.json({ success: true, pagamento_status: 'aguardando_confirmacao' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }

// Rota para buscar sugestões de produtos (Camada 1)
  router.post('/suggestions', async (req: any, res: any) => {
    try {
      // Ajuste como o tenantId chega na sua rota (req.tenantId se for autenticada, ou via slug/body se for pública)
      const tenantId = req.tenantId || req.body.tenantId; 
      const { productIds } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.json({ suggestions: [] });
      }

      // Query otimizada para PostgreSQL com sintaxe de Array (ANY / ALL)
      const result = await pool.query(
        `
        SELECT 
          ps.produto_sugerido_id,
          MAX(ps.prioridade) AS prioridade,
          p.id,
          p.name,
          p.price,
          p.category,
          p.photo_url AS image,
          p.active AS ativo
        FROM produto_sugestoes ps
        JOIN produtos p ON p.id = ps.produto_sugerido_id
        WHERE 
          ps.tenant_id = $1
          AND ps.ativo = 1
          AND p.active = 1
          AND ps.produto_id = ANY($2::int[])
          AND ps.produto_sugerido_id <> ALL($2::int[])
        GROUP BY ps.produto_sugerido_id, p.id, p.name, p.price, p.category, p.photo_url, p.active
        ORDER BY MAX(ps.prioridade) DESC, p.name ASC
        LIMIT 3
        `,
        [tenantId, productIds]
      );

      return res.json({ suggestions: result.rows });
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar sugestões' });
    }
  });



  });

  return router;
}
