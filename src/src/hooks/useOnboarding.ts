import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingPersistedV2, OnboardingStepConfig } from '../components/onboarding/onboardingTypes';

type InternalState = {
  finished: boolean;
  step: number;
  actionsDone: Record<string, boolean>;
};

function normalizePersisted(raw: unknown): InternalState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const ver = p.v;
  if (ver !== 1 && ver !== 2) return null;
  if (typeof p.finished !== 'boolean' || typeof p.step !== 'number') return null;
  const step = Math.max(0, Math.floor(p.step));
  if (ver === 2) {
    const actionsDone: Record<string, boolean> = {};
    if (p.actionsDone && typeof p.actionsDone === 'object' && !Array.isArray(p.actionsDone)) {
      for (const [k, v] of Object.entries(p.actionsDone as Record<string, unknown>)) {
        if (v === true) actionsDone[k] = true;
      }
    }
    return { finished: p.finished, step, actionsDone };
  }
  if (ver === 1) {
    return { finished: p.finished, step, actionsDone: {} };
  }
  return null;
}

function readPersisted(storageKey: string): InternalState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return normalizePersisted(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writePersisted(storageKey: string, data: OnboardingPersistedV2) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

function stepActionSatisfied(step: OnboardingStepConfig | undefined, actionsDone: Record<string, boolean>) {
  if (!step?.requireAction) return true;
  return !!actionsDone[step.id];
}

export type UseOnboardingOptions = {
  storageKey: string;
  steps: OnboardingStepConfig[];
  /** Chamado quando o índice do passo muda (ex.: trocar aba no RH) */
  onStepIndexChange?: (index: number, step: OnboardingStepConfig) => void;
};

export function useOnboarding({ storageKey, steps, onStepIndexChange }: UseOnboardingOptions) {
  const stepCount = steps.length;
  const persistedRef = useRef<InternalState | null>(null);
  if (persistedRef.current === null) {
    persistedRef.current = readPersisted(storageKey) ?? { finished: false, step: 0, actionsDone: {} };
  }

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(persistedRef.current.step);
  const [actionsDone, setActionsDone] = useState<Record<string, boolean>>(() => ({
    ...persistedRef.current.actionsDone,
  }));

  const persist = useCallback(
    (partial: Partial<Pick<OnboardingPersistedV2, 'finished' | 'step' | 'actionsDone'>>) => {
      const prev = persistedRef.current ?? { finished: false, step: 0, actionsDone: {} };
      const next: InternalState = {
        finished: partial.finished ?? prev.finished,
        step: partial.step ?? prev.step,
        actionsDone: partial.actionsDone ?? prev.actionsDone,
      };
      persistedRef.current = next;
      writePersisted(storageKey, { v: 2, ...next });
    },
    [storageKey]
  );

  const openAt = useCallback(
    (index: number, markActive: boolean) => {
      const i = Math.min(Math.max(0, index), Math.max(0, stepCount - 1));
      setStepIndex(i);
      if (markActive) {
        const prev = persistedRef.current ?? { finished: false, step: 0, actionsDone: {} };
        persist({ finished: prev.finished, step: i, actionsDone: prev.actionsDone });
      }
      if (stepCount > 0) {
        onStepIndexChange?.(i, steps[i]!);
      }
    },
    [onStepIndexChange, persist, stepCount, steps]
  );

  const shouldAutoOpen = useMemo(() => {
    const p = persistedRef.current;
    if (stepCount === 0) return false;
    if (!p) return true;
    return !p.finished;
  }, [stepCount]);

  const startGuided = useCallback(() => {
    setOpen(true);
    openAt(0, true);
  }, [openAt]);

  const tryAutoOpen = useCallback(() => {
    if (stepCount === 0) return;
    const p = persistedRef.current;
    if (p?.finished) return;
    setOpen(true);
    const start = p ? Math.min(p.step, stepCount - 1) : 0;
    openAt(start, false);
    const ad = p?.actionsDone ?? {};
    persist({ finished: false, step: start, actionsDone: ad });
  }, [openAt, persist, stepCount]);

  useEffect(() => {
    if (!open || stepCount === 0) return;
    onStepIndexChange?.(stepIndex, steps[stepIndex]!);
  }, [open, stepIndex, stepCount, steps, onStepIndexChange]);

  const completeAction = useCallback(
    (actionTarget: string) => {
      if (!actionTarget) return;
      const toMark = steps.filter((s) => s.requireAction && s.actionTarget === actionTarget);
      if (toMark.length === 0) return;
      setActionsDone((prev) => {
        const next = { ...prev };
        for (const s of toMark) {
          next[s.id] = true;
        }
        persist({ actionsDone: next });
        return next;
      });
    },
    [persist, steps]
  );

  const next = useCallback(() => {
    const cur = steps[stepIndex];
    if (cur?.requireAction && !actionsDone[cur.id]) return;
    if (stepIndex >= stepCount - 1) {
      persist({ finished: true, step: stepCount - 1, actionsDone });
      setOpen(false);
      return;
    }
    const ni = stepIndex + 1;
    setStepIndex(ni);
    persist({ step: ni, actionsDone });
    onStepIndexChange?.(ni, steps[ni]!);
  }, [actionsDone, onStepIndexChange, persist, stepCount, stepIndex, steps]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    const pi = stepIndex - 1;
    setStepIndex(pi);
    persist({ step: pi, actionsDone });
    onStepIndexChange?.(pi, steps[pi]!);
  }, [actionsDone, onStepIndexChange, persist, stepIndex, steps]);

  const skip = useCallback(() => {
    persist({ finished: true, step: stepIndex, actionsDone });
    setOpen(false);
  }, [actionsDone, persist, stepIndex]);

  const stepCompleted = useCallback(
    (index: number) => {
      const s = steps[index];
      return stepActionSatisfied(s, actionsDone);
    },
    [actionsDone, steps]
  );

  const stepPending = useCallback(
    (index: number) => {
      const s = steps[index];
      return !!s?.requireAction && !actionsDone[s.id];
    },
    [actionsDone, steps]
  );

  const currentStep = steps[stepIndex] ?? null;
  const canAdvance = stepActionSatisfied(currentStep, actionsDone);

  return {
    open,
    stepIndex,
    stepCount,
    currentStep,
    steps,
    shouldAutoOpen,
    tryAutoOpen,
    startGuided,
    next,
    back,
    skip,
    completeAction,
    stepCompleted,
    stepPending,
    canAdvance,
    actionsDone,
    /** Para testes ou integração rara */
    _persist: persist,
  };
}
