// src/routes/delivery-public.ts - rotas publicas sem autenticacao de tenant
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';
import { publicRateLimit, authDeliveryCliente } from '../middleware';
import { requireProductInventoryTargets } from '../services/stockIdentification';
import { isAppError } from '../utils/errors';
import { logError } from '../utils/logger';

const TZ = 'America/Sao_Paulo';

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
  zonas_entrega?: Array<{ nome: string; taxa: number }>;
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
  zonas: Array<{ nome: string; taxa: number }>,
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

async function resolveDeliveryFee(params: {
  tenantId: number;
  clienteId: number | null;
  enderecoId?: unknown;
  config: DeliveryConfig;
}) {
  const defaultFee = Number(params.config.taxa_entrega || 0);
  const zonas = Array.isArray(params.config.zonas_entrega) ? params.config.zonas_entrega : [];

  if (zonas.length === 0 || !params.enderecoId) {
    return defaultFee;
  }

  const endereco = params.clienteId
    ? await q1(
        'SELECT bairro FROM delivery_enderecos WHERE id=? AND tenant_id=? AND cliente_id=?',
        [params.enderecoId, params.tenantId, params.clienteId]
      )
    : await q1(
        'SELECT bairro FROM delivery_enderecos WHERE id=? AND tenant_id=?',
        [params.enderecoId, params.tenantId]
      );

  const zona = findDeliveryZone(zonas, endereco?.bairro);
  return zona ? Number(zona.taxa || 0) : defaultFee;
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

      res.json({
        pedido,
        nome_estabelecimento: tenant.nome_estabelecimento,
        config_pix: {
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
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
      const { items, pagamento_tipo, observation, cliente_nome, cliente_tel, endereco, clienteToken, cupom_codigo, endereco_id } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'Pedido sem itens' });

      let clienteId: number | null = null;
      if (clienteToken) {
        try {
          const dec: any = jwt.verify(clienteToken, process.env.JWT_SECRET || 'dev_secret');
          if (dec.tipo === 'delivery_cliente' && dec.tenantId === tenant.id) clienteId = dec.clienteId;
        } catch {}
      }

      let subtotal = 0;
      const itensValidados: any[] = [];
      for (const item of items) {
        const prod = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=? AND active=1', [item.product_id, tenant.id]);
        if (!prod) return res.status(400).json({ error: `Produto ${item.product_id} invalido` });
        subtotal += item.price_at_time * item.quantity;
        itensValidados.push(item);
      }

      const taxaEntrega = await resolveDeliveryFee({
        tenantId: tenant.id,
        clienteId,
        enderecoId: endereco_id,
        config: dcfg,
      });
      const descontoPixPercent = pagamento_tipo === 'pix' ? Number(dcfg.desconto_pix || 0) : 0;
      const discPix = descontoPixPercent > 0 ? subtotal * (descontoPixPercent / 100) : 0;
      let totalFinal = subtotal - discPix + taxaEntrega;

      let cupom: any = null;
      if (cupom_codigo) {
        cupom = await q1(
          'SELECT * FROM delivery_cupons WHERE tenant_id=? AND codigo=? AND ativo=1',
          [tenant.id, String(cupom_codigo).toUpperCase().trim()]
        );
        const resultadoCupom = validateCupom(cupom, totalFinal);
        if (!resultadoCupom.valido) {
          return res.status(400).json({ success: false, error: resultadoCupom.mensagem || 'Cupom invalido ou expirado' });
        }

        if (cupom.tipo === 'frete_gratis') totalFinal -= taxaEntrega;
        else totalFinal -= resultadoCupom.desconto;
        totalFinal = Math.max(0, totalFinal);
      }

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
          `INSERT INTO pedidos (order_number,total_amount,taxa_entrega,observation,tenant_id,canal,cliente_nome,cliente_tel,endereco,pagamento_tipo,pagamento_status,status,delivery_cliente_id) VALUES (?,?,?,?,?,'delivery',?,?,?,?,?,?,?)`,
          [orderNumber, totalFinal, taxaEntrega, observation || null, tenant.id, cliente_nome || null, String(cliente_tel || '').replace(/\D/g, '') || null, endereco || null, pagamento_tipo || 'pix', pagamento_tipo === 'pix' ? 'aguardando_confirmacao' : 'pendente', 'Criado', clienteId]
        );

          for (const item of itensValidados) {
            await txRun(client, 'INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)', [orderId, item.product_id, item.quantity, 'Delivery', item.price_at_time, tenant.id]);
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
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco || '')}`;
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const data = new Date().toLocaleDateString('pt-BR');
      const msg = `NOVO PEDIDO DELIVERY #${result.orderNumber}\n\n${data} as ${hora}\n\nCliente: ${cliente_nome || 'Cliente'}\nTelefone: ${cliente_tel || '-'}\nEndereco: ${endereco || '-'}\nMapa: ${mapsUrl}\n\nITENS:\n${listaItens.join('\n')}\n\n${pagLabel[pagamento_tipo] || pagamento_tipo}\nTotal: R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
      const waLink = waNumber ? `https://wa.me/55${waNumber}?text=${encodeURIComponent(msg)}` : null;

      res.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: totalFinal,
        waLink,
        mapsUrl,
        config_pix: {
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          desconto_pix: dcfg.desconto_pix,
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
      if (pedido.canal !== 'delivery') return res.status(400).json({ error: 'Pedido nao e delivery' });
      if (pedido.pagamento_status !== 'pago') {
        await qRun("UPDATE pedidos SET pagamento_status='aguardando_confirmacao' WHERE id=? AND tenant_id=?", [pedido.id, tenant.id]);
      }
      res.json({ success: true, pagamento_status: 'aguardando_confirmacao' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
