export type OnboardingActionType = 'click' | 'create' | 'view';

export type OnboardingStepConfig = {
  id: string;
  /** Seletor CSS do elemento a destacar (ex.: [data-onboarding-target="x"]) */
  targetSelector: string;
  /** Texto principal do passo */
  body: string;
  /** Título curto opcional */
  title?: string;
  /** Consumido pela tela host (ex.: troca de aba no RH) */
  activateTab?: string;
  /** Exige ação real antes de “Próximo” */
  requireAction?: boolean;
  /** Tipo semântico da ação (documentação + futuros filtros) */
  actionType?: OnboardingActionType;
  /**
   * Identificador da ação; deve bater com o que o host emite em `completeAction` / `emitOnboardingAction`.
   * Ex.: rh.create.funcionario, rh.click.bater-ponto, rh.view.tab.espelho
   */
  actionTarget?: string;
};

export type OnboardingPersistedV1 = {
  v: 1;
  /** true após “Pular” ou concluir o último passo */
  finished: boolean;
  /** Índice do passo atual (0-based), persistido para retomar */
  step: number;
};

export type OnboardingPersistedV2 = {
  v: 2;
  finished: boolean;
  step: number;
  /** ids de passos cuja ação obrigatória já foi cumprida */
  actionsDone: Record<string, boolean>;
};

export type OnboardingPersisted = OnboardingPersistedV1 | OnboardingPersistedV2;
