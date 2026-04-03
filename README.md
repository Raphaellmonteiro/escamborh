# FlowPDV — Sistema de Gestão Multi-Segmento

> Sistema POS multi-tenant com suporte a diferentes tipos de negócio.

---

## 📁 Estrutura do Projeto

```
PDV RM/
├── server.ts              ← Backend Express + SQLite (toda a API)
├── restaurante.db         ← Banco SQLite (gerado automaticamente)
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── .env.example           ← Copiar para .env e preencher
├── RM PDV.bat             ← Iniciar no Windows (duplo clique)
│
└── src/
    ├── App.tsx            ← Roteador principal (~600 linhas)
    ├── main.tsx           ← Entry point React
    ├── index.css          ← Tailwind base
    ├── types.ts           ← TODOS os tipos TypeScript do projeto
    │
    ├── config/
    │   └── segmentos.ts   ← Sistema Camaleão: define comportamento por segmento
    │
    ├── components/
    │   └── ui/
    │       ├── Card.tsx   ← Componente Card + Button (reutilizáveis)
    │       └── NavItem.tsx← Item da barra lateral
    │
    ├── shared/            ← TELAS USADAS POR TODOS OS SEGMENTOS
    │   ├── index.ts
    │   ├── LoginScreen.tsx
    │   ├── POSScreen.tsx         ← PDV / Atendimento
    │   ├── OrdersScreen.tsx      ← Histórico de pedidos
    │   ├── DashboardScreen.tsx   ← Dashboard de vendas
    │   ├── FinanceScreen.tsx     ← Financeiro (despesas, caixa, repasse)
    │   ├── EstoqueScreen.tsx     ← Controle de estoque/ingredientes
    │   ├── ProductsScreen.tsx    ← Cadastro de produtos/serviços
    │   ├── AdminPanel.tsx        ← Painel super-admin
    │   ├── LicenseBlockedScreen.tsx
    │   ├── ConfiguracoesScreen.tsx
    │   └── modals/
    │       ├── OpenCaixaModal.tsx
    │       ├── CloseCaixaModal.tsx
    │       └── SolicitacaoModal.tsx
    │
    └── segments/          ← TELAS ESPECÍFICAS POR SEGMENTO
        │
        ├── restaurante/   ← 🍽️ Restaurante / Food Service
        │   ├── index.ts
        │   └── KDSScreen.tsx      ← Kitchen Display System
        │
        ├── bar/           ← 🍺 Bar / Pub  (também usado por Restaurante)
        │   ├── index.ts
        │   ├── MesasScreen.tsx    ← Gerenciamento de mesas
        │   ├── MesaCard.tsx       ← Card visual de cada mesa
        │   ├── MesaPickerModal.tsx← Selecionar mesa no PDV
        │   └── ComandaMesaModal.tsx← Comanda completa da mesa
        │
        └── barbearia/     ← ✂️ Barbearia / Salão
            ├── index.ts
            ├── types.ts           ← Tipos específicos da barbearia
            ├── AgendamentosScreen.tsx
            ├── ClientesBarberScreen.tsx
            ├── BookingPage.tsx    ← Site público de agendamento
            └── tabs/
                ├── ClientesTab.tsx
                ├── FidelidadeTab.tsx
                ├── AssinaturasTab.tsx
                ├── FuncionariosTab.tsx
                └── RepasseTab.tsx
```

---

## 🚀 Como Iniciar

### Windows — Modo Fácil
Dê **duplo clique** em **`RM PDV.bat`**

### Manual (terminal)
```bash
# 1. Instalar dependências (só na primeira vez)
npm install

# 2. Rodar o sistema
npm run dev
```

O sistema abre em: **http://localhost:3001**

---

## ➕ Adicionar um Novo Segmento

1. Crie uma pasta em `src/segments/novo-segmento/`
2. Adicione um `index.ts` com os exports
3. Registre o segmento em `src/config/segmentos.ts`
4. Importe os componentes em `App.tsx` com lazy loading se necessário

---

## 🗃️ Banco de Dados
O arquivo `restaurante.db` é gerado automaticamente na primeira execução.  
**Não envie este arquivo para o Git** — já está no `.gitignore`.

---

## 🔑 Variáveis de Ambiente
Copie `.env.example` para `.env` e preencha:
```
JWT_SECRET=sua_chave_secreta_aqui
ANTHROPIC_API_KEY=opcional_FlowAI_analise_Claude
```

## SSE e Multi-Instancia

- O estado de SSE atual fica em memoria no processo Node (`src/sse.ts`), em um mapa por tenant.
- O limite `SSE_MAX_PER_TENANT` e aplicado por replica, nao de forma global.
- Em multiplas instancias, cada replica mantem seus proprios clientes conectados e faz broadcast apenas para os clientes locais.
- Na pratica, isso significa que o SSE segue funcionando como aceleracao local, mas nao garante entrega instantanea entre replicas.
- O painel delivery e o KDS continuam com polling periodico, entao a consistencia eventual permanece mesmo quando um evento nasce em outra instancia.
- Para diagnostico leve, use `SSE_INSTANCE_ID` para identificar a replica nos logs/headers e `SSE_LOG_CONNECTIONS=1` para registrar aberturas/fechamentos de stream.
