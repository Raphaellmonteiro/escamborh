import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  q1: vi.fn(),
  qRun: vi.fn(),
}));

import { q1, qRun } from '../db';
import { getTenantWhatsAppConnectionConfig } from './tenantWhatsAppConfigService';

describe('tenantWhatsAppConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills missing Evolution transport data from delivery_config into tenant_whatsapp_config', async () => {
    vi.mocked(q1)
      .mockResolvedValueOnce({
        tenant_id: 9,
        whatsapp_enabled: 0,
        provider: null,
        provider_config_json: null,
        whatsapp_number: '82981831172',
        instance_name: null,
        channel_identifier: null,
        updated_at: '2026-04-10T10:00:00.000Z',
      })
      .mockResolvedValueOnce({
        delivery_config: JSON.stringify({
          evolution_url: 'https://evo.flowpdv.local',
          evolution_token: 'tenant-token',
          evolution_phone_number: '82981831172',
        }),
        whatsapp: '82981831172',
      });

    const result = await getTenantWhatsAppConnectionConfig(9);

    expect(result).toMatchObject({
      tenantId: 9,
      whatsappEnabled: false,
      provider: 'evolution_api',
      baseUrl: 'https://evo.flowpdv.local',
      apiKey: 'tenant-token',
      instanceName: null,
      whatsappNumber: '82981831172',
      channelIdentifier: null,
    });

    expect(vi.mocked(qRun)).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(qRun).mock.calls[0];
    expect(params).toMatchObject([
      9,
      0,
      'evolution_api',
      expect.any(String),
      '82981831172',
      null,
      null,
    ]);
    expect(JSON.parse(String(params?.[3]))).toEqual({
      base_url: 'https://evo.flowpdv.local',
      apikey: 'tenant-token',
      phone_number: '82981831172',
      display_number: '82981831172',
    });
  });

  it('does not create a backfill snapshot when only a phone number exists with no transport hints', async () => {
    vi.mocked(q1)
      .mockResolvedValueOnce({
        tenant_id: 9,
        whatsapp_enabled: 0,
        provider: null,
        provider_config_json: null,
        whatsapp_number: '82981831172',
        instance_name: null,
        channel_identifier: null,
        updated_at: '2026-04-10T10:00:00.000Z',
      })
      .mockResolvedValueOnce({
        delivery_config: JSON.stringify({
          evolution_phone_number: '82981831172',
        }),
        whatsapp: '82981831172',
      });

    const result = await getTenantWhatsAppConnectionConfig(9);

    expect(result).toMatchObject({
      provider: null,
      instanceName: null,
      whatsappNumber: '82981831172',
    });
    expect(vi.mocked(qRun)).not.toHaveBeenCalled();
  });
});
