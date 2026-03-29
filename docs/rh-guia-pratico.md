# FlowPDV - Guia Rapido do Modulo RH

## Visao geral
O RH do FlowPDV hoje se organiza assim:

1. `Funcionarios`: cadastro e ficha completa do colaborador.
2. `Gestao RH`: painel de triagem para alertas e pendencias.
3. `Espelho de Ponto`: operacao do dia, presenca, ocorrencias, HE e banco.
4. `Folha de Pagamento`: conferencia da competencia, pagamentos e recibos.
5. `Bater Ponto`: autoatendimento do colaborador no quiosque.

## Fluxo basico
O fluxo mais comum e este:

1. Cadastrar o colaborador em `Funcionarios`.
2. Liberar PIN, foto e, se precisar, acesso ao sistema.
3. O colaborador registra entrada/saida em `Bater Ponto`.
4. O gestor confere e corrige o mes no `Espelho de Ponto`.
5. O fechamento financeiro da competencia acontece em `Folha de Pagamento`.
6. `Gestao RH` fica como painel rapido para ver o que esta pendente e abrir a ficha certa.

## 1. Funcionarios
**Para que serve**

Serve para cadastrar e manter a ficha completa do colaborador.

**O que cadastrar/editar ali**

- Dados basicos: nome, cargo, telefone, CPF e foto.
- Contrato e jornada: salario base, tipo de contrato, horario de entrada/saida, carga horaria, dias de trabalho, tolerancia e admissao.
- Ponto: PIN para bater ponto.
- Acesso ao sistema: login, senha, nivel e permissoes.
- Gestao individual: beneficios, ferias, 13o, adiantamentos e ajustes salariais.

**Quando usar**

Use quando precisar entrar no detalhe de um funcionario especifico.

## 2. Gestao RH
**Para que serve**

Serve como painel gerencial de triagem. Nao e a area principal de edicao; ela mostra o que pede decisao.

**Quando usar**

Use para revisar rapidamente:

- ferias vencidas ou proximas do limite;
- 13o pendente;
- folha do mes em aberto ou parcialmente paga;
- banco de horas alto;
- funcionarios com pendencias.

**O que resolver ali**

- Priorizar o que precisa de acao.
- Identificar o funcionario certo.
- Abrir a ficha completa dele na aba `Funcionarios`.

Em resumo: `Gestao RH` organiza o trabalho; `Funcionarios` executa a acao detalhada.

## 3. Espelho de Ponto
**Para que serve**

E a tela operacional do dia a dia. Aqui o gestor resolve presenca, ponto, ocorrencias, hora extra e compensacao.

**Como corrigir um dia**

1. Escolha o funcionario e o mes.
2. Clique no dia no calendario ou em `resolver dia`.
3. No modal do dia, faca o ajuste necessario.

**O que pode ser feito ali**

- Editar um ponto ja registrado.
- Deletar um ponto errado.
- Lancar `ponto manual` quando a batida nao entrou.
- Registrar ocorrencia do dia.
- Aprovar hora extra.
- Usar saldo do banco de horas para compensacao.

**Como lidar com cada caso**

- `Falta`: registrar a ocorrencia de falta no dia.
- `Folga`: usar a acao de conceder folga.
- `Atestado`: registrar ocorrencia de atestado.
- `HE`: aprovar os minutos e definir o destino:
  - vai para a folha;
  - vai para o banco;
  - ou dividir entre folha e banco.
- `Compensacao`: usar o saldo do banco na data. Se quiser que o dia apareca como folga, registre a folga tambem.

**Leitura pratica**

Tudo que impacta presenca nasce aqui. O que for resolvido no Espelho depois aparece refletido na Folha.

## 4. Folha de Pagamento
**Para que serve**

Serve para fechar a competencia e registrar o que foi pago.

**Como conferir a competencia**

Confira sempre estes pontos:

- funcionario e mes/ano selecionados;
- referencia da competencia;
- proventos;
- descontos;
- liquido apurado;
- quanto ja foi pago;
- quanto ainda falta quitar.

