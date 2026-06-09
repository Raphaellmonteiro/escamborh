export type WeekdayJs = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DeliveryTimeWindow = {
  /** HH:MM (24h) */
  abertura: string;
  /** HH:MM (24h) */
  fechamento: string;
};

export type DeliveryHorarioSemana = Partial<Record<`${WeekdayJs}`, DeliveryTimeWindow[]>>;

export type DeliveryOperatingStatus = {
  /** Se o cardápio aceita pedidos agora. */
  aberto: boolean;
  /** Se o dia atual está configurado como "fechado o dia todo". */
  dia_folga_hoje: boolean;
  /**
   * Próximo horário de abertura (HH:MM) na agenda semanal.
   * Pode ser hoje ou em um dia futuro (no máximo 7 dias).
   */
  proxima_abertura?: string;
  /**
   * Próximo horário de fechamento (HH:MM) na agenda semanal.
   * Só vem quando `aberto=true`.
   */
  proximo_fechamento?: string;
  /**
   * Minutos até o próximo evento (abre/fecha). Útil para polling/alinhamento de refresh.
   * Pode ser 0 quando o evento é "agora" no minuto atual.
   */
  proximo_evento_em_minutos?: number;
};

type NormalizedWindow = { start: number; end: number };
type NormalizedSchedule = Record<WeekdayJs, NormalizedWindow[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseHmToMinutes(value: unknown): number | null {
  const s = String(value ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const hh = Number(s.slice(0, 2));
  const mm = Number(s.slice(3, 5));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return (hh * 60) + mm;
}

export function formatMinutesToHm(minutes: number): string {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function normalizeHorarioSemana(raw: unknown): { schedule: NormalizedSchedule; hasAnyWindows: boolean; valid: boolean } {
  const empty: NormalizedSchedule = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };

  const schedule: NormalizedSchedule = { ...empty };
  if (!raw) return { schedule, hasAnyWindows: false, valid: false };

  let src: unknown = raw;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      return { schedule, hasAnyWindows: false, valid: false };
    }
  }

  const dayWindows: Array<[WeekdayJs, unknown]> = [];

  if (Array.isArray(src)) {
    for (let i = 0; i < src.length && i < 7; i++) {
      const day = i as WeekdayJs;
      dayWindows.push([day, src[i]]);
    }
  } else if (isPlainObject(src)) {
    for (const [k, v] of Object.entries(src)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0 || n > 6) continue;
      dayWindows.push([n as WeekdayJs, v]);
    }
  } else {
    return { schedule, hasAnyWindows: false, valid: false };
  }

  let hasAnyWindows = false;
  for (const [weekday, value] of dayWindows) {
    const list = Array.isArray(value) ? value : [];
    const normalized: NormalizedWindow[] = [];

    for (const item of list) {
      if (!item) continue;
      const obj = isPlainObject(item) ? item : null;
      const start =
        parseHmToMinutes(obj?.abertura) ??
        parseHmToMinutes(obj?.inicio) ??
        parseHmToMinutes(obj?.ini) ??
        parseHmToMinutes(obj?.start);
      const end =
        parseHmToMinutes(obj?.fechamento) ??
        parseHmToMinutes(obj?.fim) ??
        parseHmToMinutes(obj?.end) ??
        parseHmToMinutes(obj?.finish);
      if (start == null || end == null) continue;
      normalized.push({ start, end });
      if (normalized.length >= 2) break;
    }

    // Ordena por início só para deixar previsível; não tenta corrigir overlaps.
    normalized.sort((a, b) => a.start - b.start);
    schedule[weekday] = normalized;
    if (normalized.length > 0) hasAnyWindows = true;
  }

  return { schedule, hasAnyWindows, valid: true };
}

function prevWeekday(day: WeekdayJs): WeekdayJs {
  return ((day + 6) % 7) as WeekdayJs;
}

function nextWeekday(day: WeekdayJs): WeekdayJs {
  return ((day + 1) % 7) as WeekdayJs;
}

function computeOpenFromSchedule(nowWeekday: WeekdayJs, nowMinutes: number, schedule: NormalizedSchedule) {
  // Retorna o menor delta (em minutos) até fechar, se estiver aberto.
  let aberto = false;
  let nextCloseDelta: number | null = null;

  // 1) Janelas do dia atual
  for (const w of schedule[nowWeekday] || []) {
    if (w.start <= w.end) {
      if (nowMinutes >= w.start && nowMinutes <= w.end) {
        aberto = true;
        const delta = w.end - nowMinutes;
        nextCloseDelta = nextCloseDelta == null ? delta : Math.min(nextCloseDelta, delta);
      }
    } else {
      // janela cruza meia-noite: hoje só conta do start até 23:59.
      if (nowMinutes >= w.start) {
        aberto = true;
        const delta = (1440 - nowMinutes) + w.end;
        nextCloseDelta = nextCloseDelta == null ? delta : Math.min(nextCloseDelta, delta);
      }
    }
  }

  // 2) Janelas do dia anterior que cruzam meia-noite e ainda estão abertas hoje
  const yday = prevWeekday(nowWeekday);
  for (const w of schedule[yday] || []) {
    if (w.start > w.end) {
      if (nowMinutes <= w.end) {
        aberto = true;
        const delta = w.end - nowMinutes;
        nextCloseDelta = nextCloseDelta == null ? delta : Math.min(nextCloseDelta, delta);
      }
    }
  }

  return { aberto, nextCloseDelta };
}

