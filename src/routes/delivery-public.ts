// src/routes/delivery-public.ts — rotas públicas sem autenticação de tenant
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { q1, qAll, qRun, qInsert, withTx, txQ1, txQAll, txRun, txInsert } from '../db';
import { publicRateLimit, authDeliveryCliente } from '../middleware';

const TZ = 'America/Sao_Paulo';

export function createDeliveryPublicRouter() {
  const router = Router();

  async function getTenant(slug: string) {
    return q1('SELECT * FROM clientes WHERE usuario=? AND status=?', [slug, 'ativo']);
  }

  // ── Cardápio público ──────────────────────────────────────────────────────
  router.get('/:slug/cardapio', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      const dcfg = tenant.delivery_config ? JSON.parse(tenant.delivery_config) : {};
      if (!tenant.delivery_ativo) return res.status(403).json({ error: 'Delivery não está ativo', aberto: false });

      let aberto = true;
      if (dcfg.horario_abertura && dcfg.horario_fechamento) {
        const agora = new Date();
        const [ah,am] = dcfg.horario_abertura.split(':').map(Number);
        const [fh,fm] = dcfg.horario_fechamento.split(':').map(Number);
        const t = agora.getHours()*60+agora.getMinutes();
        const ini = ah*60+am, fim = fh*60+fm;
        aberto = ini<=fim ? (t>=ini&&t<=fim) : (t>=ini||t<=fim);
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
        const f = fs.readdirSync(dir).find((x: string) => x.startsWith(`logo_${tenant.id}.`));
        return f ? `/uploads/logo/${f}` : null;
      })();

      const categoriasMap: Record<string, any[]> = {};
      for (const p of produtosComOpcoes) {
        const cat = p.category || 'Geral';
        if (!categoriasMap[cat]) categoriasMap[cat] = [];
        categoriasMap[cat].push(p);
      }
      const categorias = Object.entries(categoriasMap).map(([nome, itens]) => ({ nome, itens }));

      res.json({
        estabelecimento:      tenant.nome_estabelecimento,
        nome_estabelecimento: tenant.nome_estabelecimento,
        logo_url: logo, ativo: aberto, aberto,
        config: {
          taxa_entrega:         dcfg.taxa_entrega    ?? 0,
          pedido_minimo:        dcfg.pedido_minimo   ?? 0,
          tempo_preparo:        dcfg.tempo_preparo   ?? 30,
          pix_chave:            dcfg.pix_chave,
          pix_nome:             dcfg.pix_nome,
          pix_cidade:           dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          whatsapp:             dcfg.whatsapp || tenant.whatsapp,
          horario_abertura:     dcfg.horario_abertura,
          horario_fechamento:   dcfg.horario_fechamento,
          desconto_pix:         dcfg.desconto_pix    ?? 0,
          zonas_entrega:        Array.isArray(dcfg.zonas_entrega) ? dcfg.zonas_entrega : [],
        },
        categorias, produtos: produtosComOpcoes,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

// ── Rastreamento de pedido ────────────────────────────────────────────────
  router.get('/:slug/pedido/:id', async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      
      // Puxa as configurações para enviar o Pix
      const dcfg = tenant.delivery_config ? JSON.parse(tenant.delivery_config) : {};

      const pedido = await q1(`
        SELECT p.*, m.nome as motoboy_nome,
          (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
        FROM pedidos p LEFT JOIN delivery_motoboys m ON m.id=p.motoboy_id AND m.tenant_id=p.tenant_id
        WHERE p.id=? AND p.tenant_id=?
      `, [req.params.id, tenant.id]);
      
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
      
      // Converte os valores financeiros para Número (Supabase devolve como String)
      pedido.total_amount = Number(pedido.total_amount || 0);
      pedido.taxa_entrega = Number(pedido.taxa_entrega || 0);

      // Envia o pedido e a configuração do PIX embutida
      res.json({ 
        pedido, 
        nome_estabelecimento: tenant.nome_estabelecimento,
        config_pix: {
          pix_chave: dcfg.pix_chave,
          pix_nome: dcfg.pix_nome,
          pix_cidade: dcfg.pix_cidade,
          pix_payload_estatico: dcfg.pix_payload_estatico,
          desconto_pix: dcfg.desconto_pix
        }
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Validar cupom ─────────────────────────────────────────────────────────
  router.post('/:slug/cupom/validar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      const { codigo, total } = req.body;
      const cupom = await q1("SELECT * FROM delivery_cupons WHERE tenant_id=? AND codigo=? AND ativo=1", [tenant.id, String(codigo).toUpperCase().trim()]);
      if (!cupom) return res.json({ valido: false, mensagem: 'Cupom inválido ou expirado' });
      if (cupom.validade) {
        const hoje = new Date().toISOString().slice(0, 10);
        const valStr = String(cupom.validade).slice(0, 10);
        if (hoje > valStr) return res.json({ valido: false, mensagem: 'Cupom expirado' });
      }
      if (cupom.limite_uso !== null && cupom.uso_atual >= cupom.limite_uso) return res.json({ valido: false, mensagem: 'Cupom esgotado' });
      if (cupom.min_pedido > 0 && (total||0) < cupom.min_pedido) return res.json({ valido: false, mensagem: `Pedido mínimo para este cupom: R$ ${cupom.min_pedido.toFixed(2).replace('.',',')}` });
      const desconto = cupom.tipo === 'percentual' ? (total||0)*cupom.valor/100 : cupom.tipo === 'fixo' ? cupom.valor : 0;
      res.json({ valido: true, cupom, desconto });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Auth cliente: identificar ─────────────────────────────────────────────
  router.post('/:slug/auth/identificar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      const { telefone } = req.body;
      const tel = String(telefone||'').replace(/\D/g,'');
      if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido' });
      const cliente = await q1('SELECT * FROM delivery_clientes WHERE tenant_id=? AND telefone=?', [tenant.id, tel]);
      if (cliente) {
        await qRun('UPDATE delivery_clientes SET ultimo_acesso=NOW() WHERE id=?', [cliente.id]);
        const token = jwt.sign({ clienteId: cliente.id, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET||'dev_secret', { expiresIn: '90d' });
        return res.json({ success: true, novo: false, token, cliente: { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone, email: cliente.email, favoritos: JSON.parse(cliente.favoritos||'[]') } });
      }
      res.json({ success: true, novo: true, telefone: tel });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Auth cliente: cadastrar ───────────────────────────────────────────────
  router.post('/:slug/auth/cadastrar', publicRateLimit, async (req, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      const { telefone, nome, email } = req.body;
      const tel = String(telefone||'').replace(/\D/g,'');
      if (!tel || !nome?.trim()) return res.status(400).json({ error: 'Telefone e nome obrigatórios' });
      const existe = await q1('SELECT * FROM delivery_clientes WHERE tenant_id=? AND telefone=?', [tenant.id, tel]);
      if (existe) {
        const token = jwt.sign({ clienteId: existe.id, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET||'dev_secret', { expiresIn: '90d' });
        return res.json({ success: true, token, cliente: { id: existe.id, nome: existe.nome, telefone: existe.telefone, email: existe.email, favoritos: JSON.parse(existe.favoritos||'[]') } });
      }
      const clienteId = await qInsert('INSERT INTO delivery_clientes (tenant_id,nome,telefone,email) VALUES (?,?,?,?)', [tenant.id, nome.trim(), tel, email||null]);
      const token = jwt.sign({ clienteId, tenantId: tenant.id, tipo: 'delivery_cliente' }, process.env.JWT_SECRET||'dev_secret', { expiresIn: '90d' });
      res.json({ success: true, token, cliente: { id: clienteId, nome: nome.trim(), telefone: tel, email: email||null, favoritos: [] } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Perfil, favoritos e endereços do cliente ──────────────────────────────
  router.get('/:slug/cliente/perfil', authDeliveryCliente, async (req: any, res) => {
    try {
      const c = await q1('SELECT id,nome,telefone,email,favoritos FROM delivery_clientes WHERE id=? AND tenant_id=?', [req.clienteId, req.tenantId]);
      if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
      res.json({ ...c, favoritos: JSON.parse(c.favoritos||'[]') });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:slug/cliente/perfil', authDeliveryCliente, async (req: any, res) => {
    try {
      const { nome, email } = req.body;
      await qRun('UPDATE delivery_clientes SET nome=?,email=? WHERE id=? AND tenant_id=?', [nome?.trim()||'', email||null, req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:slug/cliente/favoritos', authDeliveryCliente, async (req: any, res) => {
    try {
      await qRun('UPDATE delivery_clientes SET favoritos=? WHERE id=? AND tenant_id=?', [JSON.stringify(req.body.favoritos||[]), req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:slug/cliente/enderecos', authDeliveryCliente, async (req: any, res) => {
    try { res.json(await qAll('SELECT * FROM delivery_enderecos WHERE cliente_id=? AND tenant_id=? ORDER BY principal DESC, id DESC', [req.clienteId, req.tenantId])); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:slug/cliente/enderecos', authDeliveryCliente, async (req: any, res) => {
    try {
      const { label, logradouro, numero, complemento, bairro, referencia, principal } = req.body;
      if (!logradouro?.trim()) return res.status(400).json({ error: 'Logradouro obrigatório' });
      if (principal) await qRun('UPDATE delivery_enderecos SET principal=0 WHERE cliente_id=? AND tenant_id=?', [req.clienteId, req.tenantId]);
      const id = await qInsert('INSERT INTO delivery_enderecos (tenant_id,cliente_id,label,logradouro,numero,complemento,bairro,referencia,principal) VALUES (?,?,?,?,?,?,?,?,?)',
        [req.tenantId, req.clienteId, label||'Casa', logradouro.trim(), numero||null, complemento||null, bairro||null, referencia||null, principal?1:0]);
      res.json({ success: true, id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:slug/cliente/enderecos/:id', authDeliveryCliente, async (req: any, res) => {
    try {
      await qRun('DELETE FROM delivery_enderecos WHERE id=? AND cliente_id=? AND tenant_id=?', [req.params.id, req.clienteId, req.tenantId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:slug/cliente/pedidos', authDeliveryCliente, async (req: any, res) => {
    try {
      res.json(await qAll(`
        SELECT p.*, (SELECT STRING_AGG(pr.name||' x'||ip.quantity::text,', ') FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.product_id WHERE ip.order_id=p.id) as resumo_itens
        FROM pedidos p WHERE p.delivery_cliente_id=? AND p.tenant_id=? ORDER BY p.created_at DESC LIMIT 30
      `, [req.clienteId, req.tenantId]));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

 // ── Fazer pedido ──────────────────────────────────────────────────────────
  router.post('/:slug/pedido', async (req: any, res) => {
    try {
      const tenant = await getTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Loja não encontrada' });
      const dcfg = tenant.delivery_config ? JSON.parse(tenant.delivery_config) : {};
      const { items, pagamento_tipo, observation, cliente_nome, cliente_tel, endereco, clienteToken, cupom_codigo, desconto_pix } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'Pedido sem itens' });

      let clienteId: number|null = null;
      if (clienteToken) {
        try {
          const dec: any = jwt.verify(clienteToken, process.env.JWT_SECRET||'dev_secret');
          if (dec.tipo === 'delivery_cliente' && dec.tenantId === tenant.id) clienteId = dec.clienteId;
        } catch {}
      }

      let subtotal = 0;
      const itensValidados: any[] = [];
      for (const item of items) {
        const prod = await q1('SELECT * FROM produtos WHERE id=? AND tenant_id=? AND active=1', [item.product_id, tenant.id]);
        if (!prod) return res.status(400).json({ error: `Produto ${item.product_id} inválido` });
        subtotal += item.price_at_time * item.quantity;
        itensValidados.push(item);
      }

      const discPix = pagamento_tipo === 'pix' && (desconto_pix||0) > 0 ? subtotal*(desconto_pix/100) : 0;
      let totalFinal = subtotal - discPix + (dcfg.taxa_entrega||0);

      let cupom: any = null;
      if (cupom_codigo) {
        cupom = await q1("SELECT * FROM delivery_cupons WHERE tenant_id=? AND codigo=? AND ativo=1", [tenant.id, String(cupom_codigo).toUpperCase().trim()]);
        if (cupom) {
          if (cupom.tipo === 'frete_gratis') totalFinal -= (dcfg.taxa_entrega||0);
          else if (cupom.tipo === 'percentual') totalFinal -= subtotal*cupom.valor/100;
          else if (cupom.tipo === 'fixo') totalFinal -= cupom.valor;
          totalFinal = Math.max(0, totalFinal);
        }
      }

      // Cria a numeração do pedido corrigida pelo fuso de SP
      const dateObj = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const y = String(dateObj.getFullYear()).slice(-2);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const prefix = `D${y}${m}${d}`;

      const result = await withTx(async (client) => {
        const n = await txQ1(client, `SELECT COUNT(*) as c FROM pedidos WHERE tenant_id=? AND order_number LIKE ?`, [tenant.id, `${prefix}-%`]);
        const num = Number(n?.c||0)+1;
        const on = `${prefix}-${String(num).padStart(3,'0')}`;
        
        const orderId = await txInsert(client,
          `INSERT INTO pedidos (order_number,total_amount,taxa_entrega,observation,tenant_id,canal,cliente_nome,cliente_tel,endereco,pagamento_tipo,pagamento_status,status,delivery_cliente_id) VALUES (?,?,?,?,?,'delivery',?,?,?,?,?,?,?)`,
          [on, totalFinal, dcfg.taxa_entrega||0, observation||null, tenant.id, cliente_nome||null, String(cliente_tel||'').replace(/\D/g,'')||null, endereco||null, pagamento_tipo||'pix', pagamento_tipo==='pix'?'aguardando_confirmacao':'pendente', 'Criado', clienteId]
        );
        for (const item of itensValidados) {
          await txRun(client, 'INSERT INTO itens_pedido (order_id,product_id,quantity,type,price_at_time,tenant_id) VALUES (?,?,?,?,?,?)', [orderId, item.product_id, item.quantity, 'Delivery', item.price_at_time, tenant.id]);
          const prod = await txQ1(client, 'SELECT * FROM produtos WHERE id=? AND tenant_id=?', [item.product_id, tenant.id]);
          if (prod?.codigo_barras) {
            const ing = await txQ1(client, 'SELECT * FROM ingredientes WHERE tenant_id=? AND (codigo_barras=? OR LOWER(nome)=LOWER(?)) LIMIT 1', [tenant.id, prod.codigo_barras, prod.name]);
            if (ing) {
              await txRun(client, 'UPDATE ingredientes SET estoque_atual=GREATEST(0,estoque_atual-?) WHERE id=? AND tenant_id=?', [item.quantity, ing.id, tenant.id]);
              await txRun(client, "INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id) VALUES (?,'saida',?,'Venda delivery automática',?)", [ing.id, item.quantity, tenant.id]);
              continue;
            }
          }
          const vinculos = await txQAll(client, 'SELECT * FROM produto_ingrediente WHERE product_id=? AND tenant_id=?', [item.product_id, tenant.id]);
          for (const v of vinculos) {
            const qtd = v.quantidade_usada * item.quantity;
            await txRun(client, 'UPDATE ingredientes SET estoque_atual=GREATEST(0,estoque_atual-?) WHERE id=? AND tenant_id=?', [qtd, v.ingrediente_id, tenant.id]);
            await txRun(client, "INSERT INTO estoque_movimentacoes (ingrediente_id,tipo,quantidade,motivo,tenant_id) VALUES (?,'saida',?,'Venda delivery automática',?)", [v.ingrediente_id, qtd, tenant.id]);
          }
        }
        if (cupom) await txRun(client, 'UPDATE delivery_cupons SET uso_atual=uso_atual+1 WHERE id=?', [cupom.id]);
        if (clienteId) await txRun(client, 'UPDATE delivery_clientes SET ultimo_acesso=NOW() WHERE id=?', [clienteId]);
        return { orderId, orderNumber: on };
      });

      // WhatsApp
      const waNumber = (dcfg.whatsapp||tenant.whatsapp||'').replace(/\D/g,'');
      const listaItens = await Promise.all(itensValidados.map(async (i: any) => {
        const p = await q1('SELECT name FROM produtos WHERE id=?', [i.product_id]);
        return `• ${i.quantity}x ${p?.name||'Produto'} — R$ ${(i.price_at_time*i.quantity).toFixed(2).replace('.',',')}`;
      }));
      const pagLabel: Record<string,string> = { pix:'⚡ PIX', dinheiro:'💵 Dinheiro', cartao:'💳 Cartão' };
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco||'')}`;
      const hora = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const data = new Date().toLocaleDateString('pt-BR');
      const msg = `🛵 *NOVO PEDIDO DELIVERY #${result.orderNumber}*\n\n*${data} às ${hora}*\n\n👤 ${cliente_nome||'Cliente'}\n📱 ${cliente_tel||'—'}\n📍 ${endereco||'—'}\n🗺️ ${mapsUrl}\n\n*ITENS:*\n${listaItens.join('\n')}\n\n*${pagLabel[pagamento_tipo]||pagamento_tipo}*\n💰 Total: R$ ${totalFinal.toFixed(2).replace('.',',')}`;
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
          desconto_pix: dcfg.desconto_pix
        }
      });
    } catch (e: any) {
      console.error('POST /public/delivery/:slug/pedido:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Confirmar pagamento PIX ────────────────────────────────────────────────
  router.post('/:slug/pedido/:pedidoId/confirmar-pix', async (req, res) => {
    try {
      const tenant = await q1('SELECT id FROM clientes WHERE usuario=? AND status=?', [req.params.slug, 'ativo']);
      if (!tenant) return res.status(404).json({ error: 'Estabelecimento não encontrado' });
      const pedido = await q1("SELECT id, pagamento_status, canal FROM pedidos WHERE id=? AND tenant_id=?", [req.params.pedidoId, tenant.id]);
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (pedido.canal !== 'delivery') return res.status(400).json({ error: 'Pedido não é delivery' });
      if (pedido.pagamento_status !== 'pago') {
        await qRun("UPDATE pedidos SET pagamento_status='aguardando_confirmacao' WHERE id=? AND tenant_id=?", [pedido.id, tenant.id]);
      }
      res.json({ success: true, pagamento_status: 'aguardando_confirmacao' });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  return router;
}