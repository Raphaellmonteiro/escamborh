import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
  q1: vi.fn(),
  qAll: vi.fn(),
}))

import {
  CHATBOT_PROVIDER_SECRET_PLACEHOLDER,
  mergeChatbotProviderConfigJsonPreservingSecrets,
  redactChatbotProviderConfigJsonForClient,
} from './whatsAppChatbotService'

describe('whatsAppChatbotService provider config hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redacts sensitive provider config fields before returning them to the client', () => {
    const redacted = redactChatbotProviderConfigJsonForClient(
      JSON.stringify({
        api_key: 'gsk-secret',
        base_url: 'https://api.groq.com/openai/v1',
        nested: {
          accessToken: 'another-secret',
          timeout_ms: 15000,
        },
      })
    )

    expect(JSON.parse(String(redacted))).toEqual({
      api_key: CHATBOT_PROVIDER_SECRET_PLACEHOLDER,
      base_url: 'https://api.groq.com/openai/v1',
      nested: {
        accessToken: CHATBOT_PROVIDER_SECRET_PLACEHOLDER,
        timeout_ms: 15000,
      },
    })
  })

  it('preserves stored secrets when the incoming payload updates only non-sensitive fields', () => {
    const merged = mergeChatbotProviderConfigJsonPreservingSecrets(
      JSON.stringify({
        api_key: 'gsk-secret',
        base_url: 'https://api.groq.com/openai/v1',
      }),
      {
        base_url: 'https://proxy.flowpdv.local/openai/v1',
      }
    )

    expect(JSON.parse(String(merged))).toEqual({
      api_key: 'gsk-secret',
      base_url: 'https://proxy.flowpdv.local/openai/v1',
    })
  })

  it('accepts a new secret when the incoming payload explicitly provides one', () => {
    const merged = mergeChatbotProviderConfigJsonPreservingSecrets(
      JSON.stringify({
        api_key: 'gsk-old',
      }),
      {
        api_key: 'gsk-new',
        timeout_ms: 12000,
      }
    )

    expect(JSON.parse(String(merged))).toEqual({
      api_key: 'gsk-new',
      timeout_ms: 12000,
    })
  })
})
