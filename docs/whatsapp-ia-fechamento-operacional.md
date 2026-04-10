# WhatsApp IA - Fechamento Operacional

## Objetivo desta etapa

Concluir o fechamento operacional do modulo WhatsApp IA sem abrir nova feature, removendo desalinhamento entre backend e UI, preparando a validacao positiva real com tenant ativo e registrando o que ainda permanece apenas por compatibilidade temporaria.

## Contrato atual do modulo

- Painel de configuracao do chatbot por tenant em `GET /api/whatsapp/ai` e `PUT /api/whatsapp/ai`.
- Alias legado temporario em `GET|PUT /api/chatbot`, apontando para o mesmo router.
- Webhook principal de inbound em `POST /api/webhooks/whatsapp/inbound/:tenantId/:eventName?`.
- Adaptador legado em `POST /api/webhooks/whatsapp`, que autentica quando houver segredo configurado e reencaminha para a trilha principal.
- Operacao de conversas em `GET /api/whatsapp/conversations`, `GET /api/whatsapp/conversations/:phone` e `POST /api/whatsapp/conversations/:phone/send`.

## Compatibilidades temporarias mantidas

### Pode ficar apenas marcado para remocao posterior

1. `/api/chatbot`
Motivo: alias legado explicito enquanto clientes e observabilidade migram para `/api/whatsapp/ai`.
Condicao para remover: confirmar que nao ha mais consumo ativo pelo alias e acompanhar erros/volume por uma janela de observabilidade.

2. `/api/webhooks/whatsapp`
Motivo: adaptador legado explicito para compatibilidade externa, delegando para `/api/webhooks/whatsapp/inbound/:tenantId/:eventName?`.
Condicao para remover: confirmar que provedores externos ja publicam direto na rota principal e manter evidencias de trafego/erros por janela de observabilidade.

3. `auth_not_configured` no `whatsAppWebhookAuthService`
Motivo: fallback controlado para tenants que ainda nao possuem segredo de inbound configurado no `provider_config_json`.
Condicao para endurecer: todos os tenants ativos com `tenant_whatsapp_config` precisam ter segredo configurado e observabilidade de rejeicao precisa estar estabilizada.

## Checklist E2E final

1. Autenticar com usuario dono ou perfil com acesso ao modulo do tenant alvo.
2. Abrir a tela WhatsApp IA e confirmar carregamento sem erro.
3. Validar retorno de `GET /api/whatsapp/ai` com `configured`, `defaults`, `config`, `runtime_context` e `payment_methods`.
4. Alterar um campo nao sensivel do chatbot, salvar e confirmar retorno positivo de `PUT /api/whatsapp/ai`.
5. Recarregar a tela e confirmar persistencia do valor salvo.
6. Validar que segredo mascarado continua preservado quando a API key nao e reenviada.
7. Confirmar que `GET /api/chatbot` responde o mesmo contrato do endpoint principal.
8. Confirmar que `PUT /api/chatbot` continua aceito como alias legado.
9. Se o tenant tiver `tenant_whatsapp_config`, validar `POST /api/webhooks/whatsapp/inbound/:tenantId/messages.upsert` com segredo correto.
10. Confirmar registro em `whatsapp_inbound_messages` para payload suportado.
11. Confirmar que eventos nao suportados retornam aceitos com motivo observavel, sem quebrar o fluxo.
12. Validar leitura de conversas em `GET /api/whatsapp/conversations`.
13. Validar abertura de uma conversa em `GET /api/whatsapp/conversations/:phone`.
14. Validar envio operacional em `POST /api/whatsapp/conversations/:phone/send` somente se o provider externo do tenant estiver realmente conectado.

## Comandos sugeridos de validacao

```powershell
npm run lint
npm run test -- src/services/whatsAppChatbotService.test.ts src/services/whatsAppWebhookAuthService.test.ts
npm run build
```

```powershell
# Subir o app localmente
npm run start
```

```powershell
# Validar contrato principal e alias legado com Bearer valido
Invoke-RestMethod -Method Get -Uri http://localhost:3001/api/whatsapp/ai -Headers @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method Get -Uri http://localhost:3001/api/chatbot -Headers @{ Authorization = "Bearer <token>" }
```

```powershell
# Persistir uma configuracao real minima do chatbot
$body = @{
  chatbot_enabled = $true
  provider = "groq"
  model = "llama-3.1-8b-instant"
  system_prompt = "Atenda em pt-BR com objetividade."
  provider_config_json = @{
    temperature = 0.2
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Put -Uri http://localhost:3001/api/whatsapp/ai `
  -Headers @{ Authorization = "Bearer <token>"; "Content-Type" = "application/json" } `
  -Body $body
```

```powershell
# Validar inbound principal com tenant configurado e segredo correto
$payload = @{
  event = "messages.upsert"
  instance = "tenant_<tenantId>_<sufixo>"
  apikey = "<segredo-do-tenant>"
  data = @{
    key = @{ id = "manual-check-001"; fromMe = $false; remoteJid = "5582999999999@s.whatsapp.net" }
    pushName = "Teste Operacional"
    message = @{ conversation = "cardapio" }
    messageTimestamp = [int][double]::Parse((Get-Date -UFormat %s))
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/webhooks/whatsapp/inbound/<tenantId>/messages.upsert `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $payload
```
