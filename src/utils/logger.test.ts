import { describe, expect, it, vi } from 'vitest'
import { logError, logInfo } from './logger'

describe('logger', () => {
  it('redacts secrets and masks phone fields in info logs', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logInfo('whatsapp.test', {
      phone: '11987654321',
      token: 'top-secret',
      nested: {
        customerPhone: '11999887766',
      },
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'whatsapp.test',
        meta: {
          phone: '***4321',
          token: '[REDACTED]',
          nested: {
            customerPhone: '***7766',
          },
        },
      })
    )

    infoSpy.mockRestore()
  })

  it('redacts free-text secrets in error messages', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    logError('whatsapp.error', new Error('Bearer abc.def.ghi telefone 11987654321'))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'whatsapp.error',
        message: expect.stringContaining('Bearer [REDACTED]'),
      })
    )
    expect(errorSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('***4321'),
      })
    )

    errorSpy.mockRestore()
  })
})
