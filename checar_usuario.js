/**
 * Rode na raiz do projeto: node corrigir_usuario.js
 * Cria o registro em "usuarios" a partir do que já existe em "clientes"
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('restaurante.db');

// Busca todos os clientes ativos que NÃO têm entrada em usuarios
const clientes = db.prepare(`
  SELECT c.id, c.usuario, c.senha, c.senha_plain
  FROM clientes c
  WHERE NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.username = c.usuario
  )
  AND c.status = 'ativo'
`).all();

if (clientes.length === 0) {
  console.log('✅ Nenhum cliente sem usuário encontrado.');
  db.close();
  process.exit(0);
}

console.log(`Encontrados ${clientes.length} cliente(s) sem registro em usuarios:\n`);

const insert = db.prepare(`
  INSERT INTO usuarios (username, password, cargo, nome, cliente_id, ativo, token_version)
  VALUES (?, ?, 'dono', ?, ?, 1, 1)
`);

for (const c of clientes) {
  // Usa o hash que já existe em clientes (foi gerado na aprovação)
  insert.run(c.usuario, c.senha, c.usuario, c.id);
  console.log(`✅ Criado: usuario="${c.usuario}" | senha="${c.senha_plain || '(ver senha_plain no banco)'}"`);
}

db.close();
console.log('\n🎉 Pronto! Reinicie o servidor e tente logar novamente.');