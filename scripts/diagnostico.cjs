// diagnostico.cjs — rode com: node diagnostico.cjs
// Coloque na mesma pasta que restaurante.db
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'restaurante.db'));

console.log('\n========================================');
console.log('  DIAGNÓSTICO FlowPDV — KDS + Pedidos');
console.log('========================================\n');

// 1. Pedidos recentes (últimas 24h)
const pedidos = db.prepare(`
  SELECT id, order_number, status, observation, tipo_retirada, 
         created_at, total_amount, tenant_id
  FROM pedidos
  WHERE created_at >= datetime('now', '-24 hours', 'localtime')
  ORDER BY id DESC
  LIMIT 20
`).all();

console.log(`📋 Pedidos nas últimas 24h: ${pedidos.length}`);
if (pedidos.length === 0) {
  console.log('   ⚠️  NENHUM pedido encontrado! syncKdsItem não está rodando.');
  console.log('   → Confirme que o server.ts foi substituído e reiniciado.\n');
} else {
  pedidos.forEach(p => {
    const label = p.observation || p.tipo_retirada || '-';
    console.log(`   #${p.id} | ${p.status.padEnd(12)} | ${label.padEnd(15)} | R$${Number(p.total_amount).toFixed(2)}`);
  });
  console.log('');
}

// 2. Pedidos KDS ativos (que deveriam aparecer na cozinha)
const kdsAtivos = db.prepare(`
  SELECT id, observation, status, total_amount, created_at
  FROM pedidos
  WHERE status NOT IN ('Entregue','cancelado','Cancelado','Concluído')
    AND (tipo_retirada = 'mesa' OR observation LIKE 'Mesa %')
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log(`🍳 Pedidos KDS ativos (deveriam aparecer na cozinha): ${kdsAtivos.length}`);
if (kdsAtivos.length === 0) {
  console.log('   ⚠️  Nenhum pedido de mesa ativo no banco.');
} else {
  kdsAtivos.forEach(p => {
    console.log(`   #${p.id} | ${p.status.padEnd(12)} | ${p.observation}`);
  });
}
console.log('');

// 3. Comandas abertas
const comandas = db.prepare(`
  SELECT c.id, c.status, c.mesa_id, m.numero as mesa_numero,
    (SELECT COUNT(*) FROM itens_comanda ic WHERE ic.comanda_id = c.id) as total_itens
  FROM comandas c
  LEFT JOIN mesas m ON m.id = c.mesa_id
  WHERE c.status = 'aberta'
`).all();

console.log(`🪑 Comandas abertas: ${comandas.length}`);
comandas.forEach(c => {
  console.log(`   Mesa ${c.mesa_numero} (comanda #${c.id}) — ${c.total_itens} item(s)`);
});
console.log('');

// 4. Itens na comanda de cada mesa aberta
if (comandas.length > 0) {
  console.log('📝 Itens nas comandas:');
  comandas.forEach(c => {
    const itens = db.prepare(`
      SELECT ic.quantity, ic.price_at_time, p.name, p.category
      FROM itens_comanda ic
      JOIN produtos p ON p.id = ic.product_id
      WHERE ic.comanda_id = ?
    `).all(c.id);
    console.log(`   Mesa ${c.mesa_numero}:`);
    itens.forEach(i => {
      console.log(`     ${i.quantity}x ${i.name} (cat: ${i.category || 'SEM CATEGORIA'}) — R$${Number(i.price_at_time).toFixed(2)}`);
    });
    if (itens.length === 0) console.log('     (vazia)');
  });
  console.log('');
}

// 5. Tenants cadastrados
const tenants = db.prepare('SELECT id, usuario, nome_estabelecimento FROM clientes LIMIT 5').all();
console.log(`🏠 Tenants: ${tenants.length}`);
tenants.forEach(t => {
  console.log(`   id=${t.id} | usuario=${t.usuario} | ${t.nome_estabelecimento}`);
});
console.log('');

console.log('========================================');
console.log('  Se "Pedidos nas últimas 24h" = 0,');
console.log('  o servidor ainda está rodando o server.ts ANTIGO.');
console.log('  Pare o processo (Ctrl+C) e reinicie: tsx server.ts');
console.log('========================================\n');

db.close();
