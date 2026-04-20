import { describe, it, expect } from 'vitest'
import { sendMail, setTransport } from '../utils/mailer.js'

describe('mailer', () => {
  it('forwards sendMail to the injected transport', async () => {
    const calls = []
    setTransport({ sendMail: async (opts) => { calls.push(opts); return { messageId: 'test' } } })
    const res = await sendMail({ to: 'x@y.z', subject: 's', text: 't' })
    expect(res.messageId).toBe('test')
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe('x@y.z')
  })
})
