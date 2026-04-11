import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendWhatsAppMessage } from './whatsAppSenderService';

function buildEvolutionConfig(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    base_url: 'https://evo.flowpdv.local',
    apikey: 'tenant-token',
    instance: 'tenant_9_whatsapp',
    phone_number: '5581999999999',
    ...overrides,
  });
}

describe('whatsAppSenderService.sendWhatsAppMessage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.WHATSAPP_PROVIDER_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends directly when the recipient already has a trusted phone number', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'msg-1' }), { status: 201 })
    );

    const result = await sendWhatsAppMessage({
      provider: 'evolution_api',
      providerConfigJson: buildEvolutionConfig(),
      to: '82981831172',
      message: 'Oi',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.flowpdv.local/message/sendText/tenant_9_whatsapp');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      number: '5582981831172',
      text: 'Oi',
    });
    expect(result).toMatchObject({
      provider: 'evolution_api',
      recipient: '5582981831172',
      responseStatus: 201,
      externalId: 'msg-1',
    });
  });

  it('resolves an Evolution @lid recipient before sending outbound text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contacts: [
              {
                id: '2946985148642@lid',
                phone: '82981831172',
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'msg-2' }), { status: 201 })
      );

    const result = await sendWhatsAppMessage({
      provider: 'evolution_api',
      providerConfigJson: buildEvolutionConfig(),
      to: '2946985148642@lid',
      message: 'Resposta automatica',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [lookupUrl, lookupInit] = fetchMock.mock.calls[0];
    expect(lookupUrl).toBe('https://evo.flowpdv.local/chat/findContacts/tenant_9_whatsapp');
    expect(JSON.parse(String(lookupInit?.body))).toEqual({
      where: {
        id: '2946985148642@lid',
      },
    });

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://evo.flowpdv.local/message/sendText/tenant_9_whatsapp');
    expect(JSON.parse(String(sendInit?.body))).toEqual({
      number: '5582981831172',
      text: 'Resposta automatica',
    });
    expect(result).toMatchObject({
      provider: 'evolution_api',
      recipient: '5582981831172',
      responseStatus: 201,
      externalId: 'msg-2',
    });
  });

  it('keeps a controlled error when an Evolution @lid recipient cannot be resolved', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ contacts: [] }), { status: 200 })
    );

    await expect(
      sendWhatsAppMessage({
        provider: 'evolution_api',
        providerConfigJson: buildEvolutionConfig(),
        to: '2946985148642@lid',
        message: 'Resposta automatica',
      })
    ).rejects.toThrow('Envio bloqueado: recipient @lid nao resolvido para telefone real');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
