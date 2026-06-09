import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OnboardingStepConfig } from './onboardingTypes';

const PADDING = 10;
/**
 * Camadas: escurecimento captura clique fora do buraco; moldura e wrapper do painel
 * são pointer-events: none para o hit-test chegar ao DOM abaixo.
 * Padrão: abaixo de modais (z-50). Com raiseAboveModal no passo: acima do modal para máscara/painel visíveis.
 */
const Z_DIM_DEFAULT = 40;
/** > z-50 do Modal para passos com raiseAboveModal */
const Z_DIM_ABOVE_MODAL = 56;

const AUTO_ADVANCE_MS = 1100;

const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 12;
/** Fallback até o ResizeObserver medir o painel */
const DEFAULT_PANEL_W = 352;
const DEFAULT_PANEL_H = 260;
/** Mantém ao menos esta faixa do card visível ao arrastar ou clamp */
const MIN_VISIBLE = 56;

type Rect = { top: number; left: number; width: number; height: number };

type Hole = { top: number; left: number; right: number; bottom: number };

function measureTarget(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el || !(el instanceof HTMLElement)) return null;
  if (el.offsetParent === null && el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function toHole(rect: Rect): Hole {
  const t = rect.top - PADDING;
  const l = rect.left - PADDING;
  const r = rect.left + rect.width + PADDING;
  const b = rect.top + rect.height + PADDING;
  return { top: t, left: l, right: r, bottom: b };
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: Hole,
  gap: number,
): boolean {
  return !(
    a.right + gap <= b.left
    || a.left - gap >= b.right
    || a.bottom + gap <= b.top
    || a.top - gap >= b.bottom
  );
}

function overlapArea(
  a: { left: number; top: number; right: number; bottom: number },
  b: Hole,
): number {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/** Área livre “útil” na viewport se o painel for colocado neste retângulo (soma das margens ao redor). */
function viewportSlack(
  panel: { left: number; top: number; right: number; bottom: number },
  vw: number,
  vh: number,
): number {
  const m = VIEWPORT_MARGIN;
  const innerLeft = panel.left - m;
  const innerTop = panel.top - m;
  const innerRight = vw - m - panel.right;
  const innerBottom = vh - m - panel.bottom;
  return Math.max(0, innerLeft) + Math.max(0, innerTop) + Math.max(0, innerRight) + Math.max(0, innerBottom);
}

function clampKeepVisible(
  left: number,
  top: number,
  pw: number,
  ph: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const minL = MIN_VISIBLE - pw;
  const maxL = vw - MIN_VISIBLE;
  const minT = MIN_VISIBLE - ph;
  const maxT = vh - MIN_VISIBLE;
  return {
    left: Math.min(maxL, Math.max(minL, left)),
    top: Math.min(maxT, Math.max(minT, top)),
  };
}

function fitsViewport(
  left: number,
  top: number,
  pw: number,
  ph: number,
  vw: number,
  vh: number,
): boolean {
  return (
    left >= VIEWPORT_MARGIN
    && top >= VIEWPORT_MARGIN
    && left + pw <= vw - VIEWPORT_MARGIN
    && top + ph <= vh - VIEWPORT_MARGIN
  );
}

type Side = 'below' | 'above' | 'right' | 'left';

function computeAutoPosition(
  hole: Hole,
  pw: number,
  ph: number,
  vw: number,
  vh: number,
): { top: number; left: number } {
  const pwSafe = Math.max(pw, 120);
  const phSafe = Math.max(ph, 100);
  const cx = hole.left + (hole.right - hole.left) / 2;
  const cy = hole.top + (hole.bottom - hole.top) / 2;

  const proposals: { side: Side; top: number; left: number }[] = [
    {
      side: 'below',
      top: hole.bottom + PANEL_GAP,
      left: cx - pwSafe / 2,
    },
    {
      side: 'above',
      top: hole.top - PANEL_GAP - phSafe,
      left: cx - pwSafe / 2,
    },
    {
      side: 'right',
      left: hole.right + PANEL_GAP,
      top: cy - phSafe / 2,
    },
    {
      side: 'left',
      left: hole.left - PANEL_GAP - pwSafe,
      top: cy - phSafe / 2,
    },
  ];

  const panel = (p: { top: number; left: number }) => ({
    left: p.left,
    top: p.top,
    right: p.left + pwSafe,
    bottom: p.top + phSafe,
  });

  const valid: { side: Side; top: number; left: number; score: number }[] = [];

  for (const p of proposals) {
    let { left, top } = p;
    if (p.side === 'below' || p.side === 'above') {
      left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - pwSafe - VIEWPORT_MARGIN);
    } else {
      top = Math.min(Math.max(VIEWPORT_MARGIN, top), vh - phSafe - VIEWPORT_MARGIN);
    }
    const pr = panel({ left, top });
    if (!fitsViewport(left, top, pwSafe, phSafe, vw, vh)) continue;
    if (rectsOverlap(pr, hole, 4)) continue;
    const score = viewportSlack(pr, vw, vh);
    valid.push({ side: p.side, left, top, score });
  }

  if (valid.length > 0) {
    valid.sort((a, b) => b.score - a.score);
    return { top: valid[0].top, left: valid[0].left };
  }

  /** Nenhum lado cabe sem sobrepor o buraco: escolhe o que minimiza interseção com o alvo, depois maximiza slack. */
  let best: { top: number; left: number; score: number } | null = null;
  for (const p of proposals) {
    let { left, top } = p;
    if (p.side === 'below' || p.side === 'above') {
      left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - pwSafe - VIEWPORT_MARGIN);
    } else {
      top = Math.min(Math.max(VIEWPORT_MARGIN, top), vh - phSafe - VIEWPORT_MARGIN);
    }
    const c = clampKeepVisible(left, top, pwSafe, phSafe, vw, vh);
    left = c.left;
    top = c.top;
    const pr = panel({ left, top });
    const ov = overlapArea(pr, hole);
    const slack = viewportSlack(pr, vw, vh);
    const score = -ov * 1e6 + slack;
    if (!best || score > best.score) best = { left, top, score };
  }

  return best ? { top: best.top, left: best.left } : { top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN };
}

