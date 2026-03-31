import type { OnboardingStepConfig } from '../components/onboarding/onboardingTypes';

/** Chave única no localStorage para o tutorial do RH */
export const RH_ONBOARDING_STORAGE_KEY = 'flowpdv.rh.onboarding.v1';

/** Alvos: use os mesmos valores em data-onboarding-target no JSX */
export const RH_ONBOARDING_TARGETS = {
  novoFuncionario: 'rh-novo-funcionario',
  baterPonto: 'rh-bater-ponto',
  espelhoTab: 'rh-tab-espelho',
  espelhoMain: 'rh-espelho-main',
} as const;

/** Identificadores emitidos por `completeAction` / `emitOnboardingAction` */
export const RH_ONBOARDING_ACTIONS = {
  createFuncionario: 'rh.create.funcionario',
  clickBaterPonto: 'rh.click.bater-ponto',
  viewTabEspelho: 'rh.view.tab.espelho',
} as const;

export const RH_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'funcionarios',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.novoFuncionario}"]`,
    title: 'Funcionários',
    body: 'Cadastre seu primeiro funcionário para começar o controle de ponto e a ficha completa no RH.',
    activateTab: 'lista',
    requireAction: true,
    actionType: 'create',
    actionTarget: RH_ONBOARDING_ACTIONS.createFuncionario,
  },
  {
    id: 'registro-ponto',
    targetSelector: `[data-onboarding-target="${RH_ONBOARDING_TARGETS.baterPonto}"]`,
    title: 'Registro de ponto',
    body: 'Abra o ponto para registrar entrada e saída e ver como o time marca presença no dia a dia.',
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
