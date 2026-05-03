# Modo Atendimento Mobile (WhatsApp → Pedido assistido)

## Objetivo
Reduzir o trabalho operacional do atendimento que hoje transforma mensagens do WhatsApp em pedidos no sistema, evitando que o fluxo vire apenas “a mesma tela no celular”.

**Princípio:** o mobile não é “pedido manual no celular”; é **lançamento assistido** de pedido que já nasceu numa conversa (WhatsApp), com **pré-preenchimento e atalhos**.

---

## Dor real (hoje)
Mensagem típica: “quero uma quentinha de carne de boi completa”.

O esforço do atendimento (pontos de atrito):
- digitar telefone toda vez
- identificar cliente manualmente
- redigitar endereço (mesmo quando já existe)
- montar itens e total “do zero”
- repetir o mesmo trabalho em outra tela pesada

---

## Fluxo operacional ideal (alvo)
### 1) Entrada pelo WhatsApp (com contexto)
O atendimento chega no fluxo **com o telefone já informado** (ex.: link/botão “Lançar pedido” vindo da conversa).

### 2) Identificação e pré-preenchimento automático
Ao abrir o fluxo:
- telefone já preenchido
- cliente encontrado automaticamente (se existir)
- lista de endereços do cliente carregada automaticamente (com destaque para o principal/último)

Se não existir cliente:
- cadastro rápido (nome opcional no MVP; obrigatório em etapas posteriores se a operação exigir)

### 3) Lançamento de itens “rápido e tolerante”
Foco em rapidez, não em “catálogo perfeito”:
- busca rápida de produto
- quantidade + observação por item (para capturar “completa / sem salada / etc.”)
- subtotal calculado com base no servidor (evita divergência e retrabalho)

### 4) Entrega vs retirada (sem re-trabalho)
- entrega: escolher endereço salvo **ou** digitar 1 campo “endereço completo”
- retirada: desabilita endereço e zera taxa automaticamente

### 5) Pagamento e salvar
- método de pagamento (dinheiro/pix/cartão)
- salvar pedido em 1 toque
- (futuro) enviar mensagem pronta no WhatsApp com resumo/total/status

---

## Como evitar “a mesma coisa no celular”
**Anti‑padrões a evitar:**
- exigir digitar telefone e endereço toda vez
- obrigar navegar por telas pesadas / PDV completo
- exigir montar pedido com as mesmas etapas do desktop, sem atalhos

**Regras de desenho do fluxo:**
- sempre começar por **telefone** (porque vem do WhatsApp)
- tudo que existir por telefone/cliente precisa ser **auto‑carregado**
- tudo que ainda não existir precisa ser **cadastro mínimo e inline**
- sempre ter um caminho “1 tela → salvar”, mesmo que com limitações (MVP)

---

## Primeira versão viável (MVP) — já entrega valor real
**Rota:** `GET /m/atendimento?tel=...`

### MVP (o que faz)
- mobile-first e leve
- telefone (manual ou via querystring `tel/telefone`)
- pré-busca: cliente + endereços salvos
- seleção de endereço em 1 toque (gera “endereço completo” automaticamente)
- busca rápida de produtos (somente itens simples no MVP)
- carrinho com quantidade + observação por item
- entrega/retirada + taxa de entrega
- pagamento (dinheiro/pix/cartão)
- salvar pedido via API de pedido manual do delivery

### MVP (o que **não** faz ainda)
- combos e customizações avançadas (adicionais por grupo) no mobile
- integração direta com conversa do WhatsApp (botão dentro da tela de conversas)
- parsing automático da mensagem (NLP/IA) para sugerir itens

---

## Arquitetura para pré-preenchimento (prepara evolução)
### Fonte de verdade
- Cliente: `delivery_clientes` (unificado por `tenant_id + telefone`)
- Endereços: `delivery_enderecos` (por `tenant_id + cliente_id`)

### Endpoints recomendados
- `GET /api/atendimento/prefill?telefone=...`
  - retorna `{ cliente, enderecos }` em uma chamada (reduz acoplamento do front)
- `GET /api/atendimento/produtos?q=...`
  - busca leve para não carregar catálogo inteiro
- `POST /api/atendimento/delivery/itens/validate`
  - subtotal autoritativo do servidor (evita divergência no `POST /api/delivery/pedidos`)

---

## Etapas seguintes (evolução)
1) **Atalho dentro do WhatsApp**
   - na tela de conversa, botão “Lançar pedido desse cliente” → abre `/m/atendimento?tel=...`
2) **Pré‑preenchimento por conversa**
   - usar `customerPhone` da conversa como chave
3) **Sugestão assistida de itens**
   - extrair itens da mensagem (regras simples + IA opcional) e pré-montar carrinho para confirmação
4) **Repetir último pedido**
   - “Repetir último pedido” + editar
5) **Customizações/combos no mobile**
   - suportar seleções estruturadas (`selecoes`) para combos e adicionais

---

## Riscos / compatibilidade
- **Catálogo complexo (combos/adicionais):** o MVP bloqueia combos para evitar divergência e fricção; etapa seguinte precisa suportar `selecoes`.
- **Performance:** o fluxo evita carregar o PDV completo, mas precisa manter a busca de produtos leve (endpoint dedicado).
- **Consistência de total:** o subtotal é validado no servidor antes de salvar para evitar erro de “total diverge”.
- **Governança/permissão:** rotas de atendimento ficam sob as permissões de `delivery/orders/pos` e feature `delivery`.