function DimAround({ rect, zDim }: { rect: Rect; zDim: number }) {
  const t = rect.top - PADDING;
  const l = rect.left - PADDING;
  const r = rect.left + rect.width + PADDING;
  const b = rect.top + rect.height + PADDING;
  const dim = 'fixed bg-black/45 pointer-events-auto';
  return (
    <>
      <div className={dim} style={{ zIndex: zDim, top: 0, left: 0, right: 0, height: Math.max(0, t) }} aria-hidden />
      <div className={dim} style={{ zIndex: zDim, top: t, left: 0, width: Math.max(0, l), height: Math.max(0, b - t) }} aria-hidden />
      <div className={dim} style={{ zIndex: zDim, top: t, left: r, right: 0, height: Math.max(0, b - t) }} aria-hidden />
      <div className={dim} style={{ zIndex: zDim, top: b, left: 0, right: 0, bottom: 0 }} aria-hidden />
    </>
  );
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
  const [panelDims, setPanelDims] = useState({ w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const autoPosRef = useRef({ top: 0, left: 0 });
  const prevRectSigRef = useRef<string>('');

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
    setDragOffset({ x: 0, y: 0 });
  }, [step?.id]);

  /** Scroll/relayout altera o alvo: offset manual deixa de bater com o novo auto-posicionamento */
  useEffect(() => {
    const sig = rect ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : '';
    if (prevRectSigRef.current !== '' && sig !== '' && sig !== prevRectSigRef.current) {
      setDragOffset({ x: 0, y: 0 });
    }
    prevRectSigRef.current = sig;
  }, [rect]);

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
    const el = panelRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) {
        setPanelDims({ w: r.width, h: r.height });
      }
    });
    ro.observe(el);
    const r0 = el.getBoundingClientRect();
    if (r0.width > 8 && r0.height > 8) {
      setPanelDims({ w: r0.width, h: r0.height });
    }
    return () => ro.disconnect();
  }, [open, step?.id]);

  useLayoutEffect(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const pw = panelDims.w;
    const ph = panelDims.h;

    if (!rect) {
      autoPosRef.current = { top: vh / 2, left: vw / 2 };
      const c = clampKeepVisible(
        vw / 2 - pw / 2,
        vh / 2 - ph / 2,
        pw,
        ph,
        vw,
        vh,
      );
      setPanelStyle({
        top: c.top,
        left: c.left,
        maxWidth: 'min(22rem, calc(100vw - 2rem))',
        transform: 'none',
      });
      return;
    }

    const hole = toHole(rect);
    const { top, left } = computeAutoPosition(hole, pw, ph, vw, vh);
    autoPosRef.current = { top, left };
    const c = clampKeepVisible(left + dragOffset.x, top + dragOffset.y, pw, ph, vw, vh);
    setPanelStyle({
      top: c.top,
      left: c.left,
      maxWidth: 'min(22rem, calc(100vw - 2rem))',
      transform: 'none',
    });
  }, [rect, panelDims.w, panelDims.h, step?.id, dragOffset.x, dragOffset.y]);

  const onDragHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panelDims.w;
    const ph = panelDims.h;
    const base = rect
      ? computeAutoPosition(toHole(rect), pw, ph, vw, vh)
      : {
          top: vh / 2 - ph / 2,
          left: vw / 2 - pw / 2,
        };
    autoPosRef.current = base;
    const cur = clampKeepVisible(base.left + dragOffset.x, base.top + dragOffset.y, pw, ph, vw, vh);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: cur.left - base.left,
      oy: cur.top - base.top,
    };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panelDims.w;
    const ph = panelDims.h;
    const { x: sx, y: sy, ox, oy } = dragStartRef.current;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const base = autoPosRef.current;
    const next = clampKeepVisible(base.left + ox + dx, base.top + oy + dy, pw, ph, vw, vh);
    setDragOffset({ x: next.left - base.left, y: next.top - base.top });
  };

  const onDragHandlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragStartRef.current = null;
    setDragging(false);
  };

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

  const zDim = step?.raiseAboveModal ? Z_DIM_ABOVE_MODAL : Z_DIM_DEFAULT;
  const zFrame = zDim + 1;
  const zRoot = zDim + 2;
  const zPanelCard = zDim + 3;

  const node = (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: zRoot }} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-body">
      {step && hole && (
        <>
          <DimAround rect={rect!} zDim={zDim} />
          <div
            className="fixed rounded-xl border-2 border-fp-accent pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
            style={{
              zIndex: zFrame,
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
            aria-hidden
          />
        </>
      )}
      {step && !hole && (
        <div className="fixed inset-0 bg-black/45 pointer-events-auto" style={{ zIndex: zDim }} aria-hidden />
      )}
      <div
        ref={panelRef}
        className={`pointer-events-none fixed rounded-2xl border border-fp-border bg-fp-card p-4 shadow-xl ${dragging ? 'will-change-[top,left]' : ''}`}
        style={{ zIndex: zPanelCard, ...panelStyle, width: 'min(22rem, calc(100vw - 2rem))' }}
      >
        <div
          role="group"
          aria-label="Mover o painel do tutorial"
          className={`pointer-events-auto mb-3 touch-none select-none space-y-2 rounded-xl border border-transparent px-0.5 py-0.5 transition-colors hover:border-fp-border/60 ${dragging ? 'cursor-grabbing border-fp-border/40 bg-fp-secondary/30' : 'cursor-grab'}`}
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerUp}
        >
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

        {/* pointer-events não é herdado: força filhos a não interceptar cliques sobre o alvo por baixo */}
        <div className="pointer-events-none [&_*]:pointer-events-none">
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
        </div>
        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2">
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
