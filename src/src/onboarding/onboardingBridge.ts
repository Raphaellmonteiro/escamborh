/** Evento global para telas registrarem conclusão de ações do onboarding sem acoplar ao hook. */
export const ONBOARDING_ACTION_EVENT = 'flowpdv-onboarding-action';

export function emitOnboardingAction(target: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_ACTION_EVENT, { detail: { target } }));
}
