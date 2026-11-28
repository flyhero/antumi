import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { base64Url } from '@antumi/protocol'
import { encryptWebPush, generateVapidKey, vapidAuthorization, vapidKeyFromJwk } from './web-push'

describe('web push', () => {
  it('encrypts as RFC 8291 section 5 does', () => {
    const body = encryptWebPush(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      { senderPrivateKey: base64Url.decode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: base64Url.decode('DGv6ra1nlYgDCS1FRnbzlw') }
    )
    // Appendix A: the 86-octet header, then the ciphertext.
    expect(base64Url.encode(body.subarray(0, 86))).toBe('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8')
    expect(base64Url.encode(body.subarray(86))).toBe('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ')
  })

  it('signs a VAPID token for the endpoint\'s origin with the key it names', () => {
    const key = vapidKeyFromJwk(generateVapidKey())!
    const header = vapidAuthorization('https://ntfy.sh/upAbc?up=1', key, 1_700_000_000_000)
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(k).toBe(key.publicKey)
    const [head, claims, signature] = token!.split('.')
    expect(JSON.parse(new TextDecoder().decode(base64Url.decode(claims!)))).toEqual({ aud: 'https://ntfy.sh', exp: 1_700_043_200, sub: 'https://github.com/flyhero/antumi' })
    const point = base64Url.decode(k!)
    const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: base64Url.encode(point.slice(1, 33)), y: base64Url.encode(point.slice(33)) }, format: 'jwk' })
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(base64Url.decode(signature!)))).toBe(true)
    expect(vapidKeyFromJwk({ kty: 'EC', crv: 'P-384' })).toBeNull()
  })
})
