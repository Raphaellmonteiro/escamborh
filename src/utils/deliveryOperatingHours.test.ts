import { describe, expect, it } from 'vitest';
import {
  computeOperatingStatusFromLegacy,
  computeOperatingStatusFromWeeklySchedule,
  normalizeHorarioSemana,
  parseHmToMinutes,
} from './deliveryOperatingHours';

describe('deliveryOperatingHours', () => {
  it('parses HH:MM to minutes', () => {
    expect(parseHmToMinutes('00:00')).toBe(0);
    expect(parseHmToMinutes('23:59')).toBe(23 * 60 + 59);
    expect(parseHmToMinutes('24:00')).toBeNull();
    expect(parseHmToMinutes('9:00')).toBeNull();
    expect(parseHmToMinutes(null)).toBeNull();
  });

  it('normalizes weekly schedule with up to 2 windows per day', () => {
    const { schedule, hasAnyWindows, valid } = normalizeHorarioSemana({
      1: [
        { abertura: '10:00', fechamento: '14:30' },
        { abertura: '17:30', fechamento: '20:30' },
        { abertura: '21:00', fechamento: '22:00' },
      ],
      0: [],
    });

    expect(valid).toBe(true);
    expect(hasAnyWindows).toBe(true);
    expect(schedule[1]).toHaveLength(2);
    expect(schedule[0]).toHaveLength(0);
  });

  it('computes legacy open/close (single window + folga)', () => {
    const monday: 1 = 1;
    const statusOpen = computeOperatingStatusFromLegacy({
      nowWeekday: monday,
      nowMinutes: 11 * 60,
      horario_abertura: '10:00',
      horario_fechamento: '14:30',
      dias_folga_entrega: [],
    });
    expect(statusOpen.aberto).toBe(true);
    expect(statusOpen.proximo_fechamento).toBe('14:30');

    const statusClosed = computeOperatingStatusFromLegacy({
      nowWeekday: monday,
      nowMinutes: 15 * 60,
      horario_abertura: '10:00',
      horario_fechamento: '14:30',
      dias_folga_entrega: [],
    });
    expect(statusClosed.aberto).toBe(false);
    expect(statusClosed.proxima_abertura).toBe('10:00');

    const sunday: 0 = 0;
    const statusFolga = computeOperatingStatusFromLegacy({
      nowWeekday: sunday,
      nowMinutes: 12 * 60,
      horario_abertura: '10:00',
      horario_fechamento: '14:30',
      dias_folga_entrega: [0],
    });
    expect(statusFolga.aberto).toBe(false);
    expect(statusFolga.dia_folga_hoje).toBe(true);
  });

  it('computes weekly schedule open/close with pause between windows', () => {
    const schedule = {
      1: [
        { abertura: '10:00', fechamento: '14:30' },
        { abertura: '17:30', fechamento: '20:30' },
      ],
      0: [],
    };

    const openLunch = computeOperatingStatusFromWeeklySchedule({
      nowWeekday: 1,
      nowMinutes: 11 * 60,
      scheduleRaw: schedule,
    });
    expect(openLunch?.aberto).toBe(true);
    expect(openLunch?.proximo_fechamento).toBe('14:30');

    const closedGap = computeOperatingStatusFromWeeklySchedule({
      nowWeekday: 1,
      nowMinutes: 16 * 60,
      scheduleRaw: schedule,
    });
    expect(closedGap?.aberto).toBe(false);
    expect(closedGap?.proxima_abertura).toBe('17:30');

    const closedSunday = computeOperatingStatusFromWeeklySchedule({
      nowWeekday: 0,
      nowMinutes: 12 * 60,
      scheduleRaw: schedule,
    });
    expect(closedSunday?.aberto).toBe(false);
    expect(closedSunday?.dia_folga_hoje).toBe(true);
  });

  it('handles weekly windows crossing midnight (yesterday carry)', () => {
    const schedule = {
      5: [{ abertura: '20:00', fechamento: '02:00' }], // sexta
      6: [],
    };

    // sábado 01:00 ainda é sexta à noite
    const saturdayEarly = computeOperatingStatusFromWeeklySchedule({
      nowWeekday: 6,
      nowMinutes: 1 * 60,
      scheduleRaw: schedule,
    });
    expect(saturdayEarly?.aberto).toBe(true);
    expect(saturdayEarly?.proximo_fechamento).toBe('02:00');
  });
});

