import type { OnboardingStepConfig } from '../components/onboarding/onboardingTypes';

/**
 * Chave no localStorage (v3: fluxo completo cadastro + acesso + ponto + espelho).
 * Quem já tinha concluído em v2 é migrado automaticamente ao carregar o módulo.
 */
export const RH_ONBOARDING_STORAGE_KEY = 'flowpdv.rh.onboarding.v3';

const LEGACY_RH_ONBOARDING_KEYS = ['flowpdv.rh.onboarding.v2', 'flowpdv.rh.onboarding.v1'] as const;

function migrateRhOnboardingStorageIfNeeded() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(RH_ONBOARDING_STORAGE_KEY)) return;
    for (const legacyKey of LEGACY_RH_ONBOARDING_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      const p = JSON.parse(raw) as { finished?: boolean };
      if (p?.finished === true) {
        localStorage.setItem(
          RH_ONBOARDING_STORAGE_KEY,
          JSON.stringify({ v: 2, finished: true, step: 0, actionsDone: {} }),
        );
      }
      return;
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  migrateRhOnboardingStorageIfNeeded();
}

/** Alvos: use os mesmos valores em data-onboarding-target no JSX */
export const RH_ONBOARDING_TARGETS = {
  novoFuncionario: 'rh-novo-funcionario',
  modalNovoFuncionario: 'rh-modal-novo-funcionario',
  modalDadosFuncionario: 'rh-modal-dados-funcionario',
  modalAcessoSistema: 'rh-modal-acesso-sistema',
  modalSalvarFuncionario: 'rh-modal-salvar-funcionario',
  baterPonto: 'rh-bater-ponto',
  espelhoTab: 'rh-tab-espelho',
  espelhoMain: 'rh-espelho-main',
} as const;

/** Identificadores emitidos por `completeAction` / `emitOnboardingAction` */
export const RH_ONBOARDING_ACTIONS = {
  openModalNovoFuncionario: 'rh.open.modal.novo-funcionario',
  createFuncionario: 'rh.create.funcionario',
  clickBaterPonto: 'rh.click.bater-ponto',
  viewTabEspelho: 'rh.view.tab.espelho',
} as const;

export const RH_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'abrir-cadastro',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.novoFuncionario}"]`,
    title: 'Novo funcionário',
    body: 'Comece por aqui: abra o cadastro para incluir o colaborador no RH. Você avança assim que o modal abrir.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'click',
    actionTarget: RH_ONBOARDING_ACTIONS.openModalNovoFuncionario,
  },
  {
    id: 'cadastro-dados-jornada',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.modalDadosFuncionario}"]`,
    title: 'Dados e jornada',
    body:
      'Preencha nome, cargo e salário base, tipo de contrato, horários de entrada e saída, carga diária, dias da semana e demais campos da ficha. Defina também o PIN usado no quiosque para bater ponto — quem só marca presença pode precisar só do PIN, sem login no sistema.',
    activateTab: 'lista',
    requireAction: false,
    raiseAboveModal: true,
  },
  {
    id: 'cadastro-acesso-sistema',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.modalAcessoSistema}"]`,
    title: 'Acesso ao sistema',
    body:
      'Se o funcionário for usar o FlowPDV (login no caixa, configurações, etc.), ative “Acesso ao Sistema” e configure login, senha e nível (atendente, gerente ou dono). Revise as abas permitidas. Se não precisar de login, deixe desligado — o PIN de ponto continua valendo separado.',
    activateTab: 'lista',
    requireAction: false,
    raiseAboveModal: true,
  },
  {
    id: 'salvar-funcionario',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.modalSalvarFuncionario}"]`,
    title: 'Salvar cadastro',
    body: 'Confira os dados e clique em Salvar para criar o colaborador. Com o cadastro certo (incluindo PIN e acesso, se aplicável), o time já pode registrar ponto.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'create',
    actionTarget: RH_ONBOARDING_ACTIONS.createFuncionario,
    raiseAboveModal: true,
  },
  {
    id: 'registro-ponto',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.baterPonto}"]`,
    title: 'Registro de ponto',
    body: 'Depois do cadastro, o colaborador pode marcar entrada e saída pelo quiosque. Use o atalho para abrir o ponto em nova aba e ver como funciona no dia a dia.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'click',
    actionTarget: RH_ONBOARDING_ACTIONS.clickBaterPonto,
  },
  {
    id: 'espelho-aba',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.espelhoTab}"]`,
    title: 'Espelho de ponto',
    body: 'Abra a aba Espelho de Ponto para acompanhar a jornada da equipe no calendário.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'view',
    actionTarget: RH_ONBOARDING_ACTIONS.viewTabEspelho,
  },
  {
    id: 'espelho-area-principal',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.espelhoMain}"]`,
    title: 'Conferir e corrigir',
    body:
      'Nesta área você vê resumo do período, ajusta ocorrências (faltas, atrasos, folgas, ponto manual, horas extras) e conferência mensal. É daqui que a operação do ponto fica consistente antes da folha.',
    activateTab: 'espelho',
    requireAction: false,
  },
];