function computeNextOpenDelta(nowWeekday: WeekdayJs, nowMinutes: number, schedule: NormalizedSchedule): number | null {
  let best: number | null = null;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const day = ((nowWeekday + dayOffset) % 7) as WeekdayJs;
    const base = dayOffset * 1440;
    for (const w of schedule[day] || []) {
      const startAbs = base + w.start;
      const nowAbs = nowMinutes;
      if (dayOffset === 0 && w.start < nowMinutes) continue;
      if (dayOffset === 0 && w.start === nowMinutes) {
        // "agora": prioridade máxima
        return 0;
      }
      if (startAbs <= nowAbs) continue;
      const delta = startAbs - nowAbs;
      best = best == null ? delta : Math.min(best, delta);
    }
  }
  return best;
}

function isDayFullyClosed(nowWeekday: WeekdayJs, schedule: NormalizedSchedule): boolean {
  // Fechado o dia todo: não tem janelas que começam hoje, e também não há janela do dia anterior que siga aberta após 00:00.
  const todayWindows = schedule[nowWeekday] || [];
  if (todayWindows.length > 0) return false;

  const yday = prevWeekday(nowWeekday);
  for (const w of schedule[yday] || []) {
    if (w.start > w.end && w.end > 0) return false;
  }
  return true;
}

export function computeOperatingStatusFromWeeklySchedule(params: {
  nowWeekday: WeekdayJs;
  nowMinutes: number;
  scheduleRaw: unknown;
}): DeliveryOperatingStatus | null {
  const { schedule, hasAnyWindows, valid } = normalizeHorarioSemana(params.scheduleRaw);
  if (!valid) return null;

  const { aberto, nextCloseDelta } = computeOpenFromSchedule(params.nowWeekday, params.nowMinutes, schedule);
  const dia_folga_hoje = isDayFullyClosed(params.nowWeekday, schedule);

  if (aberto) {
    const delta = nextCloseDelta == null ? null : Math.max(0, nextCloseDelta);
    return {
      aberto: true,
      dia_folga_hoje,
      proximo_fechamento: delta == null ? undefined : formatMinutesToHm(params.nowMinutes + delta),
      proximo_evento_em_minutos: delta == null ? undefined : delta,
    };
  }

  const nextOpenDelta = hasAnyWindows ? computeNextOpenDelta(params.nowWeekday, params.nowMinutes, schedule) : null;
  return {
    aberto: false,
    dia_folga_hoje,
    proxima_abertura: nextOpenDelta == null ? undefined : formatMinutesToHm(params.nowMinutes + nextOpenDelta),
    proximo_evento_em_minutos: nextOpenDelta == null ? undefined : nextOpenDelta,
  };
}

export function computeOperatingStatusFromLegacy(params: {
  nowWeekday: WeekdayJs;
  nowMinutes: number;
  horario_abertura?: unknown;
  horario_fechamento?: unknown;
  dias_folga_entrega?: unknown;
}): DeliveryOperatingStatus {
  const diasFolga = Array.isArray(params.dias_folga_entrega)
    ? params.dias_folga_entrega
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  const dia_folga_hoje = diasFolga.includes(params.nowWeekday);
  if (dia_folga_hoje) return { aberto: false, dia_folga_hoje: true };

  const ini = parseHmToMinutes(params.horario_abertura);
  const fim = parseHmToMinutes(params.horario_fechamento);
  if (ini == null || fim == null) {
    return { aberto: true, dia_folga_hoje: false };
  }

  const t = params.nowMinutes;
  const aberto = ini <= fim ? (t >= ini && t <= fim) : (t >= ini || t <= fim);
  if (aberto) {
    // Próximo fechamento: se cruza meia-noite e estamos após ini, fecha "amanhã".
    const delta = ini <= fim
      ? (fim - t)
      : (t >= ini ? ((1440 - t) + fim) : (fim - t));
    return {
      aberto: true,
      dia_folga_hoje: false,
      proximo_fechamento: formatMinutesToHm((t + Math.max(0, delta))),
      proximo_evento_em_minutos: Math.max(0, delta),
    };
  }

  // Próxima abertura: hoje ou amanhã (máx 24h).
  const delta = ini <= fim
    ? (t < ini ? (ini - t) : ((1440 - t) + ini))
    : (t > fim && t < ini ? (ini - t) : 0);

  return {
    aberto: false,
    dia_folga_hoje: false,
    proxima_abertura: formatMinutesToHm(t + Math.max(0, delta)),
    proximo_evento_em_minutos: Math.max(0, delta),
  };
}
