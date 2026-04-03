# Backup automático do PostgreSQL (FlowPDV)

Script em Bash para Linux que gera dump em SQL com `pg_dump`, grava em `backups/` na raiz do repositório e mantém só os **7 arquivos mais recentes**.

A URL de conexão vem do ambiente — **não** coloque senhas no script.

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Preferencial; mesma convenção do `.env` do projeto (URI `postgresql://...`). |
| `DB_URL` | Alternativa se `DATABASE_URL` estiver vazio. |
| `BACKUP_DIR` | Opcional; padrão: `<raiz-do-repo>/backups`. |

## Execução manual

Na raiz do repositório (ou de qualquer pasta; o script resolve o caminho):

```bash
export DATABASE_URL="postgresql://usuario:senha@host:5432/nome_do_banco"
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

Carregando de um arquivo `.env` (sem imprimir a URL):

```bash
set -a && source .env && set +a
./scripts/backup-db.sh
```

Arquivo gerado: `backups/flowpdv_YYYYMMDD_HHMMSS.sql` (UTC).

## Agendar com cron

Exemplo: todo dia às 03:15, usuário `deploy`, projeto em `/srv/flowpdv`, log em `/var/log/flowpdv-backup.log`.

1. Garanta que `pg_dump` esteja no `PATH` do cron (ou use caminho absoluto, ex. `/usr/bin/pg_dump`).
2. Edite o crontab: `crontab -e`

```cron
15 3 * * * set -a; . /srv/flowpdv/.env; set +a; /srv/flowpdv/scripts/backup-db.sh >> /var/log/flowpdv-backup.log 2>&1
```

**Segurança:** o arquivo `.env` deve ter permissão restrita (`chmod 600`) e pertencer ao usuário que roda o cron.

Alternativa sem `source` no cron: wrapper que só exporta `DATABASE_URL` a partir de um secret manager ou de um arquivo lido pelo seu processo de deploy.

## Restaurar com `psql`

O dump é formato **plain** (SQL). Em um banco vazio (ou após recriar o banco), a partir da raiz do repo:

```bash
export DATABASE_URL="postgresql://usuario:senha@host:5432/nome_do_banco_destino"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/flowpdv_20260402_031500.sql
```

Ajuste o nome do arquivo `.sql` para o backup desejado. Em produção, faça restore em janela de manutenção e valide em staging antes.

**Nota:** `--no-owner --no-acl` no dump evita depender de roles idênticas entre origem e destino; permissões finais podem precisar ser reaplicadas conforme seu ambiente.

## Requisitos

- Linux com Bash 4+ (`mapfile`).
- Cliente PostgreSQL: `pg_dump` e, para restore, `psql`.
