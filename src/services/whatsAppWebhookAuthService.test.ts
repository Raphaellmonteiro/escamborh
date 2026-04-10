import { describe, expect, it } from 'vitest';
import { evaluateWhatsAppInboundWebhookAuth } from './whatsAppWebhookAuthService';

describe('evaluateWhatsAppInboundWebhookAuth', () => {
  it('accepts Evolution inbound payloads when payload.apikey matches the tenant config', () => {
    const result = evaluateWhatsAppInboundWebhookAuth({
      config: {
        provider: 'evolution_api',
        whatsappEnabled: true,
        providerConfigJson: JSON.stringify({
          apikey: 'tenant-secret',
        }),
      },
      payload: {
        event: 'messages.upsert',
        instance: 'tenant_10_abc',
        apikey: 'tenant-secret',
      },
      headers: {},
    });

    expect(result).toMatchObject({
      allowed: true,
      enforced: true,
      reason: 'validated',
      matchedIncomingSource: 'payload.apikey',
      matchedExpectedSource: 'provider_config.apikey',
    });
  });

  it('rejects configured tenants when no inbound secret is provided', () => {
    const result = evaluateWhatsAppInboundWebhookAuth({
      config: {
        provider: 'evolution_api',
        whatsappEnabled: true,
        providerConfigJson: JSON.stringify({
          apikey: 'tenant-secret',
        }),
      },
      payload: {
        event: 'messages.upsert',
        instance: 'tenant_10_abc',
      },
      headers: {},
    });

    expect(result).toMatchObject({
      allowed: false,
      enforced: true,
      reason: 'missing_auth_secret',
    });
    expect(result.expectedAuthSources).toContain('provider_config.apikey');
  });

  it('accepts explicit webhook secrets from headers for non-Evolution providers', () => {
    const result = evaluateWhatsAppInboundWebhookAuth({
      config: {
        provider: 'generic_http',
        whatsappEnabled: true,
        providerConfigJson: JSON.stringify({
          webhook_secret: 'webhook-secret',
        }),
      },
      payload: {
        event: 'message.created',
      },
      headers: {
        'x-webhook-secret': 'webhook-secret',
      },
    });

    expect(result).toMatchObject({
      allowed: true,
      enforced: true,
      reason: 'validated',
      matchedIncomingSource: 'header.x-webhook-secret',
      matchedExpectedSource: 'provider_config.webhook_secret',
    });
  });

  it('keeps the controlled fallback when the tenant has no auth material configured', () => {
    const result = evaluateWhatsAppInboundWebhookAuth({
      config: {
        provider: 'evolution_api',
        whatsappEnabled: true,
        providerConfigJson: JSON.stringify({
          base_url: 'https://example.com',
          instance: 'tenant_10_abc',
        }),
      },
      payload: {
        event: 'messages.upsert',
        instance: 'tenant_10_abc',
      },
      headers: {},
    });

    expect(result).toMatchObject({
      allowed: true,
      enforced: false,
      reason: 'auth_not_configured',
    });
  });
});
