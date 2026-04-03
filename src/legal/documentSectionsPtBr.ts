/** Seções para páginas públicas de Política de Privacidade e Termos de Uso (PT-BR). */

export type LegalDocSection = { heading: string; paragraphs: string[] };

export const PRIVACY_POLICY_SECTIONS: LegalDocSection[] = [
  {
    heading: 'Introdução',
    paragraphs: [
      'Esta Política de Privacidade descreve como tratamos dados pessoais no contexto da plataforma FlowPDV, destinada a restaurantes, hamburguerias, lanchonetes, bares e operações semelhantes, incluindo cardápio online, delivery, pedidos, RH (como ponto de funcionário), relatórios e painel administrativo.',
      'Ao utilizar o site, o sistema ou os serviços relacionados, você declara que leu e compreendeu esta política. Em caso de dúvida, utilize o canal de contato indicado ao final.',
    ],
  },
  {
    heading: 'Quem é o controlador dos dados',
    paragraphs: [
      'O controlador dos dados pessoais tratados em nome da plataforma FlowPDV é a empresa responsável pela operação do serviço, conforme identificada no site, no contrato ou no cadastro do produto (razão social, CNPJ e contatos devem ser mantidos atualizados pelo operador da plataforma).',
      'Os estabelecimentos clientes do FlowPDV também podem atuar como controladores dos dados de seus clientes (por exemplo, pedidos de delivery), seus funcionários e sua operação, utilizando o sistema como ferramenta. Nesses casos, o FlowPDV pode atuar como operador, tratando dados conforme instruções do estabelecimento e esta política, sem prejuízo das obrigações legais de cada parte.',
    ],
  },
  {
    heading: 'Quais dados podem ser coletados',
    paragraphs: [
      'Conforme o uso do sistema e as configurações de cada estabelecimento, podem ser coletados ou registrados, entre outros: identificação e contato (nome, telefone, e-mail, endereço); documentos como CPF quando informado ou necessário ao fluxo; dados de clientes do delivery e do atendimento; dados de funcionários no módulo de RH; dados operacionais do estabelecimento (cardápio, pedidos, caixa, relatórios); dados relacionados a pagamentos na medida necessária à operação e integrações; logs de acesso e de auditoria; cookies ou sessão quando aplicável; imagens ou arquivos enviados voluntariamente ao sistema.',
    ],
  },
  {
    heading: 'Finalidades do tratamento',
    paragraphs: [
      'Os dados são utilizados para prestação do serviço (cadastro, autenticação, PDV, delivery, cardápio, RH, ponto, relatórios); comunicação operacional e de suporte; cumprimento de obrigações legais; segurança e prevenção a fraudes; melhoria técnica (estabilidade, desempenho); e exercício regular de direitos em contratos e disputas.',
    ],
  },
  {
    heading: 'Base legal',
    paragraphs: [
      'O tratamento observa as bases previstas na legislação brasileira aplicável à proteção de dados pessoais, de forma exemplificativa: execução de contrato ou procedimentos preliminares; legítimo interesse quando compatível e com balanceamento adequado; cumprimento de obrigação legal ou regulatória; consentimento quando aplicável a finalidades específicas; e hipóteses legais adicionais quando cabíveis em situação concreta.',
    ],
  },
  {
    heading: 'Compartilhamento com operadores e fornecedores',
    paragraphs: [
      'Podemos compartilhar dados com prestadores que atuam como operadores ou suboperadores (hospedagem, banco de dados, armazenamento, mensageria, pagamentos, monitoramento técnico), limitados ao necessário e sob obrigações de confidencialidade e segurança.',
      'Não vendemos dados pessoais a terceiros para fins de marketing de terceiros. Poderemos divulgar dados quando exigido por lei, ordem judicial ou autoridade competente, ou para proteger direitos e segurança, dentro do permitido em lei.',
    ],
  },
  {
    heading: 'Armazenamento e segurança',
    paragraphs: [
      'Adotamos medidas técnicas e organizacionais razoáveis para proteger dados contra acessos não autorizados, perda, alteração ou divulgação indevida. Nenhum sistema é totalmente isento de risco; em caso de incidente relevante, adotaremos procedimentos previstos em lei.',
    ],
  },
  {
    heading: 'Retenção',
    paragraphs: [
      'Mantemos os dados pelo tempo necessário para as finalidades descritas, prazos legais e resolução de disputas. Após o término, podem ser anonimizados ou eliminados, salvo quando a lei exigir guarda por prazo superior.',
    ],
  },
  {
    heading: 'Direitos do titular',
    paragraphs: [
      'Nos termos da legislação aplicável, o titular pode solicitar confirmação de tratamento, acesso, correção, eliminação ou anonimização quando aplicável, portabilidade quando cabível, informação sobre compartilhamentos e demais direitos previstos em lei.',
      'Pedidos devem ser feitos pelo canal de privacidade divulgado pelo operador da plataforma. Em relação a dados tratados diretamente pelo estabelecimento, este poderá ser o ponto de contato principal.',
    ],
  },
  {
    heading: 'Canal de contato',
    paragraphs: [
      'Utilize o e-mail de privacidade divulgado pelo operador da plataforma FlowPDV no site ou na documentação contratual. Inclua no assunto referência a “Privacidade / LGPD — FlowPDV” para agilizar o encaminhamento.',
    ],
  },
  {
    heading: 'Clientes do sistema e usuários do delivery',
    paragraphs: [
      'Estabelecimentos são responsáveis pela veracidade dos dados inseridos e pela legalidade do tratamento em relação aos seus clientes e funcionários, incluindo avisos próprios quando exigidos.',
      'Usuários finais do cardápio ou delivery fornecem dados para execução do pedido e operação do estabelecimento, também conforme esta política na parte relativa à infraestrutura do FlowPDV.',
    ],
  },
  {
    heading: 'Dados de funcionários (RH)',
    paragraphs: [
      'O módulo de RH trata dados inseridos pelo estabelecimento, em geral vinculados à relação de trabalho e obrigações legais. O estabelecimento define o que cadastra e para quais finalidades; o FlowPDV viabiliza a ferramenta e o tratamento necessário à prestação do serviço.',
    ],
  },
  {
    heading: 'Menores de idade',
    paragraphs: [
      'O FlowPDV não é direcionado a crianças para coletar dados de forma intencional. Em pedidos de delivery, quem informa dados costuma ser o responsável pelo pedido. Se houver tratamento inadequado de dados de menores sem base legal adequada, adotaremos medidas de revisão ou eliminação, conforme aplicável.',
    ],
  },
  {
    heading: 'Cookies, sessão e atualizações',
    paragraphs: [
      'Utilizamos cookies e mecanismos de sessão necessários para login, segurança e funcionamento técnico. Você pode configurar o navegador para bloquear cookies; algumas funcionalidades podem ser afetadas.',
      'Esta política pode ser atualizada; a data da última revisão aparece no topo da página. Alterações relevantes podem ser comunicadas por e-mail, aviso no sistema ou publicação no site.',
    ],
  },
];

