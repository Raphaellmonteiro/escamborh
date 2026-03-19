// src/utils/sound.ts
// Sons via Web Audio API — sem arquivo externo, funciona offline

function getCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch { return null; }
}

function beep(freq: number, dur: number, vol: number, ctx: AudioContext, offset = 0) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + offset);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + offset + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + dur);
  osc.start(ctx.currentTime + offset);
  osc.stop(ctx.currentTime + offset + dur + 0.05);
}

/** Som de notificação de novo pedido (três tons ascendentes) */
export function playNewOrderSound() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(440, 0.14, 0.35, ctx, 0.00);
  beep(660, 0.14, 0.40, ctx, 0.18);
  beep(880, 0.22, 0.50, ctx, 0.36);
}

/** Som de confirmação simples (um tom) */
export function playConfirmSound() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(660, 0.18, 0.3, ctx, 0);
}

/** Som de alerta/atenção */
export function playAlertSound() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(880, 0.1, 0.45, ctx, 0.00);
  beep(440, 0.2, 0.45, ctx, 0.15);
}
