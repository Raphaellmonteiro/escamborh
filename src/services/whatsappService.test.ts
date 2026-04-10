import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./evolutionClient', () => ({
  createInstance: vi.fn(),
  connectInstance: vi.fn(),
  getConnectionState: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock('../repositories/whatsappRepository', () => ({
  createInstanceRecord: vi.fn(),
  getInstanceByTenant: vi.fn(),
  updateInstanceStatus: vi.fn(),
}));

vi.mock('./tenantWhatsAppConfigService', () => ({
  getTenantWhatsAppConnectionConfig: vi.fn(),
  isEvolutionConnectionProvider: vi.fn((provider: string | null) => provider === 'evolution_api'),
  persistTenantWhatsAppInstanceName: vi.fn(),
  sanitizeTenantWhatsAppConnectionConfigForClient: vi.fn(),
}));

import { createInstance as createEvolutionInstance } from './evolutionClient';
import { createInstanceRecord, getInstanceByTenant } from '../repositories/whatsappRepository';
import {
  getTenantWhatsAppConnectionConfig,
  persistTenantWhatsAppInstanceName,
} from './tenantWhatsAppConfigService';
import { createWhatsAppInstance } from './whatsappService';

describe('whatsappService.createWhatsAppInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstanceByTenant).mockResolvedValue(null);
    vi.mocked(createInstanceRecord).mockResolvedValue({
      id: 'instance-1',
      tenantId: 9,
      instanceName: 'tenant_9_whatsapp',
      status: null,
      connected: false,
      createdAt: '2026-04-10T10:00:00.000Z',
    });
    vi.mocked(persistTenantWhatsAppInstanceName).mockResolvedValue({
      tenantId: 9,
      whatsappEnabled: true,
      provider: 'evolution_api',
      providerConfigJson: '{"base_url":"https://evo.flowpdv.local","apikey":"tenant-token"}',
      baseUrl: 'https://evo.flowpdv.local',
      apiKey: 'tenant-token',
      instanceName: 'tenant_9_whatsapp',
      whatsappNumber: '82981831172',
      channelIdentifier: 'tenant_9_whatsapp',
      updatedAt: '2026-04-10T10:05:00.000Z',
    });
    vi.mocked(getTenantWhatsAppConnectionConfig).mockResolvedValue({
      tenantId: 9,
      whatsappEnabled: true,
      provider: 'evolution_api',
      providerConfigJson: '{"base_url":"https://evo.flowpdv.local","apikey":"tenant-token"}',
      baseUrl: 'https://evo.flowpdv.local',
      apiKey: 'tenant-token',
      instanceName: null,
      whatsappNumber: '82981831172',
      channelIdentifier: null,
      updatedAt: '2026-04-10T10:00:00.000Z',
    });
  });

  it('creates and persists an instance when the tenant is configured for Evolution', async () => {
    vi.mocked(createEvolutionInstance).mockResolvedValue({
      data: { instance: { instanceName: 'tenant_9_whatsapp' } },
      status: 201,
    });

    const result = await createWhatsAppInstance(9);

    expect(result).toEqual({
      instanceName: 'tenant_9_whatsapp',
      created: true,
      alreadyExisted: false,
    });
    expect(vi.mocked(createEvolutionInstance)).toHaveBeenCalledWith('tenant_9_whatsapp', {
      baseUrl: 'https://evo.flowpdv.local',
      apiKey: 'tenant-token',
    });
    expect(vi.mocked(createInstanceRecord)).toHaveBeenCalledWith({
      tenantId: 9,
      instanceName: 'tenant_9_whatsapp',
    });
    expect(vi.mocked(persistTenantWhatsAppInstanceName)).toHaveBeenCalledWith(
      9,
      'tenant_9_whatsapp'
    );
  });

  it('treats an already existing remote instance as an idempotent success', async () => {
    vi.mocked(createEvolutionInstance).mockRejectedValue(new Error('instance already exists'));

    const result = await createWhatsAppInstance(9);

    expect(result).toEqual({
      instanceName: 'tenant_9_whatsapp',
      created: false,
      alreadyExisted: true,
    });
    expect(vi.mocked(createInstanceRecord)).toHaveBeenCalledWith({
      tenantId: 9,
      instanceName: 'tenant_9_whatsapp',
    });
    expect(vi.mocked(persistTenantWhatsAppInstanceName)).toHaveBeenCalledWith(
      9,
      'tenant_9_whatsapp'
    );
  });
});
