// src/db.ts - reexport e migrações
import { pool } from './db/pool';

export * from './db/index';

// Backup (PostgreSQL — use pg_dump via cron ou backup da plataforma)
export async function backupDatabase() {
  console.log('Backup gerenciado pela plataforma (Supabase/Neon/Railway). Configure pg_dump se necessario.');
}

export async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        ativo INTEGER DEFAULT 1,
        token_version INTEGER DEFAULT 1,
        cliente_id INTEGER,
        cargo TEXT DEFAULT 'dono',
        permissoes TEXT DEFAULT NULL,
        nome TEXT DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        name TEXT, price REAL, category TEXT, active INTEGER DEFAULT 1,
        color TEXT DEFAULT 'zinc', photo_url TEXT, codigo_barras TEXT,
        marca TEXT, descricao TEXT, custo REAL DEFAULT 0,
        destaque INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0,
        disponivel_de TEXT, disponivel_ate TEXT, tenant_id INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL, tenant_id INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        order_number TEXT UNIQUE, status TEXT DEFAULT 'Criado',
        total_amount REAL, observation TEXT, receipt_text TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        tenant_id INTEGER DEFAULT 1,
        senha_pedido INTEGER DEFAULT 0,
        tipo_retirada TEXT DEFAULT 'local',
        canal TEXT DEFAULT 'balcao',
        cliente_nome TEXT, cliente_tel TEXT, endereco TEXT,
        pagamento_tipo TEXT, pagamento_status TEXT DEFAULT 'pendente',
        taxa_entrega REAL DEFAULT 0, motoboy_id INTEGER,
        saiu_entrega_at TIMESTAMPTZ, entregue_at TIMESTAMPTZ,
        pix_txid TEXT, delivery_cliente_id INTEGER,
        cancelado_at TIMESTAMPTZ,
        cancelamento_motivo TEXT,
        cancelado_por INTEGER,
        estoque_reposto INTEGER DEFAULT 0,
        estoque_reposto_at TIMESTAMPTZ,
        reembolso_status TEXT DEFAULT 'nenhum',
        valor_reembolsado REAL DEFAULT 0,
        reembolsado_at TIMESTAMPTZ,
        reembolso_motivo TEXT,
        reembolsado_por INTEGER
      );
      CREATE TABLE IF NOT EXISTS itens_pedido (
        id SERIAL PRIMARY KEY,
        order_id INTEGER, product_id INTEGER, quantity INTEGER,
        type TEXT, price_at_time REAL, tenant_id INTEGER DEFAULT 1,
        FOREIGN KEY(order_id) REFERENCES pedidos(id),
        FOREIGN KEY(product_id) REFERENCES produtos(id)
      );
      CREATE TABLE IF NOT EXISTS pagamentos (
        id SERIAL PRIMARY KEY,
        order_id INTEGER, method TEXT, amount_paid REAL, change_given REAL,
        created_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER DEFAULT 1,
        FOREIGN KEY(order_id) REFERENCES pedidos(id)
      );
      CREATE TABLE IF NOT EXISTS despesas (
        id SERIAL PRIMARY KEY,
        description TEXT, amount REAL, category TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS caixa (
        id SERIAL PRIMARY KEY,
        data TEXT NOT NULL, fundo_inicial REAL NOT NULL,
        valor_contado REAL, status TEXT DEFAULT 'aberto',
        observacao TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        tenant_id INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS ingredientes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL, unidade TEXT NOT NULL,
        estoque_atual REAL DEFAULT 0, estoque_minimo REAL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER DEFAULT 1,
        codigo_barras TEXT, custo_unitario REAL DEFAULT 0,
        fornecedor TEXT, unidade_compra TEXT
      );
      CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
        id SERIAL PRIMARY KEY,
        ingrediente_id INTEGER NOT NULL, tipo TEXT NOT NULL,
        quantidade REAL NOT NULL, motivo TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER DEFAULT 1,
        FOREIGN KEY(ingrediente_id) REFERENCES ingredientes(id)
      );
      CREATE TABLE IF NOT EXISTS solicitacoes (
        id SERIAL PRIMARY KEY,
        nome_estabelecimento TEXT NOT NULL, razao_social TEXT,
        documento_tipo TEXT NOT NULL, documento_numero TEXT NOT NULL,
        nome_responsavel TEXT NOT NULL, email TEXT NOT NULL,
        whatsapp TEXT NOT NULL, cidade TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        segmento TEXT DEFAULT 'Restaurante/Food',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        solicitacao_id INTEGER, nome_estabelecimento TEXT NOT NULL,
        razao_social TEXT, documento_tipo TEXT NOT NULL, documento_numero TEXT NOT NULL,
        nome_responsavel TEXT NOT NULL, email TEXT NOT NULL,
        whatsapp TEXT NOT NULL, cidade TEXT NOT NULL,
        usuario TEXT UNIQUE NOT NULL, senha TEXT NOT NULL,
        status TEXT DEFAULT 'ativo',
        trial_inicio TIMESTAMPTZ DEFAULT NOW(),
        trial_fim TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        ultimo_acesso TIMESTAMPTZ,
        segmento TEXT DEFAULT 'Restaurante/Food',
        taxa_debito REAL DEFAULT 0, taxa_credito REAL DEFAULT 0, taxa_pix REAL DEFAULT 0,
        senha_admin TEXT DEFAULT '123321', senha_caixa TEXT DEFAULT '123321',
        printer_config TEXT DEFAULT NULL,
        plano TEXT DEFAULT 'trial', valor_plano REAL DEFAULT 0,
        vencimento TIMESTAMPTZ,
        delivery_ativo INTEGER DEFAULT 0, delivery_config TEXT DEFAULT NULL,
        FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes(id)
      );
      CREATE TABLE IF NOT EXISTS mesas (
        id SERIAL PRIMARY KEY,
        numero INTEGER NOT NULL, status TEXT DEFAULT 'fechada',
        tenant_id INTEGER NOT NULL, opened_at TIMESTAMPTZ,
        UNIQUE(numero, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS comandas (
        id SERIAL PRIMARY KEY,
        mesa_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
        status TEXT DEFAULT 'aberta',
        created_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ,
        FOREIGN KEY(mesa_id) REFERENCES mesas(id)
      );
      CREATE TABLE IF NOT EXISTS itens_comanda (
        id SERIAL PRIMARY KEY,
        comanda_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL, quantity INTEGER DEFAULT 1,
        price_at_time REAL NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        tenant_id INTEGER NOT NULL,
        FOREIGN KEY(comanda_id) REFERENCES comandas(id)
      );
      CREATE TABLE IF NOT EXISTS renovacoes (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL, plano TEXT NOT NULL,
        valor REAL NOT NULL,
        data_pagamento TIMESTAMPTZ DEFAULT NOW(),
        vencimento_anterior TIMESTAMPTZ, novo_vencimento TIMESTAMPTZ,
        FOREIGN KEY(cliente_id) REFERENCES clientes(id)
      );
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL, usuario_nome TEXT NOT NULL,
        cargo TEXT DEFAULT 'dono', acao TEXT NOT NULL, detalhes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS pedido_eventos (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER NOT NULL,
        tenant_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT,
        valor REAL DEFAULT 0,
        motivo TEXT,
        estoque_reposto INTEGER DEFAULT 0,
        payload TEXT,
        usuario_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY(pedido_id) REFERENCES pedidos(id)
      );
      CREATE TABLE IF NOT EXISTS ai_avisos (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL, tipo TEXT NOT NULL,
        titulo TEXT NOT NULL, mensagem TEXT NOT NULL,
        acao TEXT, acao_rota TEXT, prioridade INTEGER DEFAULT 1,
        lido INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expira_em TIMESTAMPTZ, chave TEXT
      );
      CREATE TABLE IF NOT EXISTS ai_cache (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL, tipo TEXT NOT NULL,
        resultado TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS produto_ingrediente (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL, ingrediente_id INTEGER NOT NULL,
        quantidade_usada REAL NOT NULL DEFAULT 1,
        tenant_id INTEGER NOT NULL,
        unidade TEXT DEFAULT 'unidade'
      );
      CREATE TABLE IF NOT EXISTS produto_grupos_opcao (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'radio',
        min_selecoes INTEGER NOT NULL DEFAULT 0,
        max_selecoes INTEGER NOT NULL DEFAULT 1,
        obrigatorio INTEGER NOT NULL DEFAULT 0,
        ordem INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        modo_preco TEXT NOT NULL DEFAULT 'adicional',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS produto_opcao_itens (
        id SERIAL PRIMARY KEY,
        grupo_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL, preco_adicional REAL NOT NULL DEFAULT 0,
        ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS delivery_motoboys (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        telefone TEXT, veiculo TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, nome)
      );
      CREATE TABLE IF NOT EXISTS delivery_clientes (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL, telefone TEXT NOT NULL, email TEXT,
        favoritos TEXT DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        ultimo_acesso TIMESTAMPTZ,
        UNIQUE(tenant_id, telefone)
      );
      CREATE TABLE IF NOT EXISTS delivery_enderecos (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL, label TEXT NOT NULL DEFAULT 'Casa',
        logradouro TEXT NOT NULL, numero TEXT, complemento TEXT, bairro TEXT,
        referencia TEXT, principal INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS delivery_cupons (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        codigo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'percentual',
        valor REAL NOT NULL DEFAULT 0, min_pedido REAL DEFAULT 0,
        limite_uso INTEGER DEFAULT NULL, uso_atual INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1, validade TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, codigo)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS funcionarios (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL, cargo TEXT NOT NULL DEFAULT '',
        salario_base REAL NOT NULL DEFAULT 0,
        horario_entrada TEXT DEFAULT '08:00',
        horario_saida TEXT DEFAULT '17:00',
        carga_horaria REAL DEFAULT 8,
        dias_semana TEXT DEFAULT '1,2,3,4,5',
        tolerancia_minutos INTEGER DEFAULT 10,
        dias_trabalho_mes INTEGER DEFAULT 26,
        data_admissao TEXT, telefone TEXT, cpf TEXT,
        pin TEXT, foto_url TEXT, face_descriptor TEXT,
        status TEXT NOT NULL DEFAULT 'ativo',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS func_pontos (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL, data TEXT NOT NULL,
        hora TEXT NOT NULL, tipo TEXT NOT NULL,
        ip TEXT, user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS func_eventos (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL, data TEXT NOT NULL,
        tipo TEXT NOT NULL, horas_ausentes REAL DEFAULT 0,
        observacao TEXT, arquivo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS func_adiantamentos (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL, valor REAL NOT NULL DEFAULT 0,
        motivo TEXT, data TEXT DEFAULT CURRENT_DATE::text,
        descontado INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS func_ajustes_salario (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL, tipo TEXT NOT NULL,
        valor REAL NOT NULL DEFAULT 0, motivo TEXT,
        data TEXT DEFAULT CURRENT_DATE::text,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS func_horas_extras (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL, data TEXT NOT NULL,
        minutos INTEGER NOT NULL DEFAULT 0, observacao TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cancelado_por INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS estoque_reposto INTEGER DEFAULT 0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS estoque_reposto_at TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolso_status TEXT DEFAULT 'nenhum';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_reembolsado REAL DEFAULT 0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolsado_at TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolso_motivo TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolsado_por INTEGER;
      CREATE TABLE IF NOT EXISTS pedido_eventos (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER NOT NULL,
        tenant_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT,
        valor REAL DEFAULT 0,
        motivo TEXT,
        estoque_reposto INTEGER DEFAULT 0,
        payload TEXT,
        usuario_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY(pedido_id) REFERENCES pedidos(id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_date      ON pedidos(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_tenant_date   ON pagamentos(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_despesas_tenant_date     ON despesas(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_tenant_date  ON estoque_movimentacoes(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_date  ON system_logs(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido    ON pedido_eventos(pedido_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_pedido_eventos_tenant    ON pedido_eventos(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_itens_pedido_tenant      ON itens_pedido(tenant_id, order_id);
      CREATE INDEX IF NOT EXISTS idx_caixa_tenant_data        ON caixa(tenant_id, data);
      CREATE INDEX IF NOT EXISTS idx_produtos_barcode         ON produtos(codigo_barras, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_ing_barcode              ON ingredientes(codigo_barras, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_prod_grupos              ON produto_grupos_opcao(produto_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_prod_opcao_itens         ON produto_opcao_itens(grupo_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_motoboys_tenant ON delivery_motoboys(tenant_id);
    `);

    await client.query(`
      UPDATE comandas SET status='fechada', closed_at=NOW()
      WHERE status='aberta'
        AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date < CURRENT_DATE
    `);

    await client.query(`
      UPDATE mesas SET status='fechada', opened_at=NULL
      WHERE status='aberta'
        AND (opened_at AT TIME ZONE 'America/Sao_Paulo')::date < CURRENT_DATE
    `);

    await client.query(`DELETE FROM usuarios WHERE username='admin'`);

    console.log('Migracoes PostgreSQL concluidas.');
  } catch (err: any) {
    console.error('Erro nas migracoes:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
