import { describe, expect, it } from 'vitest';

import { normalizeTenantPlan } from './planFeatures';

describe('normalizeTenantPlan', () => {
  it('accepts canonical stored values', () => {
    expect(normalizeTenantPlan('basico')).toBe('basico');
    expect(normalizeTenantPlan('basico_delivery')).toBe('basico_delivery');
    expect(normalizeTenantPlan('completo')).toBe('completo');
    expect(normalizeTenantPlan('trial')).toBe('trial');
  });

  it('normalizes common labels/aliases for básico + delivery', () => {
    expect(normalizeTenantPlan('Básico + Delivery')).toBe('basico_delivery');
    expect(normalizeTenantPlan('Basico + Delivery')).toBe('basico_delivery');
    expect(normalizeTenantPlan('basico delivery')).toBe('basico_delivery');
    expect(normalizeTenantPlan('basico-delivery')).toBe('basico_delivery');
    expect(normalizeTenantPlan(' basico  +  delivery ')).toBe('basico_delivery');
  });

  it('keeps legacy billing aliases mapped to completo', () => {
    expect(normalizeTenantPlan('mensal')).toBe('completo');
    expect(normalizeTenantPlan('trimestral')).toBe('completo');
    expect(normalizeTenantPlan('anual')).toBe('completo');
  });
});