**Como registrar pagamento ou adiantamento**

Na lateral da Folha, use `Pagamentos da competencia` e escolha:

- `Adiantamento`;
- `Pagamento parcial`;
- `Pagamento final`.

Depois informe o valor, salve e, se precisar, emita o recibo.

**Como o banco de horas aparece ali**

Na Folha o banco aparece como conferencia e ajuste administrativo:

- mostra saldo atual;
- mostra movimentacoes da competencia;
- permite ajuste manual autorizado;
- permite baixa do banco para pagamento da competencia.

Importante: compensacao do dia a dia continua sendo resolvida no `Espelho de Ponto`.

## 5. Bater Ponto
**Para que serve**

Serve para o colaborador registrar entrada e saida sem depender do gestor.

**Diferenca entre autoatendimento e gestao administrativa**

- `Autoatendimento`: o colaborador usa o quiosque `Bater Ponto`, com PIN ou reconhecimento facial, para registrar o proprio ponto e consultar o proprio espelho.
- `Gestao administrativa`: o gestor corrige, completa ou audita registros pelo `Espelho de Ponto`, usando edicao, exclusao, ponto manual, ocorrencias, HE e compensacao.

Resumo simples: o quiosque registra; o Espelho administra.

## Implementacao rapida
**Arquivos principais da UI**

- `src/App.tsx`: mostra a aba `RH` no menu e monta `RHScreen`.
- `src/shared/RHScreen.tsx`: controla as abas `Funcionarios`, `Gestao RH`, `Espelho de Ponto`, `Folha de Pagamento` e o atalho `Bater Ponto`.
- `src/routes/kiosk.ts`: entrega a pagina do quiosque de ponto em `/kiosk/ponto/:slug`.

**Servicos centrais**

- `src/services/hrManagerialService.ts`: monta alertas e regras gerenciais de ferias, 13o e beneficios.
- `src/services/payrollService.ts`: calcula a folha, status da competencia, pagamentos e banco de horas.
- `src/services/pointService.ts`: faz a edicao e exclusao administrativa de pontos.

**Rotas principais do backend**

- `/api/funcionarios` em `src/routes/rh.ts`: cadastro, edicao, foto, eventos, espelho, folha, pagamentos, hora extra, banco de horas, beneficios, ferias e 13o.
- `/api/usuarios/funcionarios` e `/api/funcionarios/:id/criar-acesso` em `src/routes/logs.ts`: consulta e criacao de acesso ao sistema.
- `/api/pontos/:pontId` em `src/routes/index.ts`: editar e deletar ponto administrativo.
- `/public/ponto/:slug/...` em `src/routes/kiosk.ts`: login do funcionario, consulta do quiosque, proximo tipo, espelho publico, cadastro facial e registro do ponto.

**Como o frontend chama essas rotas**

Hoje a tela de RH usa `fetch` direto no frontend:

- `Funcionarios` chama `/api/funcionarios`, `/api/usuarios/funcionarios` e `/api/funcionarios/:id/criar-acesso`.
- `Gestao RH` chama `/api/funcionarios` e `/api/funcionarios/painel/alertas`.
- `Espelho` chama `/api/funcionarios/:id/espelho`, `/api/funcionarios/:id/pontos-dia`, `/api/funcionarios/:id/pontos-manual`, `/api/funcionarios/:id/eventos`, `/api/funcionarios/:id/horas-extras`, `/api/funcionarios/:id/banco-horas/movimentacoes` e `/api/pontos/:id`.
- `Folha` chama `/api/funcionarios/:id/folha` e `/api/funcionarios/:id/folha/pagamentos`.
- O botao `Bater Ponto` abre `/kiosk/ponto/:slug`, e o proprio quiosque conversa com `/public/ponto/:slug/...`.

## Resumo final
Se precisar resumir em uma frase:

`Funcionarios` cadastra, `Gestao RH` prioriza, `Espelho` resolve jornada, `Folha` fecha a competencia e `Bater Ponto` registra a entrada e saida do colaborador.
