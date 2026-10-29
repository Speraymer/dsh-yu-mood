import test from 'node:test'
import assert from 'node:assert/strict'
import { trustedRequestOrigin } from '../lib/http.mjs'

test('写接口只接受桌面端、无 Origin 的本机调用或同源网页', () => {
  assert.equal(trustedRequestOrigin({ headers: {} }), true)
  assert.equal(trustedRequestOrigin({ headers: { origin: 'dsh-app://app' } }), true)
  assert.equal(trustedRequestOrigin({ headers: { origin: 'http://127.0.0.1:8317', host: '127.0.0.1:8317' } }), true)
  assert.equal(trustedRequestOrigin({ headers: { origin: 'https://evil.example', host: '127.0.0.1:8317' } }), false)
  assert.equal(trustedRequestOrigin({ headers: { origin: 'not a url', host: '127.0.0.1:8317' } }), false)
})
