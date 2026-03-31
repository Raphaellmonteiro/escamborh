import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OnboardingStepConfig } from './onboardingTypes';

const PADDING = 10;
/** Abaixo de modais (z-50) para não cobrir fluxos críticos */
const Z_DIM = 40;
const Z_FRAME = 41;
const Z_PANEL = 42;

const AUTO_ADVANCE_MS = 1100;

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el || !(el instanceof HTMLElement)) return null;
  if (el.offsetParent === null && el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function DimAround({ rect }: { rect: Rect }) {
  const t = rect.top - PADDING;
  const l = rect.left - PADDING;
  const r = rect.left + rect.width + PADDING;
  const b = rect.top + rect.height + PADDING;
  const dim = 'fixed bg-black/45 pointer-events-auto';
  return (
    <>
      <div className={dim} style={{ zIndex: Z_DIM, top: 0, left: 0, right: 0, height: Math.max(0, t) }} aria-hidden />
      <div className={dim} style={{ zIndex: Z_DIM, top: t, left: 0, width: Math.max(0, l), height: Math.max(0, b - t) }} aria-hidden />
      <div className={dim} style={{ zIndex: Z_DIM, top: t, left: r, right: 0, height: Math.max(0, b - t) }} aria-hidden />
      <div className={dim} style={{ zIndex: Z_DIM, top: b, left: 0, right: 0, bottom: 0 }} aria-hidden />
    </>
  );
}

function clampPanelTop(desired: number, panelH: number) {
  const margin = 12;
  const maxTop = window.innerHeight - panelH - margin;
  return Math.max(margin, Math.min(desired, maxTop));
}

export function OnboardingOverlay({
  open,
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
  canGoBack,
  canAdvance,
  /** Se true, após concluir ação obrigatória avança automaticamente (após feedback breve). */
  autoAdvanceOnActionComplete = false,
}: {
  open: boolean;
  step: OnboardingStepConfig | null;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  canGoBack: boolean;
  /** Quando false e o passo exige ação, “Próximo”/“Concluir” ficam desativados */
  canAdvance: boolean;
  autoAdvanceOnActionComplete?: boolean;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [actionDoneVisible, setActionDoneVisible] = useState(false);
  const prevCanAdvanceRef = useRef(canAdvance);
  const lastStepIdRef = useRef<string | undefined>(undefined);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const remeasure = useCallback(() => {
    if (!open || !step) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
    setRect(measureTarget(step.targetSelector));
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    remeasure();
    const t0 = requestAnimationFrame(() => remeasure());
    const t1 = window.setTimeout(remeasure, 120);
    const t2 = window.setTimeout(remeasure, 320);
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      cancelAnimationFrame(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [open, step, remeasure, stepIndex]);

  useEffect(() => {
    const clearAdvanceTimer = () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };

    if (!open) {
      setActionDoneVisible(false);
      return clearAdvanceTimer;
    }

    if (!step) {
      setActionDoneVisible(false);
      return clearAdvanceTimer;
    }

    if (!step.requireAction) {
      lastStepIdRef.current = step.id;
      prevCanAdvanceRef.current = canAdvance;
      setActionDoneVisible(false);
      return clearAdvanceTimer;
    }

    if (step.id !== lastStepIdRef.current) {
      lastStepIdRef.current = step.id;
      prevCanAdvanceRef.current = canAdvance;
      setActionDoneVisible(false);
      return clearAdvanceTimer;
    }

    const becameReady = canAdvance && !prevCanAdvanceRef.current;
    prevCanAdvanceRef.current = canAdvance;

    if (!becameReady) return clearAdvanceTimer;

    setActionDoneVisible(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setActionDoneVisible(true));
    });

    if (autoAdvanceOnActionComplete) {
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        onNextRef.current();
      }, AUTO_ADVANCE_MS);
    }

    return clearAdvanceTimer;
  }, [open, step?.id, step?.requireAction, canAdvance, autoAdvanceOnActionComplete]);

  useLayoutEffect(() => {
    if (!rect) {
      setPanelStyle({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: 'min(22rem, calc(100vw - 2rem))' });
      return;
    }
    const panelW = 352;
    const panelH = 248;
    const spaceBelow = window.innerHeight - rect.top - rect.height;
    const placeBelow = spaceBelow > 140;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - panelW / 2), window.innerWidth - panelW - 16);
    const top = placeBelow
      ? clampPanelTop(rect.top + rect.height + PADDING + 8, panelH)
      : clampPanelTop(rect.top - panelH - PADDING - 8, panelH);
    setPanelStyle({
      top,
      left,
      width: panelW,
      maxWidth: 'calc(100vw - 2rem)',
      transform: 'none',
    });
  }, [rect]);

  if (!open || typeof document === 'undefined') return null;

  const isLast = stepIndex >= stepCount - 1;
  const hole = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  const progressPct =
    stepCount > 0 ? Math.min(100, Math.round(((stepIndex + 1) / stepCount) * 100)) : 0;

  const primaryCta =
    isLast ? 'Concluir' : step?.requireAction && canAdvance ? 'Continuar' : 'Próximo';

  const highlightContinue =
    canAdvance && !!step?.requireAction && !autoAdvanceOnActionComplete && !isLast;

  const node = (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: Z_PANEL }} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-body">
      {step && hole && (
        <>
          <DimAround rect={rect!} />
          <div
            className="fixed rounded-xl border-2 border-fp-accent pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
            style={{
              zIndex: Z_FRAME,
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
            aria-hidden
          />
        </>
      )}
      {step && !hole && <div className="fixed inset-0 z-40 bg-black/45 pointer-events-auto" aria-hidden />}
      <div
        className="pointer-events-auto fixed rounded-2xl border border-fp-border bg-fp-card p-4 shadow-xl"
        style={{ zIndex: Z_PANEL + 1, ...panelStyle }}
      >
        <div className="mb-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold tabular-nums text-fptext-muted">
              Passo {stepIndex + 1} de {stepCount}
            </p>
            <p className="text-[11px] font-black tabular-nums text-fptext-secondary">{progressPct}%</p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-fp-secondary" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do tutorial">
            <div
              className="h-full rounded-full bg-fp-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {step?.title ? (
          <p id="onboarding-title" className="text-xs font-black uppercase tracking-wider text-fptext-muted">
            {step.title}
          </p>
        ) : (
          <p id="onboarding-title" className="sr-only">
            Tutorial
          </p>
        )}
        <p id="onboarding-body" className={`text-sm leading-relaxed text-fptext-primary ${step?.title ? 'mt-2' : ''}`}>
          {step?.body}
        </p>
        {step?.requireAction ? (
          <div className="mt-2 min-h-[1.375rem]">
            {canAdvance ? (
              <p
                className={`flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  actionDoneVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-0.5 scale-[0.98] opacity-0'
                }`}
                role="status"
                aria-live="polite"
              >
                <span aria-hidden>✔</span>
                Ação concluída
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-400/90" role="status">
                <span aria-hidden>⏳</span>
                Pendente — faça a ação no sistema
              </p>
            )}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl px-3 py-2 text-xs font-bold text-fptext-muted transition-colors hover:bg-fp-hover hover:text-fptext-primary"
          >
            Pular tutorial
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={onBack}
              className="rounded-xl border border-fp-border bg-fp-secondary px-3 py-2 text-xs font-bold text-fptext-primary transition-colors hover:bg-fp-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={!canAdvance}
              onClick={onNext}
              title={!canAdvance && step?.requireAction ? 'Conclua a ação indicada para avançar' : undefined}
              className={`rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white transition-all duration-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
                highlightContinue
                  ? 'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-[var(--fp-bg-card)] scale-[1.02] dark:ring-emerald-400/40'
                  : ''
              }`}
            >
              {primaryCta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
