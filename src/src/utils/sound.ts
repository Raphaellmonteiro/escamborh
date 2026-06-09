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

// Pequena “rajada” de campainha operacional: mais agressiva e recortada.
function bellBurst(ctx: AudioContext, offset: number) {
  const baseFreq = 1100;
  const freqs = [baseFreq, baseFreq * 1.5];
  const duration = 0.18;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  // Ataque forte e corte rápido
  const t0 = ctx.currentTime + offset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.78, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    if (idx === 1) {
      osc.detune.value = 15;
    }
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  });
}

/** Som de notificação de novo pedido (três tons ascendentes) */
export function playNewOrderSound() {
  const ctx = getCtx();
  if (!ctx) return;

  // Sequência curta e insistente de “campainha”:
  // 5 rajadas fortes com intervalo curto entre elas.
  const bursts = [0, 0.25, 0.5, 0.75, 1.0];
  bursts.forEach((off) => bellBurst(ctx, off));
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
