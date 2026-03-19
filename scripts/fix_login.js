/**
 * PARE o servidor antes de rodar.
 * Rode na raiz do projeto (onde está o restaurante.db):
 *   node fix_login.js
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'restaurante.db');

console.log('📂 Abrindo banco:', dbPath);
const db = new Database(dbPath);

// ── 1. Estado antes ───────────────────────────────────────────────
console.log('\n── usuarios (ANTES) ─────────────────────────────────');
const antes = db.prepare('SELECT id, username, cargo, ativo, cliente_id, password IS NOT NULL as tem_hash FROM usuarios').all();
console.table(antes);

// ── 2. Para cada cliente ativo, garante registro correto ──────────
const clientes = db.prepare("SELECT * FROM clientes WHERE status = 'ativo'").all();
console.log(`\n✅ Clientes ativos encontrados: ${clientes.length}`);

for (const c of clientes) {
  const existente = db.prepare('SELECT id, password FROM usuarios WHERE username = ?').get(c.usuario);

  if (!existente) {
    db.prepare(`
      INSERT INTO usuarios (username, password, cargo, nome, cliente_id, ativo, token_version)
      VALUES (?, ?, 'dono', ?, ?, 1, 1)
    `).run(c.usuario, c.senha, c.nome_responsavel, c.id);
    console.log(`✅ CRIADO: ${c.usuario}`);
  } else {
    db.prepare(`
      UPDATE usuarios SET
        password     = ?,
        cargo        = COALESCE(NULLIF(cargo,''), 'dono'),
        nome         = COALESCE(NULLIF(nome,''),  ?),
        cliente_id   = ?,
        ativo        = 1,
        token_version = COALESCE(token_version, 1)
      WHERE username = ?
    `).run(c.senha, c.nome_responsavel, c.id, c.usuario);
    console.log(`🔄 ATUALIZADO: ${c.usuario}`);
  }
}

// ── 3. Valida bcrypt ──────────────────────────────────────────────
console.log('\n── Validação de senhas ───────────────────────────────');
for (const c of clientes) {
  if (!c.senha_plain) { console.log(`⚠️  ${c.usuario}: sem senha_plain`); continue; }
  const u = db.prepare('SELECT password FROM usuarios WHERE username = ?').get(c.usuario);
  if (!u) { console.log(`❌ ${c.usuario}: não encontrado!`); continue; }
  const ok = bcrypt.compareSync(c.senha_plain, u.password);
  console.log(`${ok ? '✅' : '❌'} ${c.usuario}: bcrypt ${ok ? 'OK' : 'FALHOU'} | senha="${c.senha_plain}"`);
}

// ── 4. Estado depois ──────────────────────────────────────────────
console.log('\n── usuarios (DEPOIS) ────────────────────────────────');
const depois = db.prepare('SELECT id, username, cargo, nome, ativo, cliente_id FROM usuarios').all();
console.table(depois);

db.close();
console.log('\n🎉 Pronto! Reinicie o servidor com: tsx server.ts');