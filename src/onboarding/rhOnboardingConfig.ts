import type { OnboardingStepConfig } from '../components/onboarding/onboardingTypes';

/** Chave no localStorage — v2: fluxo em 4 passos (abrir modal → salvar → ponto → espelho) */
export const RH_ONBOARDING_STORAGE_KEY = 'flowpdv.rh.onboarding.v2';

/** Alvos: use os mesmos valores em data-onboarding-target no JSX */
export const RH_ONBOARDING_TARGETS = {
  novoFuncionario: 'rh-novo-funcionario',
  modalNovoFuncionario: 'rh-modal-novo-funcionario',
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
    body: 'Clique em Novo Funcionário para abrir o cadastro. Você avança assim que o modal abrir.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'click',
    actionTarget: RH_ONBOARDING_ACTIONS.openModalNovoFuncionario,
  },
  {
    id: 'salvar-funcionario',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.modalNovoFuncionario}"]`,
    title: 'Cadastro',
    body: 'Preencha os dados essenciais e salve para criar o colaborador no RH.',
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
    body: 'Abra o ponto para registrar entrada e saída e ver como o time marca presença no dia a dia.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'click',
    actionTarget: RH_ONBOARDING_ACTIONS.clickBaterPonto,
  },
  {
    id: 'espelho',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.espelhoTab}"]`,
    title: 'Espelho de ponto',
    body: 'Acesse o espelho para acompanhar jornada, ocorrências e banco de horas da equipe.',
    requireAction: true,
    actionType: 'view',
    actionTarget: RH_ONBOARDING_ACTIONS.viewTabEspelho,
  },
];
