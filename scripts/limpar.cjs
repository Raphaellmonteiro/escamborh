/**
 * limpar.cjs — Limpeza da Tela da Cozinha (KDS)
 *
 * USO:
 *   node limpar.cjs             → limpa TODOS os pedidos ativos da KDS
 *   node limpar.cjs --mesa 3    → limpa apenas pedidos da Mesa 3
 *   node limpar.cjs --duplicatas → remove apenas duplicatas (mantém o mais recente por mesa)
 *   node limpar.cjs --dry-run   → mostra o que seria apagado sem alterar nada
 */

const Database = require('better-sqlite3');
const path = require('path');

// ── Localiza o banco de dados ────────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, 'restaurante.db');

let db;
try {
  db = new Database(DB_PATH);
} catch (e) {
  console.error(`❌ Não foi possível abrir o banco: ${DB_PATH}`);
  console.error(e.message);
  process.exit(1);
}

// ── Lê argumentos da linha de comando ───────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun     = args.includes('--dry-run');
const isDuplicatas = args.includes('--duplicatas');
const mesaIdx      = args.indexOf('--mesa');
const mesaNum      = mesaIdx !== -1 ? args[mesaIdx + 1] : null;

console.log('\n🍽️  FlowPDV — Limpeza da Tela da Cozinha (KDS)');
console.log('═══════════════════════════════════════════════');
if (isDryRun) console.log('⚠️  MODO DRY-RUN — nenhuma alteração será feita\n');

// ── Lista pedidos ativos atualmente na KDS ───────────────────────────────────
const ativos = db.prepare(`
  SELECT id, order_number, status, observation, senha_pedido, created_at
  FROM pedidos
  WHERE status NOT IN ('Entregue','cancelado','Cancelado','Concluído')
  ORDER BY created_at ASC
`).all();

if (ativos.length === 0) {
  console.log('✅ Tela da cozinha já está vazia. Nada para limpar.');
  process.exit(0);
}

console.log(`📋 Pedidos ativos encontrados: ${ativos.length}\n`);
for (const p of ativos) {
  console.log(`  #${p.id} | ${p.status.padEnd(12)} | Senha: ${String(p.senha_pedido||'—').padStart(3)} | ${p.observation || '—'} | ${p.created_at}`);
}
console.log('');

// ── Modo: remover apenas duplicatas ─────────────────────────────────────────
if (isDuplicatas) {
  console.log('🔍 Modo: remover duplicatas por mesa...\n');
  const byMesa = new Map();
  for (const p of ativos) {
    const key = (p.observation || '').startsWith('Mesa ') ? p.observation : null;
    if (!key) continue;
    if (!byMesa.has(key)) byMesa.set(key, []);
    byMesa.get(key).push(p);
  }

  let removidos = 0;
  for (const [mesa, pedidos] of byMesa.entries()) {
    if (pedidos.length <= 1) continue;
    // Ordena por id desc, mantém o mais recente
    pedidos.sort((a, b) => b.id - a.id);
    const [manter, ...remover] = pedidos;
    console.log(`  ${mesa}: mantendo #${manter.id} (${manter.status}), removendo ${remover.map(p => `#${p.id}`).join(', ')}`);
    if (!isDryRun) {
      for (const p of remover) {
        db.prepare("UPDATE pedidos SET status = 'Entregue' WHERE id = ?").run(p.id);
      }
    }
    removidos += remover.length;
  }

  if (removidos === 0) {
    console.log('  ✅ Nenhuma duplicata encontrada.');
  } else {
    console.log(`\n${isDryRun ? '🔵 [dry-run]' : '✅'} ${removidos} duplicata(s) ${isDryRun ? 'seriam removidas' : 'removidas'}.`);
  }
  process.exit(0);
}

// ── Modo: limpar mesa específica ─────────────────────────────────────────────
if (mesaNum) {
  const label = `Mesa ${mesaNum}`;
  const alvo = ativos.filter(p => p.observation === label);

  if (alvo.length === 0) {
    console.log(`⚠️  Nenhum pedido ativo encontrado para "${label}".`);
    process.exit(0);
  }

  console.log(`🗑️  Limpando ${alvo.length} pedido(s) da ${label}...`);
  if (!isDryRun) {
    const stmt = db.prepare("UPDATE pedidos SET status = 'Entregue' WHERE id = ?");
    for (const p of alvo) {
      stmt.run(p.id);
      console.log(`  ✅ #${p.id} marcado como Entregue`);
    }
  } else {
    for (const p of alvo) console.log(`  🔵 [dry-run] #${p.id} seria marcado como Entregue`);
  }
  console.log(`\n${isDryRun ? '🔵 [dry-run] ' : ''}${label} limpa da tela da cozinha.`);
  process.exit(0);
}

// ── Modo padrão: limpar TUDO ─────────────────────────────────────────────────
console.log(`🗑️  Limpando TODOS os ${ativos.length} pedido(s) ativos da KDS...\n`);

if (!isDryRun) {
  db.prepare(`
    UPDATE pedidos
    SET status = 'Entregue'
    WHERE status NOT IN ('Entregue','cancelado','Cancelado','Concluído')
  `).run();

  console.log(`✅ Tela da cozinha limpa com sucesso!`);
  console.log(`   ${ativos.length} pedido(s) marcados como "Entregue".`);
} else {
  console.log(`🔵 [dry-run] ${ativos.length} pedido(s) seriam marcados como "Entregue".`);
}

console.log('\n═══════════════════════════════════════════════\n');