export const TERMS_OF_USE_SECTIONS: LegalDocSection[] = [
  {
    heading: 'Objeto',
    paragraphs: [
      'Estes Termos de Uso regulam o acesso e o uso da plataforma FlowPDV (SaaS) para operação de restaurantes, lanchonetes, bares e delivery/balcão, com recursos como painel administrativo, pedidos, PDV, delivery, cardápio online, RH, ponto de funcionário, relatórios e configurações.',
      'O detalhamento comercial (plano, preço, prazo) pode constar em proposta, pedido ou contrato separado. Em caso de conflito sobre matéria estritamente comercial, prevalece o documento específico, salvo disposição legal imperativa em contrário.',
    ],
  },
  {
    heading: 'Usuário e cliente',
    paragraphs: [
      'Cliente: pessoa jurídica (ou empreendedor individual, quando aplicável) que contrata ou utiliza o FlowPDV em nome do estabelecimento.',
      'Usuário: pessoa física autorizada pelo Cliente a acessar a plataforma. O Cliente é responsável por todos os atos praticados por seus Usuários.',
    ],
  },
  {
    heading: 'Acesso, login e senha',
    paragraphs: [
      'O Cliente e cada Usuário são responsáveis pela confidencialidade das credenciais. Comunique imediatamente qualquer uso suspeito. O FlowPDV pode adotar medidas razoáveis de segurança (por exemplo, bloqueio temporário após tentativas falhas).',
    ],
  },
  {
    heading: 'Uso adequado',
    paragraphs: [
      'É vedado utilizar o sistema para fins ilícitos, fraudes, acesso não autorizado, engenharia reversa não permitida, sobrecarga intencional da plataforma, ou inserção de conteúdo ilegal ou que viole direitos de terceiros.',
      'O Cliente é responsável pelo conteúdo inserido e pelas decisões operacionais tomadas com base no sistema.',
    ],
  },
  {
    heading: 'Responsabilidades do estabelecimento',
    paragraphs: [
      'O Cliente declara legitimidade para tratar os dados que inserir e obriga-se a manter cadastros corretos, definir permissões adequadas, cumprir leis aplicáveis (consumidor, trabalho, fiscal, proteção de dados) e manter integrações e equipamentos necessários.',
      'O uso do RH e do ponto não dispensa o cumprimento da legislação trabalhista; o Cliente permanece responsável pela relação com sua equipe.',
    ],
  },
  {
    heading: 'Responsabilidades da plataforma',
    paragraphs: [
      'O FlowPDV compromete-se a disponibilizar a plataforma conforme estes Termos e o documento comercial, com esforço razoável de manutenção e suporte nos termos contratados.',
      'O FlowPDV não substitui assessoria jurídica, contábil ou fiscal. Relatórios e telas são ferramentas de apoio; a conferência final de obrigações é do Cliente.',
    ],
  },
  {
    heading: 'Disponibilidade e manutenção',
    paragraphs: [
      'Buscamos manter o serviço disponível de forma contínua, podendo haver interrupções por manutenção programada (com aviso quando razoável), manutenção urgente, ou fatos fora do controle razoável (rede do Cliente, provedores de nuvem, caso fortuito ou força maior).',
      'Funcionalidades podem ser atualizadas ou descontinuadas com aviso quando aplicável.',
    ],
  },
  {
    heading: 'Dados e integrações de terceiros',
    paragraphs: [
      'Os dados inseridos pelo Cliente são armazenados conforme a Política de Privacidade e medidas de segurança adotadas.',
      'Integrações com pagamentos ou outros serviços de terceiros, quando existentes, seguem os termos desses fornecedores.',
    ],
  },
  {
    heading: 'Propriedade intelectual',
    paragraphs: [
      'A plataforma, software, marca e materiais associados são de propriedade do FlowPDV ou licenciadores. É concedida licença de uso não exclusiva, intransferível e limitada ao período e escopo contratados.',
      'O conteúdo inserido pelo Cliente permanece de sua titularidade ou de terceiros de quem detenha direitos; o Cliente concede licença limitada para hospedar e processar esse conteúdo para prestar o serviço.',
    ],
  },
  {
    heading: 'Limites de responsabilidade',
    paragraphs: [
      'Na máxima extensão permitida em lei, o FlowPDV não se responsabiliza por lucros cessantes, danos indiretos ou consequenciais, decisões comerciais do Cliente ou disputas entre o Cliente e terceiros.',
      'Quando houver responsabilidade cabível, poderá haver limitação ao valor pago pelo serviço em período contratual definido no instrumento comercial ou nestes Termos, exceto onde a lei proíba.',
    ],
  },
  {
    heading: 'Cancelamento, suspensão e bloqueio',
    paragraphs: [
      'Cancelamento ou não renovação segue as regras do documento comercial.',
      'O FlowPDV pode suspender o acesso em caso de inadimplemento relevante, risco à segurança, uso indevido destes Termos ou da lei, ou ordem judicial, com aviso quando possível salvo urgência ou fraude evidente.',
    ],
  },
  {
    heading: 'Aceitação eletrônica e alterações',
    paragraphs: [
      'A aceitação pode ocorrer por clique, cadastro com confirmação ou uso continuado após publicação de versão atualizada com aviso razoável, conforme aplicável.',
      'Os Termos podem ser alterados; alterações relevantes serão comunicadas por meios razoáveis. O uso continuado após a vigência pode constituir aceitação.',
    ],
  },
  {
    heading: 'Foro e disposições gerais',
    paragraphs: [
      'Aplicam-se as leis da República Federativa do Brasil. Fica eleito o foro da comarca indicada pelo operador da plataforma no contrato ou no site, salvo competência absoluta de outro foro pela legislação consumerista, trabalhista ou de juizados especiais.',
      'Se alguma cláusula for inválida, as demais permanecem válidas na medida do possível. A tolerância a descumprimento não implica renúncia a direitos.',
    ],
  },
];
